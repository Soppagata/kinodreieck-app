/* Demo → Konto ist kein normaler Merge:
   Nach erfolgreicher Anmeldung ist der Kontostand maßgeblich. Demo-Töpfe, zu
   denen es im Konto keine Zeile gibt, dürfen deshalb nicht lokal stehenbleiben.
   Vor jeder Änderung wird dennoch ein Rückholpunkt gesichert. */

import { accountSync, ACCOUNT_SYNC_KEYS } from "./storage.js";
import {
  leseLokaleToepfe, sichereRueckholpunkt,
} from "../lib/uebernahme.js";
import { uebernahmeBestaetigen } from "./uebernahme.js";
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

  const deps = {
    leseLokaleToepfe,
    sichereRueckholpunkt,
    pull: accountSync.pull,
    remoteBehalten: accountSync.resolveKeepRemote,
    bestaetigen: uebernahmeBestaetigen,
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
  deps.bestaetigen(accountId);
  return { ok: true, ergebnis };
}
