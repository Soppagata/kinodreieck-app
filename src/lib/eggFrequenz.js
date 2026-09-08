/* ---------- Egg-Auto-Trigger: test-sichere tägliche Würfe (Block 3) ----------
   Deterministisch pro Tag: EIN Wurf je Egg & Tag, Ergebnis gespeichert (stabil
   über Reloads). Uhr (`jetzt`) und RNG (`rnd`) sind injizierbar → Unit-Tests
   sind vollständig deterministisch, und ohne erfüllte Bedingung (Unlock/Interaktion)
   wird gar nicht gewürfelt, also poppt in den jsdom-Tests nie zufällig ein Egg auf.

   Spec (Max, 08.09.):
   - Cage: 1:5 je geeignetem Nutzungstag, spätestens am fünften solchen Tag.
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

/* Nur mit freigeschaltetem, verfügbarem A–Z-Pool und ohne UI-Blocker aufrufen.
   Der fünfte geeignete Tag trifft sicher; unbenutzte Kalendertage zählen nicht.
   Wurf und Miss-Zähler bleiben im bisherigen Cage-Schlüssel, Version 2 ergänzt
   nur den Zähler. Alte Tageswürfe und fired-Marker bleiben verbindlich. Ein
   Auftritt wird vor dem Öffnen beansprucht, auch über Reload/StrictMode hinweg. */
export function versucheCageTag({ jetzt = new Date(), rnd = Math.random, storage } = {}) {
  if (!Number.isFinite(jetzt.getTime())) return false;
  const tag = tagesSchluessel(jetzt);
  try {
    const speicher = storage || localStorage;
    const rollKey = "kd:eggroll:cage", firedKey = "kd:eggfired:cage";
    const gefeuert = speicher.getItem(firedKey);
    if (gefeuert && gefeuert >= tag) return false;
    let stand = null;
    try { stand = JSON.parse(speicher.getItem(rollKey) || "null"); } catch { /* alter defekter Wurf */ }
    if (stand?.tag > tag) return false;
    let fehlTage = stand?.version === 2 && Number.isInteger(stand.fehlTage)
      ? Math.max(0, Math.min(4, stand.fehlTage)) : 0;
    if (gefeuert && gefeuert >= stand?.tag) fehlTage = 0;
    const gleicherTag = stand?.tag === tag && typeof stand.treffer === "boolean";
    const treffer = gleicherTag ? stand.treffer : fehlTage >= 4 || rnd() < 1 / 5;
    const naechste = JSON.stringify({ version: 2, tag, treffer,
      fehlTage: treffer ? 0 : gleicherTag && stand.version === 2 ? fehlTage : Math.min(4, fehlTage + 1) });
    speicher.setItem(rollKey, naechste);
    if (speicher.getItem(rollKey) !== naechste) return false;
    if (!treffer) return false;
    speicher.setItem(firedKey, tag);
    return speicher.getItem(firedKey) === tag;
  } catch { return false; }
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
