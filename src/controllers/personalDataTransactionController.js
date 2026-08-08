import {
  planeFilmLoeschung,
  planeMasterErsetzung,
  planeMustwatchLoeschung,
} from "../lib/libraryProjection.js";

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
}) {
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

  const loescheFilm = (id, { meta, herkunft }) => fuehreMitMaster({
    berechneMustwatch: (mustwatch) => {
      const masterBasis = masterRef.current;
      const aktuellerMaster = masterBasis || [];
      if (!aktuellerMaster.some((film) => film.id === id)) {
        return { mustwatch, abgebrochen: true };
      }
      return {
        ...planeFilmLoeschung(aktuellerMaster, [], mustwatch, id),
        masterVorher: aktuellerMaster, masterBasis,
      };
    },
    berechneArtikel: (artikel, mustwatch, plan) => (
      planeFilmLoeschung(plan.masterVorher, artikel, mustwatch, id).artikel
    ),
    masterPlan: (plan) => ({ master: plan.master, meta, herkunft, loeschen: false }),
  });

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

  return { loescheMustwatch, loescheFilm, ersetzeMaster, transformiereGrunddaten };
}
