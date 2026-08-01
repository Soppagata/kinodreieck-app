/* ---------- Quellen (Besitz/Verfügbarkeit eines Titels) ----------
   Zentral & erweiterbar: neue Plattform/Format = EINE Zeile hier.
   Vorfilter „physisch" / „virtuell", dann Auswahl aus der jeweiligen Liste.
   Gespeichert wird als "+"-String der KEYS (z.B. "vhs+netflix") — round-trippt
   unverändert durch Export/Import; zur Anzeige lösen wir Keys -> Labels auf.
   „Wunschliste" (must_watch) = besitze ich (noch) nirgends; das ist der Zustand
   „keine Quelle gewählt". */
export const WUNSCH = "must_watch";

export const QUELLEN_KLASSEN = Object.freeze({
  PHYSISCH: "physisch",
  DIGITAL_GEKAUFT: "digital_gekauft",
  ABO: "abo",
  SONSTIG: "sonstig",
});

export const QUELLEN = [
  // --- Physisch ---
  { key: "dvd", label: "DVD", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "bluray", label: "Blu-ray", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "cd", label: "CD", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "vhs", label: "VHS", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "dia", label: "Dia", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "rom", label: "ROM", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "filmrolle", label: "Filmrolle", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "diskette", label: "Diskette", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "festplatte", label: "Festplatte", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  { key: "phys_sonst", label: "Sonstiges (physisch)", art: "physisch", klasse: QUELLEN_KLASSEN.PHYSISCH },
  // --- Virtuell (bewusst comichaft breit) ---
  { key: "prime", label: "Prime Video", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "netflix", label: "Netflix", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "disney", label: "Disney+", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "apple", label: "Apple TV / iTunes", art: "virtuell", klasse: QUELLEN_KLASSEN.DIGITAL_GEKAUFT },
  { key: "google", label: "Google Play", art: "virtuell", klasse: QUELLEN_KLASSEN.DIGITAL_GEKAUFT },
  { key: "amazon", label: "Amazon (Kauf)", art: "virtuell", klasse: QUELLEN_KLASSEN.DIGITAL_GEKAUFT },
  { key: "sony", label: "PlayStation Store", art: "virtuell", klasse: QUELLEN_KLASSEN.DIGITAL_GEKAUFT },
  { key: "microsoft", label: "Microsoft Store", art: "virtuell", klasse: QUELLEN_KLASSEN.DIGITAL_GEKAUFT },
  { key: "youtube", label: "YouTube", art: "virtuell", klasse: QUELLEN_KLASSEN.DIGITAL_GEKAUFT },
  { key: "mubi", label: "MUBI", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "hbo", label: "HBO Max", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "paramount", label: "Paramount+", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "crunchyroll", label: "Crunchyroll", art: "virtuell", klasse: QUELLEN_KLASSEN.ABO },
  { key: "gdrive", label: "Google Drive", art: "virtuell", klasse: QUELLEN_KLASSEN.SONSTIG },
  { key: "usenet", label: "Usenet", art: "virtuell", klasse: QUELLEN_KLASSEN.SONSTIG },
  { key: "kinox", label: "kinox.to", art: "virtuell", klasse: QUELLEN_KLASSEN.SONSTIG },
  { key: "virt_sonst", label: "Sonstiges (virtuell)", art: "virtuell", klasse: QUELLEN_KLASSEN.SONSTIG },
];

const KEY_LABEL = Object.fromEntries(QUELLEN.map((q) => [q.key, q.label]));
const KEY_QUELLE = Object.fromEntries(QUELLEN.map((q) => [q.key, q]));
const LABEL_KEY = Object.fromEntries(QUELLEN.map((q) => [q.label.toLowerCase(), q.key]));

export function quellenNachArt(art) { return QUELLEN.filter((q) => q.art === art); }
export function keyVonLabel(label) { return LABEL_KEY[String(label || "").trim().toLowerCase()] || null; }

/* Anzeige: Keys -> lesbare Labels (auch für importierte Fremd-Listen). */
export function quelleLabel(key) {
  if (key === WUNSCH) return "Wunschliste";
  if (key === "import") return "aus Paket";
  if (key === "unklar") return "Quelle offen";
  return KEY_LABEL[key] || key;
}

export function quelleKlasse(key) {
  if (key === WUNSCH || key === "import" || key === "unklar") return QUELLEN_KLASSEN.SONSTIG;
  return KEY_QUELLE[key]?.klasse || QUELLEN_KLASSEN.SONSTIG;
}

export function quelleBadges(q) {
  return quelleZuArray(q)
    .filter((key) => key !== WUNSCH)
    .map((key) => ({ key, label: quelleLabel(key), klasse: quelleKlasse(key) }));
}
export function quelleText(q) {
  const a = quelleZuArray(q).filter((k) => k !== WUNSCH);
  return a.length ? a.map(quelleLabel).join(" · ") : "Wunschliste";
}

/* Besitz = mindestens EINE physische Quelle (Entscheidung 18.07.2026: digitale
   Käufe zählen NICHT — Lizenzgeber können sie entziehen). Einzige Wahrheit für
   den Besitz-Begriff; Array-Prüfung statt Substring (kein includes("dvd")). */
const PHYSISCH_KEYS = new Set(QUELLEN.filter((q) => q.art === "physisch").map((q) => q.key));
export function hatPhysischeQuelle(q) {
  return quelleZuArray(q).some((k) => PHYSISCH_KEYS.has(k));
}

/* String ("vhs+netflix") <-> Array (["vhs","netflix"]) */
export function quelleZuArray(q) {
  if (!q) return [WUNSCH];
  const a = String(q).split("+").map((s) => s.trim()).filter(Boolean);
  return a.length ? a : [WUNSCH];
}
export function arrayZuQuelle(arr) {
  const ohneWunsch = (arr || []).filter((k) => k && k !== WUNSCH);
  return ohneWunsch.length ? ohneWunsch.join("+") : WUNSCH;
}
