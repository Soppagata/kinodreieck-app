/* ---------- Übernahme lokaler Bestand → Konto (Etappe 3) ----------
   Der Weg vom Gastbetrieb in einen Account. Reihenfolge ist sicherheitskritisch:

     1. Inventur — NUR lesen. Läuft VOR der Treiberaktivierung, denn ein Pull
        würde den lokalen Stand mit dem Kontostand überschreiben.
     2. Sicherung — vollständiges Gesamt-Backup als Datei plus ein lokaler
        Rückholpunkt. Fail-closed: ohne gesicherten Rückholpunkt passiert nichts.
     3. Vorschau — je Topf Zählstand UND Größe, lokal gegen Konto.
     4. Übernahme — wiederholbar (idempotent): ein Abbruch in der Mitte lässt sich
        gefahrlos noch einmal starten.
     5. Prüfbericht — Vergleich über Prüfsummen, nicht über Zählstände. Zwei
        Listen gleicher Länge sind nicht dieselbe Liste.
     6. Bestätigung — erst danach gilt der Bestand als übernommen.

   Kein Zusammenführen einzelner Felder: bei belegtem Konto entscheidet der Nutzer
   je Gesamtbestand (Konto behalten oder lokal übernehmen). Ein Feld-Merge über
   opake JSON-Dokumente wäre stille Datenkorruption mit freundlicher Oberfläche. */

import { store, K } from "./storage.js";
import {
  PERSONAL_DATA_KEYS, personalDataEntry,
} from "./personalDataRegistry.js";

export const UEBERNAHME_SNAP = "kd:acct:uebernahme:vorher";
export const UEBERNOMMEN_KEY = "kd:acct:uebernommen";

export function topfLabel(key) { return personalDataEntry(key)?.label || key; }
export function topfEinheit(key) { return personalDataEntry(key)?.einheit || ""; }

/* Zählstand eines rohen Topf-Werts. Nicht parsebare Werte gelten als 1 (vorhanden),
   damit ein beschädigter Topf nicht als "leer" durchrutscht und still verschwindet. */
export function zaehleTopf(key, rohWert) {
  const entry = personalDataEntry(key);
  if (!entry) return rohWert == null || !String(rohWert).length ? 0 : 1;
  return entry.zaehleRoh(rohWert);
}

export function byteLaenge(wert) {
  if (wert == null) return 0;
  try { return new TextEncoder().encode(wert).length; } catch { return String(wert).length; }
}

/* Deterministische Prüfsumme (FNV-1a, 32 Bit als Hex). Reicht, um "derselbe Wert
   ist angekommen" zu belegen, und braucht keine Krypto-Umgebung. */
export function pruefsumme(wert) {
  if (wert == null) return "-";
  let h = 0x811c9dc5;
  const s = String(wert);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ---------- Inventur ---------- */
export async function leseLokaleToepfe() {
  const werte = {};
  for (const key of PERSONAL_DATA_KEYS) {
    try { const r = await store.get(key); werte[key] = r ? r.value : null; }
    catch { werte[key] = null; }
  }
  return werte;
}

/* Vergleichstabelle lokal ↔ Konto. `remoteZeilen` stammt aus der read-only Inventur. */
export function baueVorschau(lokaleWerte, remoteZeilen = {}) {
  return PERSONAL_DATA_KEYS.map((key) => {
    const lokal = lokaleWerte[key] ?? null;
    const remoteRow = remoteZeilen[key] || null;
    const remote = remoteRow ? String(remoteRow.value ?? "") : null;
    const gleich = lokal != null && remote != null && lokal === remote;
    return {
      key,
      label: topfLabel(key),
      einheit: topfEinheit(key),
      lokalVorhanden: lokal != null,
      remoteVorhanden: remote != null,
      lokalAnzahl: zaehleTopf(key, lokal),
      remoteAnzahl: zaehleTopf(key, remote),
      lokalBytes: byteLaenge(lokal),
      remoteBytes: byteLaenge(remote),
      gleich,
      status: lokal == null && remote == null ? "beide-leer"
        : lokal != null && remote == null ? "nur-lokal"
          : lokal == null && remote != null ? "nur-konto"
            : gleich ? "identisch" : "unterschiedlich",
    };
  });
}

/* Welcher Fall liegt vor? Bestimmt, was der Wizard anbietet. */
export function ermittleFall(vorschau, { fremdesKonto = false } = {}) {
  const lokalDa = vorschau.some((z) => z.lokalVorhanden);
  const kontoDa = vorschau.some((z) => z.remoteVorhanden);
  if (fremdesKonto && lokalDa) return "fremdes-konto";
  if (!lokalDa && !kontoDa) return "beide-leer";
  if (lokalDa && !kontoDa) return "nur-lokal";
  if (!lokalDa && kontoDa) return "nur-konto";
  return "beide-belegt";
}

/* Demo-Inhalte kenntlich machen: eine übernommene Demo-Beilage im eigenen Konto
   ist selten gewollt. */
export async function enthaeltDemoInhalte() {
  try {
    const seed = await store.get(K.demoSeed);
    if (seed && seed.value) return true;
    const master = await store.get(K.master);
    if (!master?.value) return false;
    const o = JSON.parse(master.value);
    return o?.herkunft?.typ === "demo";
  } catch { return false; }
}

/* ---------- Rückholpunkt ---------- */
export async function sichereRueckholpunkt(lokaleWerte) {
  const paket = JSON.stringify({ t: new Date().toISOString(), werte: lokaleWerte });
  try {
    localStorage.setItem(UEBERNAHME_SNAP, paket);
    /* Rücklesen fängt auch stille No-op-Schreibvorgänge (privater Modus, Quota). */
    if (localStorage.getItem(UEBERNAHME_SNAP) == null) return false;
    return true;
  } catch { return false; }
}
export function hatRueckholpunkt() {
  try { return !!localStorage.getItem(UEBERNAHME_SNAP); } catch { return false; }
}

/* Jede aktivierte Kontoablage braucht einen gebundenen Gast-Rückholpunkt.
   Ältere Wege haben ihn bereits vor dem Pull/Push angelegt; bei einem komplett
   leeren Bestand erzeugen wir ihn hier. So kann ein Logout später den Zustand
   vor der Anmeldung wiederherstellen, statt Kontodaten als Gast zu zeigen. */
export function bindeRueckholpunktAnKonto(accountId, storage = globalThis.localStorage) {
  const id = String(accountId || "");
  if (!id || !storage?.getItem || !storage?.setItem) return false;
  try {
    let snap;
    try { snap = JSON.parse(storage.getItem(UEBERNAHME_SNAP) || "null"); }
    catch { snap = null; }
    if (!snap || !snap.werte || typeof snap.werte !== "object" || Array.isArray(snap.werte)) {
      const werte = {};
      for (const key of PERSONAL_DATA_KEYS) werte[key] = storage.getItem(key);
      snap = { t: new Date().toISOString(), werte };
    }
    const gebunden = { ...snap, accountId: id };
    storage.setItem(UEBERNAHME_SNAP, JSON.stringify(gebunden));
    const probe = JSON.parse(storage.getItem(UEBERNAHME_SNAP) || "null");
    return probe?.accountId === id && !!probe.werte;
  } catch { return false; }
}

/* Kontodaten sind nach dem Logout nicht länger der Gastbestand. Wenn ein
   Zustand von vor der Kontoaktivierung vorliegt, wird genau dieser restauriert;
   bei alten Installationen ohne Rückholpunkt werden alle accountgebundenen
   Töpfe entfernt. Gerätezustände wie KI-Grundwahl, Einstieg und Katalogcache
   bleiben davon ausdrücklich unberührt. */
export function stelleGaststandNachAbmeldungWiederHer(accountId, storage = globalThis.localStorage) {
  const id = String(accountId || "");
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) return { ok: false, grund: "speicher-fehlt" };
  try {
    let snap;
    try { snap = JSON.parse(storage.getItem(UEBERNAHME_SNAP) || "null"); }
    catch { snap = null; }
    const hatPassendenStand = !!snap?.werte
      && typeof snap.werte === "object"
      && !Array.isArray(snap.werte)
      && (!snap.accountId || snap.accountId === id);
    const werte = hatPassendenStand ? snap.werte : {};

    /* Erst alle wiederherzustellenden Werte schreiben. Scheitert die Quote,
       wurden noch keine übrigen Töpfe entfernt und der Rückholpunkt bleibt da. */
    for (const key of PERSONAL_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(werte, key) && werte[key] != null) {
        storage.setItem(key, String(werte[key]));
      }
    }
    for (const key of PERSONAL_DATA_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(werte, key) || werte[key] == null) storage.removeItem(key);
    }
    storage.removeItem(UEBERNAHME_SNAP);
    storage.removeItem(UEBERNOMMEN_KEY);
    return { ok: true, quelle: hatPassendenStand ? "gast-rueckholpunkt" : "konto-cache-entfernt" };
  } catch (error) {
    return { ok: false, grund: "wiederherstellung-fehlgeschlagen", error };
  }
}

/* ---------- Übernahme ausführen ----------
   `uebernehmeKey` kommt von aussen (accountSync) — so bleibt diese Datei ohne
   Netzwerkwissen und ist mit geseedeten Daten prüfbar. */
export async function fuehreUebernahmeAus({ lokaleWerte, uebernehmeKey, nurSchluessel = null }) {
  const bericht = [];
  const gepusht = [];
  for (const key of PERSONAL_DATA_KEYS) {
    if (nurSchluessel && !nurSchluessel.includes(key)) continue;
    const wert = lokaleWerte[key] ?? null;
    if (wert == null) {
      bericht.push({ key, label: topfLabel(key), status: "übersprungen (nichts vorhanden)", anzahl: 0, pruefsumme: "-" });
      continue;
    }
    let r;
    try { r = await uebernehmeKey(key, wert); }
    catch (e) { r = { ok: false, error: String(e) }; }
    if (r?.ok) {
      if (r.angelegt) gepusht.push(key);
      bericht.push({
        key, label: topfLabel(key),
        status: r.bereitsGleich ? "war bereits im Konto" : r.ersetzt ? "im Konto ersetzt" : "übernommen",
        anzahl: zaehleTopf(key, wert), pruefsumme: pruefsumme(wert),
      });
    } else {
      bericht.push({
        key, label: topfLabel(key),
        status: r?.zuGross ? "FEHLER — zu groß für die Datenbank"
          : r?.schemaVeraltet ? "FEHLER — der Server kennt diesen Datentopf noch nicht (Migration fehlt?)"
            : "FEHLER — nicht übernommen",
        anzahl: zaehleTopf(key, wert), pruefsumme: pruefsumme(wert), fehler: true,
      });
    }
  }
  return { bericht, gepusht, ok: !bericht.some((z) => z.fehler) };
}

/* ---------- Prüfbericht ----------
   Vergleicht über Prüfsummen. Erst wenn JEDER übernommene Topf im Konto
   bitgleich wiedergefunden wird, gilt die Übernahme als verlustfrei. */
export function baueVerifikation(lokaleWerte, remoteZeilenNachher) {
  const zeilen = [];
  let allesGleich = true;
  for (const key of PERSONAL_DATA_KEYS) {
    const lokal = lokaleWerte[key] ?? null;
    if (lokal == null) continue;
    const row = remoteZeilenNachher[key] || null;
    const remote = row ? String(row.value ?? "") : null;
    const gleich = remote != null && pruefsumme(lokal) === pruefsumme(remote) && lokal.length === remote.length;
    if (!gleich) allesGleich = false;
    zeilen.push({
      key, label: topfLabel(key),
      anzahl: zaehleTopf(key, lokal),
      lokalPruef: pruefsumme(lokal),
      kontoPruef: remote == null ? "-" : pruefsumme(remote),
      gleich,
    });
  }
  return { zeilen, allesGleich };
}

export function merkeUebernommen(accountId) {
  try { localStorage.setItem(UEBERNOMMEN_KEY, JSON.stringify({ accountId: String(accountId || ""), t: new Date().toISOString() })); }
  catch { /* best effort */ }
}
export function istUebernommen(accountId) {
  try {
    const o = JSON.parse(localStorage.getItem(UEBERNOMMEN_KEY) || "null");
    return !!o && (!accountId || o.accountId === String(accountId));
  } catch { return false; }
}
export function vergissUebernahme() {
  try { localStorage.removeItem(UEBERNOMMEN_KEY); } catch { /* best effort */ }
}

/* ---------- Rücknahme ----------
   Lokalen Stand zurückschreiben UND die in diesem Lauf angelegten Kontozeilen
   wieder entfernen. Ohne den zweiten Teil bliebe das Konto belegt und der Nutzer
   käme nie wieder in den einfachen Erstübernahme-Fall zurück. */
export async function nimmUebernahmeZurueck({ loescheRemote, gepusht = [] }) {
  let snap;
  try { snap = JSON.parse(localStorage.getItem(UEBERNAHME_SNAP) || "null"); } catch { snap = null; }
  if (!snap || !snap.werte) throw new Error("Kein Rückholpunkt vorhanden.");

  for (const key of gepusht) {
    try { await loescheRemote(key); } catch { /* einzelner Topf */ }
  }
  for (const [key, wert] of Object.entries(snap.werte)) {
    try { if (wert == null) await store.delete(key); else await store.set(key, wert); }
    catch { /* einzelner Topf */ }
  }
  vergissUebernahme();
  return { ok: true, t: snap.t };
}
