/* Übernahme-Grenze: die Oberfläche spricht nur mit dieser Fassade, nie mit dem
   Account-Treiber. Hier wird die reine Logik aus lib/uebernahme.js mit dem
   Netzwerkweg (accountSync) verdrahtet. */

import {
  leseLokaleToepfe, baueVorschau, ermittleFall, enthaeltDemoInhalte,
  hatRueckholpunkt, fuehreUebernahmeAus, baueVerifikation,
  merkeUebernommen, istUebernommen, vergissUebernahme, nimmUebernahmeZurueck,
  topfLabel, zaehleTopf, pruefsumme, byteLaenge,
  sichereGebundenenGastRueckholpunkt, stelleGaststandNachAbmeldungWiederHer,
  quarantaeneKontoCache,
} from "../lib/uebernahme.js";
import {
  aktuelleAccountTransition, beginneKontoAdoptionCache, bindeKontoAdoptionCache,
  beendeGebundeneAccountTransition, bestaetigeKontoTreiber,
  cacheGehoertZuFremdemKonto, cacheOwner,
  capturePreparedAccountContext, entsperrePersoenlichenSpeicherNachTrennung,
  istLokaleAccountTransition, maskierePersoenlichenSpeicher, warteAccountTransitionZaun,
  verwerfeLokaleKontoBindung,
} from "./storage.js";
import { normalizeBoundaryError } from "./errors.js";

export {
  topfLabel, zaehleTopf, pruefsumme, byteLaenge, istUebernommen, vergissUebernahme, hatRueckholpunkt,
};

function gebundenerKontoContext(deps = {}, bindung = null) {
  const context = (deps.captureAccountContext || capturePreparedAccountContext)(bindung);
  const passt = context?.isCurrent?.() === true
    && (!bindung || (String(bindung.accountId || "") === String(context.accountId || "")
      && bindung.generation === context.generation));
  if (!passt) {
    const error = new Error("Der Kontokontext hat sich während der Übernahme geändert.");
    error.code = "ACCOUNT_CONTEXT_CHANGED";
    throw error;
  }
  return context;
}

/* Schritt 1: Bestandsaufnahme. Rein lesend — verändert weder Gerät noch Konto. */
export async function inventurLaden(accountId, deps = {}) {
  try {
    const kontoContext = gebundenerKontoContext(deps);
    if (String(accountId || "") !== kontoContext.accountId) {
      const error = new Error("Der vorbereitete Kontokontext gehört nicht zur angezeigten Anmeldung.");
      error.code = "ACCOUNT_CONTEXT_CHANGED";
      throw error;
    }
    const lokaleWerte = await leseLokaleToepfe();
    const remote = await kontoContext.inventur();
    if (!kontoContext.isCurrent()) throw new Error("Kontokontext gewechselt.");
    const vorschau = baueVorschau(lokaleWerte, remote.zeilen || {});
    const fremdesKonto = cacheGehoertZuFremdemKonto(accountId);
    return {
      ok: remote.ok !== false,
      erreichbar: remote.ok !== false,
      lokaleWerte,
      vorschau,
      fall: ermittleFall(vorschau, { fremdesKonto }),
      fremdesKonto,
      demo: await enthaeltDemoInhalte(),
      accountBindung: kontoContext.bindung,
    };
  } catch (error) {
    throw normalizeBoundaryError(error, { source: "storage", operation: "uebernahme.inventur" });
  }
}

function rueckholpunktFehler() {
  const fehler = new Error("Rückholpunkt konnte nicht sicher gebunden werden — es wurde nichts am lokalen Bestand geändert.");
  fehler.code = "rueckholpunkt";
  return fehler;
}

/* Gemeinsame Eintrittsgrenze für ALLE Richtungen: Marker setzen, einen
   Macrotask lang andere Tabs auslaufen lassen, dann den nun stabilen
   Gastbestand erfassen und erst anschließend Owner+Epoch binden. */
export async function starteKontoCacheAdoption(accountId, deps = {}) {
  const id = String(accountId || "");
  const begin = deps.beginAdoption || beginneKontoAdoptionCache;
  const fence = deps.transitionFence || warteAccountTransitionZaun;
  const snapshot = deps.bindGuestSnapshot || sichereGebundenenGastRueckholpunkt;
  const bind = deps.bindAdoption || bindeKontoAdoptionCache;
  const end = deps.endTransition || beendeGebundeneAccountTransition;
  const unlock = deps.unlock || entsperrePersoenlichenSpeicherNachTrennung;
  const transition = begin(id);
  let snapshotGebunden = false;
  try {
    await fence();
    const gast = snapshot(id);
    if (!gast?.werte) throw rueckholpunktFehler();
    snapshotGebunden = true;
    const gebunden = bind(id, transition?.token);
    return Object.freeze({ ...gebunden, lokaleWerte: gast.werte });
  } catch (error) {
    if (snapshotGebunden) {
      /* Ab hier könnte Owner/Epoch bereits teilweise geschrieben sein. Nur die
         bestätigte Gast-Restore-Grenze darf den Marker wieder freigeben. */
      try { brecheKontoCachePullAb(id, error); }
      catch (rollbackError) { throw rollbackError; }
    } else {
      if (!end(transition?.token)) {
        maskierePersoenlichenSpeicher();
        throw Object.assign(rueckholpunktFehler(), { cause: error });
      }
      unlock();
    }
    throw error;
  }
}

/* Schritt 2+4+5: stabilen Stand sichern, übernehmen, prüfen. Der an die UI
   gereichte Inventurwert ist nur Vorschau; gepusht wird ausschließlich der
   nach dem Tab-Zaun neu gelesene Bestand. */
export async function uebernahmeStarten({
  lokaleWerte: _inventurWerte, nurSchluessel = null, accountBindung = null,
}, deps = {}) {
  const kontoContext = gebundenerKontoContext(deps, accountBindung);
  let adoption = null;
  try {
    adoption = await (deps.startAdoption || starteKontoCacheAdoption)(kontoContext.accountId, deps);
    if (!kontoContext.isCurrent()) throw new Error("Kontokontext gewechselt.");
    const lokaleWerte = adoption.lokaleWerte;
    const lauf = await fuehreUebernahmeAus({ lokaleWerte, uebernehmeKey: kontoContext.uebernehmeKey, nurSchluessel });
    const nachher = await kontoContext.inventur();
    const verifikation = baueVerifikation(lokaleWerte, nachher.zeilen || {});
    return {
      ...lauf,
      verifikation,
      vollstaendig: lauf.ok && verifikation.allesGleich,
      accountBindung: kontoContext.bindung,
      cacheTransition: adoption?.token || null,
    };
  } catch (error) {
    if (adoption) (deps.abortAdoption || brecheKontoCachePullAb)(kontoContext.accountId, error);
    throw error;
  }
}

/* Schritt 6: Bestätigen. Nur nach vollständiger Prüfung aufrufen. Erst hier
   bekommt der Cache seinen Besitzer und der normale Account-Sync wird aktiv. */
export async function uebernahmeBestaetigen(accountId, accountBindung = null, deps = {}) {
  const kontoContext = (deps.captureAccountContext || capturePreparedAccountContext)(accountBindung);
  if (kontoContext.accountId !== String(accountId || "")) {
    throw new Error("Die Übernahme gehört nicht zur aktuell vorbereiteten Anmeldung.");
  }
  const currentTransition = deps.currentTransition || aktuelleAccountTransition;
  const transition = currentTransition();
  const lokal = deps.isLocalTransition || istLokaleAccountTransition;
  let eigeneTransition = !!transition && lokal(transition.token, accountId);
  if (!transition) {
    await (deps.startAdoption || starteKontoCacheAdoption)(accountId, deps);
    eigeneTransition = true;
  } else if (transition.accountId !== String(accountId || "")) {
    throw new Error("Die laufende Konto-Transition gehört zu einer anderen Anmeldung.");
  }
  const aktuellerMarker = currentTransition();
  if (!lokal(aktuellerMarker?.token, accountId)) {
    if (eigeneTransition) {
      try { (deps.abortAdoption || brecheKontoCachePullAb)(accountId); }
      catch (error) { throw error; }
    } else {
      maskierePersoenlichenSpeicher();
    }
    const error = new Error("Die Kontoaktivierung wurde in einem anderen Tab verändert.");
    error.code = eigeneTransition ? "ACCOUNT_CONTEXT_CHANGED" : "PERSONAL_DATA_PRIVACY_LOCKED";
    throw error;
  }
  const abort = deps.abortAdoption || brecheKontoCachePullAb;
  if (!(deps.markConfirmed || merkeUebernommen)(accountId)) {
    abort(accountId);
    throw new Error("Die Kontoaktivierung konnte nicht dauerhaft bestätigt werden.");
  }
  try { await (deps.confirmDriver || bestaetigeKontoTreiber)(accountId); }
  catch (error) {
    abort(accountId, error);
    throw error;
  }
}

export function gaststandNachKontoAbmeldung(accountId, { behalteTransition = false } = {}) {
  let ergebnis = stelleGaststandNachAbmeldungWiederHer(
    accountId, globalThis.localStorage, { behalteTransition },
  );
  if (!ergebnis.ok) throw new Error("Der lokale Gaststand konnte nach der Abmeldung nicht wiederhergestellt werden.");
  const getrennt = verwerfeLokaleKontoBindung({ behalteTransition });
  if (!getrennt || cacheOwner()) {
    /* Ein nicht entfernbarer Owner-Marker darf einen restaurierten Gaststand
       nie unter einer Konto-Sitzung zurücklassen. In diesem seltenen Fall den
       persönlichen Cache leeren und den Logout fail-closed abbrechen. */
    const quarantined = quarantaeneKontoCache(globalThis.localStorage, { behalteTransition });
    if (!quarantined.ok) {
      /* Owner unbedingt behalten: Er ist der persistente Restverdacht für den
         nächsten Boot und verhindert, dass Teilreste als Gast entsperrt werden. */
      throw new Error("Die lokale Konto-Bindung konnte nicht sicher entfernt werden.");
    }
    if (!verwerfeLokaleKontoBindung({ behalteTransition }) || cacheOwner()) {
      throw new Error("Die lokale Konto-Bindung konnte nicht sicher entfernt werden.");
    }
    ergebnis = {
      ...quarantined,
      warnung: "Der frühere Gaststand konnte nicht sicher freigegeben werden; der lokale Kontocache wurde zum Schutz entfernt.",
    };
  }
  return ergebnis;
}

/* Expliziter Notausgang für den Session-Koordinator, falls eine injizierte oder
   ältere Gast-Wiederherstellung selbst wirft. Er entfernt auch Rückholpunkt und
   Übernahmemarke; die Konto-ID/Sync-Metadaten werden anschließend verworfen. */
export function quarantaeneKontodatenNachAbmeldung(_accountId = null, _ursache = null, {
  behalteTransition = false,
} = {}) {
  const ergebnis = quarantaeneKontoCache(globalThis.localStorage, { behalteTransition });
  if (!ergebnis.ok) {
    /* Bei Teilfehlern bleibt der Owner als persistenter Quarantäne-Marker
       stehen. Ein Reload erkennt damit den Cache erneut und entsperrt ihn nie
       bloß aufgrund eines verlorenen In-Memory-Flags. */
    throw new Error("Der lokale Kontocache konnte nicht vollständig unter Quarantäne gestellt werden.");
  }
  if (!verwerfeLokaleKontoBindung({ behalteTransition }) || cacheOwner()) {
    throw new Error("Der lokale Kontocache konnte nicht vollständig unter Quarantäne gestellt werden.");
  }
  return {
    ...ergebnis,
    warnung: "Der frühere Gaststand konnte nicht wiederhergestellt werden; der lokale Kontocache wurde zum Schutz entfernt.",
  };
}

/* Vor JEDEM Remote→lokal-Pull im noch unbestätigten Konto: Der Gast-
   Rückholpunkt ist bereits geschrieben und wird nun an A gebunden; danach
   werden Owner, Aktivierungs-Epoch und geräteweiter Transitionmarker
   rückgelesen bestätigt. Erst dann darf der AccountDriver Haupttöpfe ändern. */
export const bindeKontoCacheVorPull = starteKontoCacheAdoption;

export function brecheKontoCachePullAb(accountId, ursache = null) {
  try {
    const ergebnis = gaststandNachKontoAbmeldung(accountId);
    entsperrePersoenlichenSpeicherNachTrennung();
    return ergebnis;
  } catch (rollbackError) {
    maskierePersoenlichenSpeicher();
    const error = new Error("Der Konto-Pull ist fehlgeschlagen und der lokale Cache konnte nicht sicher zurückgesetzt werden.");
    error.code = "PERSONAL_DATA_PRIVACY_LOCKED";
    error.cause = rollbackError || ursache;
    throw error;
  }
}

/* Rücknahme inklusive Entfernen der in diesem Lauf angelegten Kontozeilen. */
export async function uebernahmeZuruecknehmen(gepusht = [], accountBindung = null, deps = {}) {
  if (!accountBindung) {
    const error = new Error("Die Konto-Bindung der Übernahme fehlt; Rücknahme sicherheitshalber abgebrochen.");
    error.code = "ACCOUNT_CONTEXT_CHANGED";
    throw error;
  }
  const kontoContext = gebundenerKontoContext(deps, accountBindung);
  const marker = aktuelleAccountTransition();
  if (!deps.storageContext && (!marker || marker.accountId !== kontoContext.accountId)) {
    const error = new Error("Die Konto-Transition der Rücknahme ist nicht mehr aktiv.");
    error.code = "ACCOUNT_CONTEXT_CHANGED";
    throw error;
  }
  const lokalerContext = deps.storageContext || {
    isCurrent: () => {
      const aktuell = aktuelleAccountTransition();
      return !!marker && aktuell?.token === marker.token && aktuell.accountId === kontoContext.accountId;
    },
    async set(key, value) {
      if (!this.isCurrent()) throw new Error("Konto-Transition gewechselt.");
      localStorage.setItem(key, String(value));
      if (!this.isCurrent() || localStorage.getItem(key) !== String(value)) {
        throw new Error("Lokaler Rückholwert wurde nicht bestätigt.");
      }
    },
    async delete(key) {
      if (!this.isCurrent()) throw new Error("Konto-Transition gewechselt.");
      localStorage.removeItem(key);
      if (!this.isCurrent() || localStorage.getItem(key) != null) {
        throw new Error("Lokaler Rückholwert wurde nicht entfernt.");
      }
    },
  };
  const ergebnis = await nimmUebernahmeZurueck({
    loescheRemote: kontoContext.loescheRemote,
    gepusht,
    storageContext: lokalerContext,
  });
  if (!deps.storageContext) {
    gaststandNachKontoAbmeldung(kontoContext.accountId);
    entsperrePersoenlichenSpeicherNachTrennung();
  }
  return ergebnis;
}

/* Fall "Konto behalten": den Kontostand auf das Gerät holen. Der Rückholpunkt
   wird auch hier vorher gesichert, damit die Entscheidung umkehrbar bleibt. */
export async function kontoUebernehmen(_inventurWerte, { accountBindung = null } = {}, deps = {}) {
  const kontoContext = gebundenerKontoContext(deps, accountBindung);
  let adoption = null;
  try {
    adoption = await (deps.bindeCacheVorPull || bindeKontoCacheVorPull)(kontoContext.accountId, deps);
    if (!kontoContext.isCurrent()) throw new Error("Kontokontext gewechselt.");
    const r = await kontoContext.pull();
    if (r?.ok === false) throw new Error("Kontostand konnte nicht vollständig geladen werden.");
    return {
      ok: true, ergebnis: r, accountBindung: kontoContext.bindung,
      cacheTransition: adoption?.token || null,
    };
  } catch (error) {
    if (adoption) (deps.abbruchCachePull || brecheKontoCachePullAb)(kontoContext.accountId, error);
    throw error;
  }
}

/* Nach einem Login zeigt das Gerät ausschließlich den gebundenen Kontostand.
   `kontoUebernehmen` bindet davor den bytegenauen Gast-Rückholpunkt und lädt nur
   Remote→lokal; der frühere Gaststand wird weder gemergt noch hochgeladen. */
export async function kontoSicherAutomatischLaden(accountId, deps = {}) {
  try {
    const inventur = deps.inventur || inventurLaden;
    const inv = await inventur(accountId);
    const kontoLaden = deps.kontoLaden
      || ((werte) => kontoUebernehmen(werte, { accountBindung: inv.accountBindung }));
    const bestaetigen = deps.bestaetigen
      || ((id) => uebernahmeBestaetigen(id, inv.accountBindung));
    if (inv?.ok === false || inv?.erreichbar === false) {
      throw new Error("Kontostand ist gerade nicht erreichbar.");
    }
    const geladen = await kontoLaden(inv.lokaleWerte);
    if (geladen?.ok === false) throw new Error("Kontostand konnte nicht geladen werden.");
    await bestaetigen(accountId);
    return { automatisch: true, grund: "konto-geladen" };
  } catch (error) {
    if (error?.code === "PERSONAL_DATA_PRIVACY_LOCKED") throw error;
    const sicher = new Error("Der Kontostand konnte nicht sicher geladen werden. Bitte versuche es erneut.");
    sicher.code = "ACCOUNT_LOAD_FAILED";
    sicher.cause = error;
    throw sicher;
  }
}
