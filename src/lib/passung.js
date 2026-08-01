/* Verständliche, katalogunabhängige Einordnung der Entdecken-Heuristik.
   Die Rohzahl bleibt für die Sortierung erhalten. Die sichtbare Stufe folgt
   dagegen der belegbaren Signalqualität: Ein beliebig hoher Jahrzehntwert
   darf allein niemals wie eine starke persönliche Empfehlung aussehen. */

const STARKE_SIGNALARTEN = new Set([
  "name", "genre", "thema", "regie", "person", "profil",
]);

const SINNVOLLE_SIGNALARTEN = new Set([
  ...STARKE_SIGNALARTEN,
  "tag",
]);

function signalKern(signal) {
  return String(signal || "").trim().replace(/\([^)]*\)\s*$/, "");
}

function signalArt(signal) {
  const kern = signalKern(signal);
  const trennung = kern.indexOf(":");
  return (trennung < 0 ? kern : kern.slice(0, trennung)).toLocaleLowerCase("de");
}

export function passungStufe(titel) {
  if (!Number.isFinite(titel?.relevanz)) return null;

  const signale = [...new Set((titel.relevanz_signale || []).map(signalKern).filter(Boolean))];
  const sinnvoll = signale.filter((signal) => SINNVOLLE_SIGNALARTEN.has(signalArt(signal)));
  const hatStarkesSignal = sinnvoll.some((signal) => STARKE_SIGNALARTEN.has(signalArt(signal)));

  if (hatStarkesSignal && sinnvoll.length >= 2) return "hoch";
  if (hatStarkesSignal) return "mittel";
  return "gering";
}

export function istPassend(titel) {
  const stufe = passungStufe(titel);
  return stufe === "hoch" || stufe === "mittel";
}

export function lesbaresPassungsSignal(signal) {
  return signalKern(signal)
    .replace(/^jahrzehnt:/i, "Jahrzehnt ")
    .replace(/^genre:/i, "Genre ")
    .replace(/^tag:/i, "Merkmal ")
    .replace(/^name:/i, "Name ")
    .replace(/^user_score:/i, "Publikumswert ")
    .replace(/^neu$/i, "neu im Katalog");
}
