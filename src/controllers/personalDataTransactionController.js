import {
  kanonisiereFilmLoeschIds,
  planeFilmBatchLoeschung,
  planeMasterErsetzung,
  planeMustwatchLoeschung,
} from "../lib/libraryProjection.js";
import { captureStorageContext } from "../lib/storage.js";

/* Gerätelokale Startwahl als vorbereiteter Schritt: Erst wenn alle drei Werte
   geschrieben sind, darf die Daten-Transaktion beginnen. Deren Fehler kann
   anschließend über rollback() die exakten vorherigen Werte zurücksetzen. */
export function bereiteStartwahlVor({ storage, wahl, startKey, versionKey, seedKey, version }) {
  let vorherStart = null, vorherVersion = null, vorherSeed = null, snapshotOk = false;
  const rollback = () => {
    if (!snapshotOk) return false;
    try {
      for (const [key, wert] of [
        [startKey, vorherStart], [versionKey, vorherVersion], [seedKey, vorherSeed],
      ]) {
        if (wert == null) storage.removeItem(key); else storage.setItem(key, wert);
      }
      return true;
    } catch { return false; }
  };
  try {
    vorherStart = storage.getItem(startKey);
    vorherVersion = storage.getItem(versionKey);
    vorherSeed = storage.getItem(seedKey);
    snapshotOk = true;
    storage.setItem(startKey, wahl);
    storage.setItem(versionKey, version);
    storage.removeItem(seedKey);
    return { ok: true, rollback };
  } catch {
    rollback();
    return { ok: false, rollback };
  }
}

/* Orchestriert genau die drei referenztragenden persönlichen Töpfe.

   Die Zusage ist lokal kompensierend und referenziell fail-safe ausschließlich
   für Master, Artikel und Must-Watch. Sie ist keine Crash-, Server- oder
   geräteübergreifende ACID-Transaktion und bereinigt keine anderen Töpfe.

   Sperren:  Must-Watch → Artikel → Master (immer gleich, kein Deadlock).
   Writes:   Artikel → Must-Watch → Master.
   Rollback: Must-Watch → Artikel.

   Die Write-Reihenfolge ist absichtlich nicht dieselbe wie die Sperrfolge:
   Fällt eine Kompensation aus, bleibt höchstens ein sichtbarer Rotlink übrig;
   nie ein truthy Verweis auf einen bereits entfernten MW-/Master-Datensatz. */
export function erstellePersonalDataTransactionController({
  transaktionMustwatchVorbereitet,
  transaktionArtikel,
  transaktionMaster,
  masterRef,
  artikelRef = transaktionArtikel?.basisRef,
  mustwatchRef = transaktionMustwatchVorbereitet?.basisRef,
}) {
  const ausgestellteFilmPlaene = new WeakSet();

  const planBasenAktuell = (plan) => (
    !!plan
    && ausgestellteFilmPlaene.has(plan)
    && plan.storageContext?.isCurrent?.() === true
    && masterRef?.current === plan.masterBasis
    && artikelRef?.current === plan.artikelBasis
    && mustwatchRef?.current === plan.mustwatchBasis
  );
  const planNebenbasenAktuell = (plan) => (
    !!plan
    && ausgestellteFilmPlaene.has(plan)
    && plan.storageContext?.isCurrent?.() === true
    && artikelRef?.current === plan.artikelBasis
    && mustwatchRef?.current === plan.mustwatchBasis
  );

  const stelleFilmPlanAus = ({ projektion, masterBasis, artikelBasis, mustwatchBasis, storageContext }) => {
    if (!projektion.ok || !storageContext.isCurrent()) return projektion;
    const plan = Object.freeze({
      ...projektion,
      zielIds: Object.freeze([...projektion.zielIds]),
      folgen: Object.freeze({ ...projektion.folgen }),
      masterBasis,
      artikelBasis,
      mustwatchBasis,
      storageContext,
    });
    ausgestellteFilmPlaene.add(plan);
    return plan;
  };

  const planeFilmLoeschungen = (ids) => {
    const storageContext = captureStorageContext();
    const masterBasis = masterRef?.current;
    const artikelBasis = artikelRef?.current;
    const mustwatchBasis = mustwatchRef?.current;
    const projektion = planeFilmBatchLoeschung(
      masterBasis, artikelBasis, mustwatchBasis, ids,
    );
    return stelleFilmPlanAus({
      projektion,
      masterBasis,
      artikelBasis,
      mustwatchBasis,
      storageContext,
    });
  };

  const fuehreFilmLoeschPlanAus = (plan, { meta, herkunft } = {}) => {
    if (!planBasenAktuell(plan)) return Promise.resolve(false);
    return transaktionMustwatchVorbereitet((vorher) => {
      if (vorher !== plan.mustwatchBasis || !planBasenAktuell(plan)) return null;
      return plan.mustwatch;
    }, async (mwStufe) => transaktionArtikel(
      (vorher) => vorher === plan.artikelBasis && planBasenAktuell(plan)
        ? plan.artikel
        : null,
      async () => {
        /* Die vollständige Drei-Basis-Prüfung lag unmittelbar vor dem ersten
           Artikelwrite. Ändert sich Master erst während dieses awaits, muss
           sein innerer CAS-Gate den Konflikt sichtbar ablehnen und danach die
           beiden Vorwärtsstände kompensieren. */
        if (!planNebenbasenAktuell(plan)) return false;
        if (!await mwStufe.persistiere()) return false;
        if (!planNebenbasenAktuell(plan)) {
          await mwStufe.rolleZurueck();
          return false;
        }
        const masterOk = await transaktionMaster({
          master: plan.master,
          meta,
          herkunft,
          /* Auch der leere Mastertopf wird gesetzt. delete(K.master) ist für
             diese Batchoperation ausdrücklich ausgeschlossen. */
          loeschen: false,
        }, {
          storageContext: plan.storageContext,
          erwarteteBasis: plan.masterBasis,
        });
        if (masterOk) return true;
        const mwRollbackOk = await mwStufe.rolleZurueck();
        return mwRollbackOk ? false : { ok: false, artikelRollback: false };
      },
      {
        storageContext: plan.storageContext,
        erwarteteBasis: plan.artikelBasis,
        pruefeVorWrite: () => planBasenAktuell(plan),
      },
    ), {
      storageContext: plan.storageContext,
      erwarteteBasis: plan.mustwatchBasis,
    });
  };

  const loescheFilme = (ids, optionen = {}) => {
    const ziele = kanonisiereFilmLoeschIds(ids);
    if (!ziele.ok) return Promise.resolve(false);
    if (optionen?.plan && optionen?.vorschau && optionen.plan !== optionen.vorschau) {
      return Promise.resolve(false);
    }
    const gelieferterPlan = optionen?.plan || optionen?.vorschau;
    if (gelieferterPlan) {
      if (!gelieferterPlan.ok
        || !Array.isArray(gelieferterPlan.zielIds)
        || gelieferterPlan.zielIds?.length !== ziele.zielIds.length
        || gelieferterPlan.zielIds.some((id, index) => id !== ziele.zielIds[index])) {
        return Promise.resolve(false);
      }
      return fuehreFilmLoeschPlanAus(gelieferterPlan, optionen);
    }

    /* Kompatibilität bis Paket B: Ohne explizite Vorschau wird der gebundene
       Plan innerhalb der gehaltenen MW- und Artikelqueues gegen deren dann
       aktuellen Stand genau einmal projiziert. Ein zuvor gequeue-ter Edit geht
       so weder verloren noch macht er aus der Einzel-API einen Stale-Abbruch. */
    const storageContext = captureStorageContext();
    let plan = null;
    return transaktionMustwatchVorbereitet((vorher) => vorher, async (mwStufe) => (
      transaktionArtikel((vorherArtikel) => {
        const masterBasis = masterRef?.current;
        const projektion = planeFilmBatchLoeschung(
          masterBasis, vorherArtikel, mwStufe.vorher, ziele.zielIds,
        );
        plan = stelleFilmPlanAus({
          projektion,
          masterBasis,
          artikelBasis: vorherArtikel,
          mustwatchBasis: mwStufe.vorher,
          storageContext,
        });
        if (!plan.ok || !mwStufe.setzeNext(plan.mustwatch)) return null;
        return plan.artikel;
      }, async () => {
        if (!planNebenbasenAktuell(plan)) return false;
        if (!await mwStufe.persistiere()) return false;
        if (!planNebenbasenAktuell(plan)) {
          await mwStufe.rolleZurueck();
          return false;
        }
        const masterOk = await transaktionMaster({
          master: plan.master,
          meta: optionen?.meta,
          herkunft: optionen?.herkunft,
          loeschen: false,
        }, {
          storageContext,
          erwarteteBasis: plan.masterBasis,
        });
        if (masterOk) return true;
        const mwRollbackOk = await mwStufe.rolleZurueck();
        return mwRollbackOk ? false : { ok: false, artikelRollback: false };
      }, {
        storageContext,
        pruefeVorWrite: () => planBasenAktuell(plan),
      })
    ), { storageContext });
  };

  async function fuehreMitMaster({ berechneMustwatch, berechneArtikel, masterPlan }) {
    let plan = null;
    const ok = await transaktionMustwatchVorbereitet((vorher) => {
      plan = berechneMustwatch(vorher);
      return plan?.mustwatch || vorher;
    }, async (mwStufe) => {
      if (!plan || plan.abgebrochen) return false;
      return transaktionArtikel(
        (vorher) => berechneArtikel(vorher, mwStufe.next, plan),
        async () => {
          if (!await mwStufe.persistiere()) return false;
          const masterOk = await transaktionMaster(masterPlan(plan), {
            storageContext: mwStufe.storageContext,
            erwarteteBasis: plan.masterBasis,
          });
          if (masterOk) return true;
          /* Vor dem Artikel-Rollback muss MW zurück. Scheitert das, darf der
             sichere vorwärts geschriebene Artikelstand nicht zurückgedreht
             werden — sonst entstünden wieder truthy tote Refs. */
          const mwRollbackOk = await mwStufe.rolleZurueck();
          return mwRollbackOk
            ? false
            : { ok: false, artikelRollback: false };
        },
        { storageContext: mwStufe.storageContext },
      );
    });
    return !!(ok && plan && !plan.abgebrochen);
  }

  const loescheMustwatch = (id) => {
    let plan = null;
    return transaktionMustwatchVorbereitet((vorher) => {
      plan = planeMustwatchLoeschung([], vorher, id);
      return plan.mustwatch;
    }, async (mwStufe) => {
      if (!plan || plan.mustwatch === mwStufe.vorher) return false;
      return transaktionArtikel(
        (vorher) => planeMustwatchLoeschung(vorher, mwStufe.vorher, id).artikel,
        () => mwStufe.persistiere(),
        { storageContext: mwStufe.storageContext },
      );
    });
  };

  const loescheFilm = (id, optionen = {}) => loescheFilme([id], optionen);

  const ersetzeMaster = (neuerMaster, { meta, herkunft, loeschen = false } = {}) => fuehreMitMaster({
    berechneMustwatch: (mustwatch) => ({
      ...planeMasterErsetzung(neuerMaster, [], mustwatch),
      masterBasis: masterRef.current,
    }),
    berechneArtikel: (artikel, mustwatch) => (
      planeMasterErsetzung(neuerMaster, artikel, mustwatch).artikel
    ),
    masterPlan: () => ({ master: neuerMaster, meta, herkunft, loeschen }),
  });

  /* Gezielte Demo-Beilagen-Bereinigung nutzt dieselbe Transaktion, darf aber
     vor dem gemeinsamen Ref-Abgleich ausgewählte MW-/Artikelzeilen entfernen. */
  const transformiereGrunddaten = ({
    berechneMaster,
    berechneMustwatch = (liste) => liste,
    berechneArtikel = (liste) => liste,
    meta,
    herkunft,
    loeschenWennLeer = true,
  }) => fuehreMitMaster({
    berechneMustwatch: (mustwatch) => {
      const masterBasis = masterRef.current;
      const master = berechneMaster(masterBasis || []);
      const vorab = berechneMustwatch(mustwatch);
      return { ...planeMasterErsetzung(master, [], vorab), master, masterBasis };
    },
    berechneArtikel: (artikel, mustwatch, plan) => (
      planeMasterErsetzung(plan.master, berechneArtikel(artikel), mustwatch).artikel
    ),
    masterPlan: (plan) => ({
      master: plan.master,
      meta,
      herkunft: typeof herkunft === "function" ? herkunft(plan.master) : herkunft,
      loeschen: loeschenWennLeer && plan.master.length === 0,
    }),
  });

  return {
    loescheMustwatch,
    planeFilmLoeschungen,
    loescheFilme,
    loescheFilm,
    ersetzeMaster,
    transformiereGrunddaten,
  };
}
