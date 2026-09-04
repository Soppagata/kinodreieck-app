import { staffelHinweis } from "./staffeln.js";

export const SERIES_WATCH_TIME_ZONE = "Europe/Vienna";
export const SERIES_WATCH_CATALOG_FRESHNESS_MS = 2 * 24 * 60 * 60 * 1000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_ZONE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):?(\d{2}))$/i;
const viennaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERIES_WATCH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function positiveGanzzahl(wert) {
  if (wert == null || typeof wert === "boolean" || (typeof wert === "string" && !wert.trim())) return null;
  const zahl = Number(wert);
  return Number.isInteger(zahl) && zahl >= 1 ? zahl : null;
}

function gueltigesKalenderdatum(wert) {
  const match = DATE_ONLY.exec(String(wert || ""));
  if (!match) return null;
  const jahr = Number(match[1]);
  const monat = Number(match[2]);
  const tag = Number(match[3]);
  const datum = new Date(Date.UTC(jahr, monat - 1, tag, 12));
  if (datum.getUTCFullYear() !== jahr || datum.getUTCMonth() !== monat - 1 || datum.getUTCDate() !== tag) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function datumsteileInWien(datum) {
  const teile = Object.fromEntries(viennaDateFormatter.formatToParts(datum)
    .filter((teil) => teil.type !== "literal")
    .map((teil) => [teil.type, teil.value]));
  return `${teile.year}-${teile.month}-${teile.day}`;
}

function isoZeitpunkt(wert) {
  const roh = String(wert || "");
  const match = ISO_WITH_ZONE.exec(roh);
  if (!match || !gueltigesKalenderdatum(match[1])) return null;
  const stunde = Number(match[2]);
  const minute = Number(match[3]);
  const sekunde = Number(match[4] || 0);
  const offsetStunde = Number(match[6] || 0);
  const offsetMinute = Number(match[7] || 0);
  if (stunde > 23 || minute > 59 || sekunde > 59 || offsetStunde > 14
      || offsetMinute > 59 || (offsetStunde === 14 && offsetMinute > 0)) return null;
  const zeitpunkt = Date.parse(roh);
  return Number.isFinite(zeitpunkt) ? zeitpunkt : null;
}

/* Veröffentlichungsdaten sind entweder echte Kalendertage oder eindeutige
   Zeitpunkte. Ein ISO-String ohne Offset wird bewusst nicht geraten. */
export function wienerKalendertag(wert = new Date()) {
  const kalenderdatum = gueltigesKalenderdatum(wert);
  if (kalenderdatum) return kalenderdatum;
  const zeitpunkt = typeof wert === "string" ? isoZeitpunkt(wert) : new Date(wert).getTime();
  if (!Number.isFinite(zeitpunkt)) return null;
  const datum = new Date(zeitpunkt);
  return Number.isFinite(datum.getTime()) ? datumsteileInWien(datum) : null;
}

function kalenderdatumPlus(iso, tage) {
  const match = DATE_ONLY.exec(String(iso || ""));
  if (!match) return null;
  const datum = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + tage, 12));
  return `${datum.getUTCFullYear()}-${String(datum.getUTCMonth() + 1).padStart(2, "0")}-${String(datum.getUTCDate()).padStart(2, "0")}`;
}

function frischerKatalogstand(wert, jetzt) {
  const geprueft = isoZeitpunkt(wert);
  const aktuell = new Date(jetzt).getTime();
  const alter = aktuell - Number(geprueft);
  return geprueft != null && Number.isFinite(aktuell)
    && alter >= 0 && alter < SERIES_WATCH_CATALOG_FRESHNESS_MS;
}

function identitaetAus(wert, art) {
  const objekt = wert && typeof wert === "object" ? wert : {};
  const staffel = positiveGanzzahl(objekt.season_number ?? objekt.staffel ?? (art === "staffel" ? objekt.nummer : null));
  const folge = positiveGanzzahl(objekt.episode_number ?? objekt.folge ?? (art === "folge" ? objekt.nummer : null)
    ?? (art === "folge" && typeof wert !== "object" ? wert : null));
  const direkteStaffel = art === "staffel" && typeof wert !== "object" ? positiveGanzzahl(wert) : null;
  return { staffel: staffel ?? direkteStaffel, folge };
}

function datumAusEreignis(wert) {
  if (!wert || typeof wert !== "object") return null;
  return wert.release_date ?? wert.air_date ?? wert.datum ?? wert.date ?? null;
}

function staffelKandidat(titel, hinweis) {
  if (!hinweis.staffel_neu) return null;
  const identitaet = identitaetAus(titel.naechste_staffel, "staffel");
  const staffel = identitaet.staffel ?? positiveGanzzahl(hinweis.staffel_verfuegbar);
  const datum = datumAusEreignis(titel.naechste_staffel) ?? titel.naechste_staffel_am;
  return staffel != null && datum ? { art: "staffel", staffel, folge: null, datum } : null;
}

function folgenKandidat(titel, hinweis) {
  if (!hinweis.folgen_neu) return null;
  const kandidaten = [
    { wert: titel.letzte_folge, datum: datumAusEreignis(titel.letzte_folge) ?? titel.letzte_folge_am },
    { wert: titel.naechste_folge, datum: datumAusEreignis(titel.naechste_folge) ?? titel.naechste_folge_am },
    { wert: titel.folge_aktuell, datum: titel.folge_aktuell_am },
  ];
  for (const kandidat of kandidaten) {
    const identitaet = identitaetAus(kandidat.wert, "folge");
    if (identitaet.folge != null && kandidat.datum) return { art: "folge", ...identitaet, datum: kandidat.datum };
  }
  return null;
}

function belegteDienste(titel) {
  const roh = [
    ...(Array.isArray(titel.staffel_dienste) ? titel.staffel_dienste : []),
    ...(Array.isArray(titel.dienste) ? titel.dienste : []),
    ...(typeof titel.plattform === "string" ? [titel.plattform] : []),
  ];
  return [...new Set(roh.filter((wert) => typeof wert === "string").map((wert) => wert.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "de"));
}

function folgenstand(kandidat) {
  if (kandidat.art === "staffel") return `Staffel ${kandidat.staffel}`;
  return `${kandidat.staffel ? `Staffel ${kandidat.staffel} · ` : ""}Folge ${kandidat.folge}`;
}

function ereignisSchluessel(watchmodeId, kandidat, datum) {
  return [
    "series-watch", watchmodeId, kandidat.art,
    `s${kandidat.staffel ?? "-"}`, `e${kandidat.folge ?? "-"}`, datum,
  ].join(":");
}

/* Reine Projektion aus dem bereits geladenen Katalog. Sie persistiert nichts,
   startet keinen Abruf und bleibt bei jeder fehlenden Vertragsangabe leer. */
export function beobachteteSerienEreignisse(titel, statusMap, jetzt = new Date()) {
  const heute = wienerKalendertag(jetzt);
  const ende = heute && kalenderdatumPlus(heute, 6);
  if (!heute || !ende) return [];
  const dedupliziert = new Map();

  for (const eintrag of Array.isArray(titel) ? titel : []) {
    const watchmodeId = positiveGanzzahl(eintrag?.watchmode_id);
    if (watchmodeId == null || !frischerKatalogstand(eintrag?.staffelstand_geprueft_am, jetzt)) continue;
    const hinweis = staffelHinweis(eintrag, statusMap?.[eintrag.watchmode_id] ?? statusMap?.[watchmodeId]);
    const dienste = belegteDienste(eintrag);
    if (!hinweis || !dienste.length) continue;

    for (const kandidat of [staffelKandidat(eintrag, hinweis), folgenKandidat(eintrag, hinweis)].filter(Boolean)) {
      const datum = wienerKalendertag(kandidat.datum);
      if (!datum || datum < heute || datum > ende) continue;
      const id = ereignisSchluessel(watchmodeId, kandidat, datum);
      const bereich = eintrag.wochen_bereich === "programm" ? "programm" : "entdecken";
      const vorhanden = dedupliziert.get(id);
      if (vorhanden) {
        const plattformen = [...new Set([...vorhanden.plattformen, ...dienste])]
          .sort((a, b) => a.localeCompare(b, "de"));
        const zielBereich = vorhanden.ziel.bereich === "programm" || bereich === "programm" ? "programm" : "entdecken";
        dedupliziert.set(id, {
          ...vorhanden,
          plattformen,
          plattform: plattformen.join(" · "),
          ref: { watchmode_id: watchmodeId, streaming_art: zielBereich },
          ziel: { art: "streaming", bereich: zielBereich, ref: watchmodeId },
        });
        continue;
      }
      dedupliziert.set(id, {
        id,
        dedupeKey: id,
        art: kandidat.art,
        titel: String(eintrag.titel || "").trim() || `Serie ${watchmodeId}`,
        datum,
        startdatum: datum,
        uhrzeit: "",
        staffel: kandidat.staffel,
        folge: kandidat.folge,
        folgenstand: folgenstand(kandidat),
        plattformen: dienste,
        plattform: dienste.join(" · "),
        geprueft_am: eintrag.staffelstand_geprueft_am,
        ref: { watchmode_id: watchmodeId, streaming_art: bereich },
        ziel: { art: "streaming", bereich, ref: watchmodeId },
        abgeleitet: "beobachtet",
      });
    }
  }

  return [...dedupliziert.values()].sort((a, b) => a.datum.localeCompare(b.datum)
    || a.titel.localeCompare(b.titel, "de") || a.id.localeCompare(b.id));
}
