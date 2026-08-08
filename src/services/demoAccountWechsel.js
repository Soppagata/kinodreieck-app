/* Demo → Konto ist kein normaler Merge:
   Nach erfolgreicher Anmeldung ist der Kontostand maßgeblich. Demo-Töpfe, zu
   denen es im Konto keine Zeile gibt, dürfen deshalb nicht lokal stehenbleiben.
   Vor jeder Änderung wird dennoch ein Rückholpunkt gesichert. */

import { ACCOUNT_SYNC_KEYS, capturePreparedAccountContext } from "./storage.js";
import {
  leseLokaleToepfe, sichereRueckholpunkt,
} from "../lib/uebernahme.js";
import {
  bindeKontoCacheVorPull, brecheKontoCachePullAb, uebernahmeBestaetigen,
} from "./uebernahme.js";
import { warteAccountTransitionZaun } from "./storage.js";
import { K } from "../lib/storage.js";

export const DEMO_STATUS_KEYS = Object.freeze([K.demoSeed, K.start, K.startVersion]);

function wechselFehler(text, code = "demo-account-wechsel") {
  const fehler = new Error(text);
  fehler.code = code;
  return fehler;
}

export async function ladeKontostandNachDemo({
  accountId,
  abhaengigkeiten = {},
} = {}) {
  if (!accountId) throw wechselFehler("Die Anmeldung hat keine Konto-ID geliefert.");

  const kontoContext = abhaengigkeiten.accountContext
    || (!abhaengigkeiten.pull || !abhaengigkeiten.remoteBehalten || !abhaengigkeiten.bestaetigen
      ? capturePreparedAccountContext()
      : null);
  if (kontoContext && kontoContext.accountId !== String(accountId)) {
    throw wechselFehler("Der vorbereitete Kontokontext gehört nicht zur Anmeldung.", "konto-kontext");
  }

  const deps = {
    leseLokaleToepfe,
    sichereRueckholpunkt,
    pull: kontoContext?.pull,
    remoteBehalten: kontoContext?.resolveKeepRemote,
    bestaetigen: (id) => uebernahmeBestaetigen(id, kontoContext?.bindung),
    bindeCacheVorPull: kontoContext ? bindeKontoCacheVorPull : () => null,
    abbruchCachePull: kontoContext ? brecheKontoCachePullAb : () => null,
    transitionFence: kontoContext ? warteAccountTransitionZaun : async () => {},
    storage: globalThis.localStorage,
    syncKeys: ACCOUNT_SYNC_KEYS,
    demoKeys: DEMO_STATUS_KEYS,
    ...abhaengigkeiten,
  };
  if (!deps.storage?.removeItem) {
    throw wechselFehler("Der Browser-Speicher ist nicht verfügbar.");
  }

  const vorher = await deps.leseLokaleToepfe();
  if (!await deps.sichereRueckholpunkt(vorher)) {
    throw wechselFehler(
      "Der Rückholpunkt konnte nicht gesichert werden. Der Demo-Stand wurde nicht ersetzt.",
      "rueckholpunkt",
    );
  }

  let cacheGebunden = false;
  try {
    await deps.bindeCacheVorPull(accountId);
    cacheGebunden = !!kontoContext || !!abhaengigkeiten.bindeCacheVorPull;
    await deps.transitionFence();
    const ergebnis = await deps.pull();
    if (!ergebnis || ergebnis.ok !== true
        || !Array.isArray(ergebnis.angelegt)
        || !Array.isArray(ergebnis.konflikt)) {
      throw wechselFehler(
        "Angemeldet, aber der aktuelle Kontostand konnte nicht vollständig geladen werden.",
        "konto-pull",
      );
    }

    const erlaubteKeys = new Set(deps.syncKeys);
    for (const key of ergebnis.konflikt) {
      if (!erlaubteKeys.has(key)) {
        throw wechselFehler("Der Kontostand enthielt einen unbekannten Datenbereich.", "konto-form");
      }
      const aufgeloest = await deps.remoteBehalten(key);
      if (aufgeloest?.ok !== true) {
        throw wechselFehler(
          "Ein Datenkonflikt konnte nicht zugunsten des Kontostands aufgelöst werden.",
          "konto-konflikt",
        );
      }
    }

    /* `angelegt` bedeutet beim Account-Treiber: Im Konto fehlt diese Zeile.
       Ein gewöhnlicher Pull lässt den lokalen Wert dann absichtlich stehen, um
       Gastdaten nicht zu verlieren. Beim ausdrücklich gewählten Demo→Konto-Weg
       wäre genau das falsch: die Demo würde als vermeintlicher Kontostand
       weiterleben. Der gesicherte Rückholpunkt macht die Löschung reversibel. */
    for (const key of ergebnis.angelegt) {
      if (!erlaubteKeys.has(key)) {
        throw wechselFehler("Der Kontostand enthielt einen unbekannten Datenbereich.", "konto-form");
      }
      deps.storage.removeItem(key);
    }

    for (const key of deps.demoKeys) deps.storage.removeItem(key);
    if (kontoContext && !kontoContext.isCurrent()) {
      throw wechselFehler("Der Kontokontext hat sich während des Übergangs geändert.", "konto-kontext");
    }
    await deps.bestaetigen(accountId);
    return { ok: true, ergebnis };
  } catch (error) {
    if (cacheGebunden) deps.abbruchCachePull(accountId, error);
    throw error;
  }
}
