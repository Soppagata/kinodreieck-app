import { streamingTitelKennung, vereinigeStreamingTitel } from "./streamingProjection.js";

export const STREAMING_NEU_DAUER_MS = 14 * 24 * 60 * 60 * 1000;

const text = (value) => String(value == null ? "" : value).trim();
const zeitpunkt = (value) => {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function metadaten(bekannt, entdecken, feld) {
  const links = bekannt?.[feld];
  const rechts = entdecken?.[feld];
  return {
    ...(links && typeof links === "object" && !Array.isArray(links) ? links : {}),
    ...(rechts && typeof rechts === "object" && !Array.isArray(rechts) ? rechts : {}),
  };
}

function gueltigerQuellenstand(value, now) {
  const zeit = zeitpunkt(value);
  return zeit != null && zeit <= now ? zeit : null;
}

function gruppiereDiffs(titel, now) {
  if (!Array.isArray(titel?.dienst_diffs)) return [];
  const gruppen = new Map();
  for (const diff of titel.dienst_diffs) {
    const dienst = text(diff?.dienst);
    const erkanntAm = zeitpunkt(diff?.erkannt_am);
    if (!dienst || typeof diff?.vorher !== "boolean" || typeof diff?.nachher !== "boolean"
        || erkanntAm == null || erkanntAm > now) return null;
    const key = new Date(erkanntAm).toISOString();
    if (!gruppen.has(key)) gruppen.set(key, { erkanntAm, diffs: [] });
    gruppen.get(key).diffs.push({ dienst, vorher: diff.vorher, nachher: diff.nachher });
  }
  return [...gruppen.values()].sort((a, b) => b.erkanntAm - a.erkanntAm);
}

/* Rekonstruiert die ausgewählte Angebotsunion vom aktuellen Titelzustand aus
   rückwärts. Nur ein echter false→true-Wechsel der Union beginnt ein
   14-Tage-Fenster; zusätzliche oder gleichzeitig wechselnde gewählte Dienste
   verlängern es nicht. Inkonsistente Producerbelege bleiben fail-closed. */
function neuerZugangSeit(titel, auswahl, staende, vergleichsstaende, now) {
  const gruppen = gruppiereDiffs(titel, now);
  if (!gruppen) return null;
  const gewaehlt = new Set(auswahl);
  const aktuell = new Set((titel?.dienste || []).map(text).filter(Boolean));
  const union = () => [...gewaehlt].some((dienst) => aktuell.has(dienst));
  if (!union()) return null;

  let juengsterZugang = null;
  for (const gruppe of gruppen) {
    const diensteDerGruppe = new Set();
    for (const diff of gruppe.diffs) {
      if (diensteDerGruppe.has(diff.dienst)) return null;
      diensteDerGruppe.add(diff.dienst);
      if (aktuell.has(diff.dienst) !== diff.nachher) return null;
    }
    const nachher = union();
    for (const diff of gruppe.diffs) {
      if (diff.vorher) aktuell.add(diff.dienst);
      else aktuell.delete(diff.dienst);
    }
    const vorher = union();
    if (!vorher && nachher) {
      const belegteAenderung = gruppe.diffs.some((diff) => (
        gewaehlt.has(diff.dienst)
        && diff.vorher === false
        && diff.nachher === true
        && gueltigerQuellenstand(staende[diff.dienst], now) >= gruppe.erkanntAm
        && gueltigerQuellenstand(vergleichsstaende[diff.dienst], now) >= gruppe.erkanntAm
      ));
      if (belegteAenderung && juengsterZugang == null) juengsterZugang = gruppe.erkanntAm;
    }
  }
  return juengsterZugang;
}

export function projiziereStreamingNeu({
  bekannt,
  entdecken,
  auswahl = [],
  auswahlGeladen = true,
  vollstaendig = entdecken?.katalogMengen?.umfang === "voll",
  now = Date.now(),
} = {}) {
  const zeit = zeitpunkt(now);
  const leereAntwort = (status, extra = {}) => Object.freeze({
    status,
    neueIds: Object.freeze([]),
    neuSeit: Object.freeze({}),
    naechsterAblauf: null,
    ...extra,
  });
  if (zeit == null) return leereAntwort("unavailable");
  if (!auswahlGeladen) return leereAntwort("idle");
  if (!vollstaendig) return leereAntwort("loading");
  const gewaehlt = [...new Set((Array.isArray(auswahl) ? auswahl : []).map(text).filter(Boolean))];
  if (!gewaehlt.length) return leereAntwort("ready", { vergleich: "leer-ausgewaehlt" });

  const staende = metadaten(bekannt, entdecken, "stand_pro_quelle");
  const vergleichsstaende = metadaten(bekannt, entdecken, "vergleich_stand_pro_quelle");
  const baselineQuellen = gewaehlt.filter((dienst) => (
    gueltigerQuellenstand(staende[dienst], zeit) == null
    || gueltigerQuellenstand(vergleichsstaende[dienst], zeit) == null
  ));
  if (baselineQuellen.length) {
    return leereAntwort("baseline", { baselineQuellen: Object.freeze(baselineQuellen) });
  }

  const neuSeit = {};
  let naechsterAblauf = null;
  for (const titel of vereinigeStreamingTitel(bekannt, entdecken)) {
    const id = streamingTitelKennung(titel);
    if (!id) continue;
    const seit = neuerZugangSeit(titel, gewaehlt, staende, vergleichsstaende, zeit);
    if (seit == null || zeit >= seit + STREAMING_NEU_DAUER_MS) continue;
    neuSeit[id] = new Date(seit).toISOString();
    const ablauf = seit + STREAMING_NEU_DAUER_MS;
    if (naechsterAblauf == null || ablauf < naechsterAblauf) naechsterAblauf = ablauf;
  }
  return Object.freeze({
    status: "ready",
    neueIds: Object.freeze(Object.keys(neuSeit)),
    neuSeit: Object.freeze(neuSeit),
    naechsterAblauf,
    vergleich: Object.keys(neuSeit).length ? "zugaenge" : "verifiziert-leer",
  });
}

export function streamingQuellenstaende({ bekannt, entdecken, auswahl = [], auswahlGeladen = true, now = Date.now() } = {}) {
  if (!auswahlGeladen) return Object.freeze([]);
  const staende = metadaten(bekannt, entdecken, "stand_pro_quelle");
  const vergleiche = metadaten(bekannt, entdecken, "vergleich_stand_pro_quelle");
  const zeit = zeitpunkt(now) ?? Date.now();
  return Object.freeze([...new Set((Array.isArray(auswahl) ? auswahl : []).map(text).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((dienst) => Object.freeze({
      dienst,
      stand: gueltigerQuellenstand(staende[dienst], zeit) == null ? null : staende[dienst],
      vergleichStand: gueltigerQuellenstand(vergleiche[dienst], zeit) == null ? null : vergleiche[dienst],
    })));
}
