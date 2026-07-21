/* ---------- Egg-Auto-Trigger: test-sichere tägliche Würfe (Block 3) ----------
   Deterministisch pro Tag: EIN Wurf je Egg & Tag, Ergebnis gespeichert (stabil
   über Reloads). Uhr (`jetzt`) und RNG (`rnd`) sind injizierbar → Unit-Tests
   sind vollständig deterministisch, und ohne erfüllte Bedingung (Unlock/Interaktion)
   wird gar nicht gewürfelt, also poppt in den jsdom-Tests nie zufällig ein Egg auf.

   Spec (Max, 21.07.):
   - Cage:    1:30 pro Tag, beim App-Start (jeder Wochentag).
   - Teppich: 1:10 pro Tag, wenn in der Mediathek an einem passenden,
     tatsächlich verfügbaren Film nach unten vorbeigescrollt wird. */

export function tagesSchluessel(jetzt) {
  const d = jetzt || new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mm + "-" + dd;
}

/* Ist heute ein „Treffer-Tag" für dieses Egg? Würfelt höchstens einmal pro Tag
   und merkt sich das Ergebnis (kd:eggroll:<key>). `tage` = erlaubte Wochentage
   (0=So … 6=Sa); fehlt es, gilt jeder Tag. */
export function wuerfleTag(key, chance, { jetzt, rnd, tage } = {}) {
  const now = jetzt || new Date();
  const tag = tagesSchluessel(now);
  const sk = "kd:eggroll:" + key;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(sk) || "null"); } catch { /* */ }
  if (s && s.tag === tag) return !!s.treffer;
  let treffer = false;
  if (!tage || tage.includes(now.getDay())) treffer = (rnd || Math.random)() < chance;
  try { localStorage.setItem(sk, JSON.stringify({ tag, treffer })); } catch { /* */ }
  return treffer;
}

/* „Schon heute gefeuert?" — begrenzt ein Egg auf ein Auftreten pro Tag,
   getrennt vom Wurf (Teppich wird gewürfelt/armiert, feuert aber erst beim Scrollen). */
export function schonGefeuertHeute(key, jetzt) {
  try { return localStorage.getItem("kd:eggfired:" + key) === tagesSchluessel(jetzt); }
  catch { return false; }
}
export function markiereGefeuert(key, jetzt) {
  try { localStorage.setItem("kd:eggfired:" + key, tagesSchluessel(jetzt)); } catch { /* */ }
}

/* Hat eine Karte beim Abwärtsscrollen die obere Lesezone verlassen? Die reine
   Geometrie bleibt unabhängig vom DOM testbar; die App liefert nur rect + Viewport. */
export function istVorbeiGescrollt(rect, { viewportHoehe = 0, scrolltAbwaerts = false } = {}) {
  if (!scrolltAbwaerts || !rect) return false;
  const unten = Number(rect.bottom);
  const hoehe = Number(viewportHoehe);
  if (!Number.isFinite(unten) || !Number.isFinite(hoehe) || hoehe <= 0) return false;
  const leselinie = Math.max(80, Math.min(260, hoehe * 0.32));
  return unten <= leselinie;
}
