import {
  istStreamingDienstAusgewaehlt,
  streamingTitelKennung,
  vereinigeStreamingTitel,
} from "./streamingProjection.js";

export const STREAMING_NEU_DAUER_MS = 14 * 24 * 60 * 60 * 1000;
export const STREAMING_NEU_UEBERGANG_FORMAT = 2;
export const STREAMING_NEU_UEBERGANG_KEY_PREFIX = "kd:streaming-neu:v2:";
export const STREAMING_NEU_FRISTENBUCH_FORMAT = 1;
export const STREAMING_NEU_FRISTENBUCH_KEY_PREFIX = "kd:streaming-neu:fristen:v1:";

const text = (value) => String(value == null ? "" : value).trim();
const zeitpunkt = (value) => {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const rawValue = (raw) => {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

export function streamingNeuUebergangStorageKey(owner) {
  const saubererOwner = text(owner);
  return saubererOwner ? STREAMING_NEU_UEBERGANG_KEY_PREFIX + encodeURIComponent(saubererOwner) : null;
}

export function streamingNeuAuswahlSignatur(auswahl) {
  if (!Array.isArray(auswahl)) return null;
  const dienste = [...new Set(auswahl.map(text).filter(Boolean))].sort();
  return dienste.length ? JSON.stringify(dienste) : null;
}

export function streamingNeuFristenbuchStorageKey(owner, auswahl) {
  const saubererOwner = text(owner);
  const signatur = streamingNeuAuswahlSignatur(auswahl);
  return saubererOwner && signatur
    ? `${STREAMING_NEU_FRISTENBUCH_KEY_PREFIX}${encodeURIComponent(saubererOwner)}:${encodeURIComponent(signatur)}`
    : null;
}

/* App-SN14 schrieb diesen kleinen, ownergebundenen v2-Verlauf vor E12 bereits
   auf das Gerät. E12 ließ ihn liegen, las ihn aber nicht mehr. Der
   Übergangsleser übernimmt ausschließlich gültige Neu-Einträge samt
   ursprünglicher Frist; v1-Baselines und jede Kataloghistorie bleiben außen. */
export function parseStreamingNeuUebergang(raw, owner) {
  const value = rawValue(raw);
  const saubererOwner = text(owner);
  const runAt = zeitpunkt(value?.runId);
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.format !== STREAMING_NEU_UEBERGANG_FORMAT
      || text(value.owner) !== saubererOwner || !saubererOwner
      || runAt == null || !Array.isArray(value.ids) || !Array.isArray(value.neu)) return null;
  if (value.coverage != null) {
    if (typeof value.coverage !== "string") return null;
    try {
      const dienste = JSON.parse(value.coverage);
      const normalisiert = Array.isArray(dienste)
        ? JSON.stringify([...new Set(dienste.map(text))].filter(Boolean).sort())
        : null;
      if (!normalisiert || normalisiert !== value.coverage) return null;
    } catch { return null; }
  }

  const ids = new Set();
  for (const rawId of value.ids) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0 || ids.has(id)) return null;
    ids.add(id);
  }
  const gesehen = new Set();
  const neu = [];
  for (const entry of value.neu) {
    const id = Number(entry?.id);
    const firstSeenAt = zeitpunkt(entry?.firstSeenAt);
    if (!Number.isInteger(id) || id <= 0 || !ids.has(id) || gesehen.has(id)
        || firstSeenAt == null || firstSeenAt > runAt) return null;
    gesehen.add(id);
    neu.push(Object.freeze({ id: String(id), firstSeenAt }));
  }
  neu.sort((a, b) => a.firstSeenAt - b.firstSeenAt || a.id.localeCompare(b.id));
  return Object.freeze({ owner: saubererOwner, neu: Object.freeze(neu) });
}

export function parseStreamingNeuFristenbuch(raw, owner, auswahl) {
  const value = rawValue(raw);
  const saubererOwner = text(owner);
  const auswahlSignatur = streamingNeuAuswahlSignatur(auswahl);
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.format !== STREAMING_NEU_FRISTENBUCH_FORMAT
      || text(value.owner) !== saubererOwner || !saubererOwner
      || value.auswahl !== auswahlSignatur || !auswahlSignatur
      || typeof value.v2Uebernommen !== "boolean"
      || !Array.isArray(value.eintraege)) return null;
  const gesehen = new Set();
  const eintraege = [];
  for (const entry of value.eintraege) {
    const id = Number(entry?.id);
    const fensterBeginn = zeitpunkt(entry?.fensterBeginn);
    const verbrauchtBis = zeitpunkt(entry?.verbrauchtBis);
    if (!Number.isInteger(id) || id <= 0 || gesehen.has(id)
        || fensterBeginn == null || verbrauchtBis == null || verbrauchtBis < fensterBeginn) return null;
    gesehen.add(id);
    eintraege.push(Object.freeze({ id: String(id), fensterBeginn, verbrauchtBis }));
  }
  eintraege.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({
    format: STREAMING_NEU_FRISTENBUCH_FORMAT,
    owner: saubererOwner,
    auswahl: auswahlSignatur,
    v2Uebernommen: value.v2Uebernommen,
    eintraege: Object.freeze(eintraege),
  });
}

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
function belegteUnionZugaenge(titel, auswahl, staende, vergleichsstaende, now) {
  const gruppen = gruppiereDiffs(titel, now);
  if (!gruppen) return null;
  const gewaehlt = new Set(auswahl);
  const aktuell = new Set((titel?.dienste || []).map(text).filter(Boolean));
  const union = () => [...gewaehlt].some((dienst) => aktuell.has(dienst));

  const zugaenge = [];
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
      if (belegteAenderung) zugaenge.push(gruppe.erkanntAm);
    }
  }
  return zugaenge.sort((a, b) => a - b);
}

function neuerZugangSeit(titel, auswahl, staende, vergleichsstaende, now) {
  if (!istStreamingDienstAusgewaehlt(titel, auswahl, true)) return null;
  const zugaenge = belegteUnionZugaenge(titel, auswahl, staende, vergleichsstaende, now);
  if (!zugaenge) return null;
  /* Mehrere Zugänge innerhalb desselben aktiven Fensters gehören zu einer
     Frist. Nur wenn der vorige Zugang beim Wiederzugang bereits abgelaufen
     war, beginnt tatsächlich ein neues Fenster. */
  let beginn = null;
  for (const zugang of zugaenge) {
    if (beginn == null || zugang >= beginn + STREAMING_NEU_DAUER_MS) beginn = zugang;
  }
  return beginn;
}

export function aktualisiereStreamingNeuFristenbuch(vorher, {
  owner, auswahl = [], bekannt, entdecken, uebergang = null, now = Date.now(),
} = {}) {
  const zeit = zeitpunkt(now);
  const saubererOwner = text(owner);
  const auswahlSignatur = streamingNeuAuswahlSignatur(auswahl);
  if (zeit == null || !saubererOwner || !auswahlSignatur) return null;
  const alt = parseStreamingNeuFristenbuch(vorher, saubererOwner, auswahl);
  const map = new Map();
  for (const entry of alt?.eintraege || []) {
    if (entry.fensterBeginn <= zeit && entry.verbrauchtBis <= zeit) map.set(entry.id, { ...entry });
  }
  const staende = metadaten(bekannt, entdecken, "stand_pro_quelle");
  const vergleichsstaende = metadaten(bekannt, entdecken, "vergleich_stand_pro_quelle");
  const alleTitel = vereinigeStreamingTitel(bekannt, entdecken);
  if (!alt?.v2Uebernommen) {
    const aktuelleAuswahlIds = new Set(alleTitel
      .filter((titel) => istStreamingDienstAusgewaehlt(titel, auswahl, true))
      .map(streamingTitelKennung)
      .filter(Boolean));
    for (const entry of uebergang?.neu || []) {
      const id = text(entry?.id);
      const firstSeenAt = zeitpunkt(entry?.firstSeenAt);
      if (!id || !aktuelleAuswahlIds.has(id) || map.has(id)
          || firstSeenAt == null || firstSeenAt > zeit) continue;
      map.set(id, { id, fensterBeginn: firstSeenAt, verbrauchtBis: firstSeenAt });
    }
  }
  for (const titel of alleTitel) {
    const id = streamingTitelKennung(titel);
    if (!id) continue;
    const zugaenge = belegteUnionZugaenge(titel, auswahl, staende, vergleichsstaende, zeit);
    if (!zugaenge?.length) continue;
    let entry = map.get(id) || null;
    for (const zugang of zugaenge) {
      if (entry && zugang <= entry.verbrauchtBis) continue;
      if (!entry || zugang >= entry.fensterBeginn + STREAMING_NEU_DAUER_MS) {
        entry = { id, fensterBeginn: zugang, verbrauchtBis: zugang };
      } else {
        entry.verbrauchtBis = zugang;
      }
    }
    if (entry) map.set(id, entry);
  }
  const eintraege = [...map.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => Object.freeze({ ...entry }));
  const fristenbuch = Object.freeze({
    format: STREAMING_NEU_FRISTENBUCH_FORMAT,
    owner: saubererOwner,
    auswahl: auswahlSignatur,
    v2Uebernommen: true,
    eintraege: Object.freeze(eintraege),
  });
  return Object.freeze({
    fristenbuch,
    geaendert: !alt || JSON.stringify(alt) !== JSON.stringify(fristenbuch),
  });
}

export function projiziereStreamingNeu({
  bekannt,
  entdecken,
  auswahl = [],
  auswahlGeladen = true,
  vollstaendig = entdecken?.katalogMengen?.umfang === "voll",
  uebergang = null,
  fristenbuch = null,
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
  const alleTitel = vereinigeStreamingTitel(bekannt, entdecken);
  const aktuelleAuswahlIds = new Set(alleTitel
    .filter((titel) => istStreamingDienstAusgewaehlt(titel, gewaehlt, true))
    .map(streamingTitelKennung)
    .filter(Boolean));
  const neuSeit = {};
  const fristenIds = new Set();
  for (const entry of fristenbuch?.eintraege || []) {
    const id = text(entry?.id);
    const fensterBeginn = zeitpunkt(entry?.fensterBeginn);
    if (!id || fensterBeginn == null || fensterBeginn > zeit) continue;
    fristenIds.add(id);
    if (aktuelleAuswahlIds.has(id) && zeit < fensterBeginn + STREAMING_NEU_DAUER_MS) {
      neuSeit[id] = new Date(fensterBeginn).toISOString();
    }
  }
  for (const entry of uebergang?.neu || []) {
    const id = text(entry?.id);
    const firstSeenAt = zeitpunkt(entry?.firstSeenAt);
    if (!id || fristenIds.has(id) || !aktuelleAuswahlIds.has(id) || firstSeenAt == null
        || firstSeenAt > zeit || zeit >= firstSeenAt + STREAMING_NEU_DAUER_MS) continue;
    neuSeit[id] = new Date(firstSeenAt).toISOString();
  }
  const antworteMitNeu = (extra = {}) => {
    let naechsterAblauf = null;
    for (const seit of Object.values(neuSeit)) {
      const ablauf = zeitpunkt(seit) + STREAMING_NEU_DAUER_MS;
      if (naechsterAblauf == null || ablauf < naechsterAblauf) naechsterAblauf = ablauf;
    }
    return Object.freeze({
      status: "ready",
      neueIds: Object.freeze(Object.keys(neuSeit)),
      neuSeit: Object.freeze(neuSeit),
      naechsterAblauf,
      vergleich: Object.keys(neuSeit).length ? "zugaenge" : "verifiziert-leer",
      ...extra,
    });
  };
  const baselineQuellen = gewaehlt.filter((dienst) => (
    gueltigerQuellenstand(staende[dienst], zeit) == null
    || gueltigerQuellenstand(vergleichsstaende[dienst], zeit) == null
  ));
  if (baselineQuellen.length) {
    /* Ein fehlender neuer Vergleich darf keine Zugänge erfinden. Bereits vor
       E12 gültig gespeicherte Einzelfristen hängen von dieser späteren
       Quellenbaseline jedoch nicht ab und bleiben bis zu ihrem Ablauf sichtbar. */
    if (Object.keys(neuSeit).length) {
      return antworteMitNeu({ baselineQuellen: Object.freeze(baselineQuellen) });
    }
    return leereAntwort("baseline", { baselineQuellen: Object.freeze(baselineQuellen) });
  }

  for (const titel of alleTitel) {
    const id = streamingTitelKennung(titel);
    if (!id || fristenIds.has(id)) continue;
    const seit = neuerZugangSeit(titel, gewaehlt, staende, vergleichsstaende, zeit);
    if (seit == null || zeit >= seit + STREAMING_NEU_DAUER_MS) continue;
    const bisher = zeitpunkt(neuSeit[id]);
    if (bisher == null || seit < bisher) neuSeit[id] = new Date(seit).toISOString();
  }
  return antworteMitNeu();
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
