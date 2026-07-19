/* ---------- Moment-Eggs (Block 4): Crawl & Klaatu — reine Logik ----------
   Deterministisch, kein Netz, kein LLM. Die OPTIK baut Codex (Crawl.jsx,
   .kd-necronomicon); hier nur die Trigger-/Eligibility-Bausteine, die Claude
   verdrahtet. */

import { norm } from "./match.js";

/* --- Klaatu barada nikto (Evil Dead), Tippfehler-tolerant ---
   „Jede halbrichtige Variante zählt" (Max). Vorgehen: Eingabe normalisieren, in
   Tokens zerlegen; jedes der drei Soll-Wörter muss von IRGENDEINEM Eingabe-Token
   innerhalb einer längenabhängigen Levenshtein-Toleranz getroffen werden. Rein
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
  if (toks.length < 3) return false;
  return KLAATU_WORTE.every((soll) => {
    const tol = soll.length <= 5 ? 1 : 2;   // klaatu/barada/nikto -> 1..2 Fehler ok
    return toks.some((t) => levenshtein(t, soll) <= tol);
  });
}

/* --- Star-Wars-Crawl: am 4. Mai, wenn mindestens ein Kino-Treffer vorliegt ---
   Datum + Datenbedingung (≥1 kinoMatches.matched). `jetzt` injizierbar (Tests). */
export function crawlHeute({ jetzt, kinoMatches } = {}) {
  const d = jetzt || new Date();
  const istMai4 = d.getMonth() === 4 && d.getDate() === 4;   // getMonth()===4 => Mai
  const treffer = ((kinoMatches && kinoMatches.matched) || []).length;
  return istMai4 && treffer >= 1;
}
