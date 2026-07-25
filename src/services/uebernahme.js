/* Übernahme-Grenze: die Oberfläche spricht nur mit dieser Fassade, nie mit dem
   Account-Treiber. Hier wird die reine Logik aus lib/uebernahme.js mit dem
   Netzwerkweg (accountSync) verdrahtet. */

import {
  leseLokaleToepfe, baueVorschau, ermittleFall, enthaeltDemoInhalte,
  sichereRueckholpunkt, hatRueckholpunkt, fuehreUebernahmeAus, baueVerifikation,
  merkeUebernommen, istUebernommen, vergissUebernahme, nimmUebernahmeZurueck,
  topfLabel, zaehleTopf, pruefsumme, byteLaenge,
} from "../lib/uebernahme.js";
import { accountSync, cacheGehoertZuFremdemKonto } from "./storage.js";
import { normalizeBoundaryError } from "./errors.js";

export {
  topfLabel, zaehleTopf, pruefsumme, byteLaenge, istUebernommen, vergissUebernahme, hatRueckholpunkt,
};

/* Schritt 1: Bestandsaufnahme. Rein lesend — verändert weder Gerät noch Konto. */
export async function inventurLaden(accountId) {
  try {
    const lokaleWerte = await leseLokaleToepfe();
    const remote = await accountSync.inventur();
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
    };
  } catch (error) {
    throw normalizeBoundaryError(error, { source: "storage", operation: "uebernahme.inventur" });
  }
}

/* Schritt 2+4+5: sichern, übernehmen, prüfen. Ohne gesicherten Rückholpunkt
   passiert nichts — der Abbruch erfolgt, bevor irgendetwas geschrieben wurde. */
export async function uebernahmeStarten({ lokaleWerte, nurSchluessel = null }) {
  const gesichert = await sichereRueckholpunkt(lokaleWerte);
  if (!gesichert) {
    const fehler = new Error("Rückholpunkt konnte nicht gesichert werden (Speicher voll oder blockiert) — Übernahme abgebrochen, es wurde nichts geändert.");
    fehler.code = "rueckholpunkt";
    throw fehler;
  }
  const lauf = await fuehreUebernahmeAus({ lokaleWerte, uebernehmeKey: accountSync.uebernehmeKey, nurSchluessel });
  const nachher = await accountSync.inventur();
  const verifikation = baueVerifikation(lokaleWerte, nachher.zeilen || {});
  return { ...lauf, verifikation, vollstaendig: lauf.ok && verifikation.allesGleich };
}

/* Schritt 6: Bestätigen. Nur nach vollständiger Prüfung aufrufen. */
export function uebernahmeBestaetigen(accountId) { merkeUebernommen(accountId); }

/* Rücknahme inklusive Entfernen der in diesem Lauf angelegten Kontozeilen. */
export async function uebernahmeZuruecknehmen(gepusht = []) {
  return await nimmUebernahmeZurueck({ loescheRemote: accountSync.loescheRemote, gepusht });
}

/* Fall "Konto behalten": den Kontostand auf das Gerät holen. Der Rückholpunkt
   wird auch hier vorher gesichert, damit die Entscheidung umkehrbar bleibt. */
export async function kontoUebernehmen(lokaleWerte) {
  const gesichert = await sichereRueckholpunkt(lokaleWerte);
  if (!gesichert) {
    const fehler = new Error("Rückholpunkt konnte nicht gesichert werden — es wurde nichts geändert.");
    fehler.code = "rueckholpunkt";
    throw fehler;
  }
  const r = await accountSync.pull();
  return { ok: r?.ok !== false, ergebnis: r };
}
