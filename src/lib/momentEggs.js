/* ---------- Moment-Eggs (Block 4): Crawl & Klaatu — reine Logik ----------
   Deterministisch, kein Netz, kein LLM. Die OPTIK baut Codex (Crawl.jsx,
   .kd-necronomicon); hier nur die Trigger-/Eligibility-Bausteine, die Claude
   verdrahtet. */

import { norm } from "./match.js";

/* --- Klaatu barada nikto (Evil Dead), Tippfehler-tolerant ---
   „Jede halbrichtige Variante zählt" (Max). Zwei erinnerte Wortfragmente genügen;
   jedes Eingabe-Token darf dabei nur ein Soll-Wort treffen. Kurze Eingaben halten
   das Egg gezielt und vermeiden Treffer in gewöhnlichen langen Suchsätzen. Rein
   deterministisch, kein Fuzzy gegen externe Quellen. Schwellen bewusst tunebar. */
const KLAATU_WORTE = ["klaatu", "barada", "nikto"];

export function levenshtein(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const kost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + kost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function istKlaatu(query) {
  const toks = norm(query || "").split(/\s+/).filter(Boolean);
  if (toks.length < 2 || toks.length > 6) return false;
  const vergeben = new Set();
  let treffer = 0;
  for (const soll of KLAATU_WORTE) {
    const tol = soll.length <= 5 ? 1 : 2;   // klaatu/barada/nikto -> 1..2 Fehler ok
    const index = toks.findIndex((t, i) => !vergeben.has(i) && levenshtein(t, soll) <= tol);
    if (index >= 0) { vergeben.add(index); treffer++; }
  }
  return treffer >= 2;
}

/* --- Star-Wars-Tag: der gesamte 4. Mai, ohne weitere Bedingung --- */
export function istVierterMai(jetzt) {
  const d = jetzt || new Date();
  return d.getMonth() === 4 && d.getDate() === 4;   // getMonth()===4 => Mai
}

/* Kompatible Objekt-Signatur; `kinoMatches` ist absichtlich keine Bedingung mehr.
   `jetzt` bleibt injizierbar, damit Datum und Auto-Trigger exakt testbar sind. */
export function crawlHeute({ jetzt } = {}) {
  return istVierterMai(jetzt);
}
