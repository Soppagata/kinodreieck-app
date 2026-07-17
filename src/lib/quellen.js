/* ---------- Quellen (Besitz/Verfügbarkeit eines Titels) ----------
   Zentral & erweiterbar: neue Plattform/Format = EINE Zeile hier.
   Vorfilter „physisch" / „virtuell", dann Auswahl aus der jeweiligen Liste.
   Gespeichert wird als "+"-String der KEYS (z.B. "vhs+netflix") — round-trippt
   unverändert durch Export/Import; zur Anzeige lösen wir Keys -> Labels auf.
   „Wunschliste" (must_watch) = besitze ich (noch) nirgends; das ist der Zustand
   „keine Quelle gewählt". */
export const WUNSCH = "must_watch";

export const QUELLEN = [
  // --- Physisch ---
  { key: "dvd", label: "DVD", art: "physisch" },
  { key: "bluray", label: "Blu-ray", art: "physisch" },
  { key: "vhs", label: "VHS", art: "physisch" },
  { key: "dia", label: "Dia", art: "physisch" },
  { key: "rom", label: "ROM", art: "physisch" },
  { key: "filmrolle", label: "Filmrolle", art: "physisch" },
  { key: "diskette", label: "Diskette", art: "physisch" },
  { key: "festplatte", label: "Festplatte", art: "physisch" },
  { key: "phys_sonst", label: "Sonstiges (physisch)", art: "physisch" },
  // --- Virtuell (bewusst comichaft breit) ---
  { key: "prime", label: "Prime Video", art: "virtuell" },
  { key: "netflix", label: "Netflix", art: "virtuell" },
  { key: "disney", label: "Disney+", art: "virtuell" },
  { key: "apple", label: "Apple TV / iTunes", art: "virtuell" },
  { key: "google", label: "Google Play", art: "virtuell" },
  { key: "amazon", label: "Amazon (Kauf)", art: "virtuell" },
  { key: "sony", label: "PlayStation Store", art: "virtuell" },
  { key: "microsoft", label: "Microsoft Store", art: "virtuell" },
  { key: "youtube", label: "YouTube", art: "virtuell" },
  { key: "mubi", label: "MUBI", art: "virtuell" },
  { key: "hbo", label: "HBO Max", art: "virtuell" },
  { key: "paramount", label: "Paramount+", art: "virtuell" },
  { key: "crunchyroll", label: "Crunchyroll", art: "virtuell" },
  { key: "gdrive", label: "Google Drive", art: "virtuell" },
  { key: "usenet", label: "Usenet", art: "virtuell" },
  { key: "kinox", label: "kinox.to", art: "virtuell" },
  { key: "virt_sonst", label: "Sonstiges (virtuell)", art: "virtuell" },
];

const KEY_LABEL = Object.fromEntries(QUELLEN.map((q) => [q.key, q.label]));
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
export function quelleText(q) {
  const a = quelleZuArray(q).filter((k) => k !== WUNSCH);
  return a.length ? a.map(quelleLabel).join(" · ") : "Wunschliste";
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
