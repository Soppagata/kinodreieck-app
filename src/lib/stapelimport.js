import { norm } from "./match.js";

export const STAPEL_MAX_ZEILEN = 60;
export const STAPEL_MAX_ZEICHEN = 12_000;
export const EXTERNER_STAPEL_WORKFLOW_VERSION = "mediathek-v2";
export const EXTERNER_STAPEL_WORKFLOW_DATEINAME = `kinodreieck-${EXTERNER_STAPEL_WORKFLOW_VERSION}.md`;
export const STAPEL_TYPEN = ["film", "serie", "musik"];
export const STAPEL_STANDARD_QUELLEN = [
  { key: "unklar", label: "Gemischt / pro Zeile angegeben" },
  { key: "dvd", label: "DVD" },
  { key: "bluray", label: "Blu-ray" },
  { key: "cd", label: "CD" },
];
export const STAPEL_QUELLEN = [
  { key: "unklar", label: "Quelle später ergänzen" },
  { key: "dvd", label: "DVD" }, { key: "bluray", label: "Blu-ray" }, { key: "cd", label: "CD" },
  { key: "vhs", label: "VHS" }, { key: "filmrolle", label: "Filmrolle" },
  { key: "festplatte", label: "Festplatte" }, { key: "phys_sonst", label: "Sonstiges (physisch)" },
  { key: "apple", label: "Apple TV / iTunes (Kauf)" }, { key: "google", label: "Google Play (Kauf)" },
  { key: "amazon", label: "Amazon (Kauf)" }, { key: "sony", label: "PlayStation Store (Kauf)" },
  { key: "microsoft", label: "Microsoft Store (Kauf)" }, { key: "youtube", label: "YouTube (Kauf)" },
  { key: "virt_sonst", label: "Sonstiger digitaler Kauf" },
];
const STAPEL_QUELLEN_KEYS = new Set(STAPEL_QUELLEN.map((q) => q.key));
export const STAPEL_PARTIAL_HINWEIS = "Die Medienliste war teilweise unvollständig. Nur sichere Einträge werden angezeigt; offene Zeilen bleiben separat erhalten.";
export const STAPEL_DEGRADED_HINWEIS = "Die KI-Antwort konnte nicht sicher in Medieneinträge umgewandelt werden.";

const STAPEL_FEHLGRUENDE = new Set([
  "Der Medieneintrag hatte kein lesbares Objektformat.",
  "Der Medieneintrag ließ sich keiner Eingabezeile sicher zuordnen.",
  "Der Titel fehlt oder ist nicht sicher lesbar.",
  "Der Medientyp ist nicht sicher zuordenbar.",
  "Für diese Eingabezeile kam kein sicher prüfbarer Medieneintrag zurück.",
]);
const STAPEL_STANDARD_FEHLGRUND = "Dieser Eintrag konnte nicht sicher übernommen werden.";
const STAPEL_WARNUNG_UNSICHER = /(?:https:\/\/|sk-ant-|sbp_|bearer\s+|(?:authorization|x-api-key|api[_ -]?key|password|passwort|service[_ -]?role|secret|token)\s*[=:]|<\/?(?:thinking|system|developer|prompt)\b|chain[ -]of[ -]thought|system(?:-| )prompt|developer(?:-| )message)/i;

const kurz = (wert, max) => String(wert ?? "")
  .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);
const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);
const eigenerWert = (objekt, feld) => istObjekt(objekt) && Object.prototype.hasOwnProperty.call(objekt, feld)
  ? objekt[feld] : undefined;
const sichererIndex = (wert, fallback = null) => Number.isInteger(wert) && wert >= 0 && wert < STAPEL_MAX_ZEILEN
  ? wert : fallback;
const sichererGrund = (wert) => {
  const grund = kurz(wert, 180);
  return STAPEL_FEHLGRUENDE.has(grund) ? grund : STAPEL_STANDARD_FEHLGRUND;
};
const sichereWarnung = (wert) => {
  const warnung = kurz(wert, 180);
  return warnung && !STAPEL_WARNUNG_UNSICHER.test(warnung) ? warnung : "";
};

function normalisiereIndex(lokalerIndex, indexMap) {
  const lokal = sichererIndex(lokalerIndex);
  if (lokal === null) return null;
  return Array.isArray(indexMap) ? sichererIndex(indexMap[lokal]) : lokal;
}

function fehlEintrag(index, zustand = "fehlgeschlagen", grund = STAPEL_STANDARD_FEHLGRUND, id = null) {
  return {
    id: /^stapel-(?:ausgabe-)?\d+$/.test(String(id || "")) ? String(id) : `stapel-${index}`,
    index,
    zustand: zustand === "offen" ? "offen" : "fehlgeschlagen",
    grund: sichererGrund(grund),
  };
}

export function vorbereiteTitelliste(text) {
  const roh = String(text || "").replace(/\r/g, "");
  if (roh.length > STAPEL_MAX_ZEICHEN) {
    throw new Error(`Die Liste ist länger als ${STAPEL_MAX_ZEICHEN.toLocaleString("de-AT")} Zeichen. Bitte teile sie auf mehrere Durchgänge auf.`);
  }
  const gesehen = new Set();
  const zeilen = [];
  for (const rohzeile of roh.split("\n")) {
    const zeile = kurz(rohzeile.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, ""), 240);
    if (!zeile) continue;
    const key = norm(zeile);
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    zeilen.push(zeile);
  }
  if (!zeilen.length) throw new Error("Schreibe oder kopiere zuerst mindestens einen Titel in die Liste.");
  if (zeilen.length > STAPEL_MAX_ZEILEN) {
    throw new Error(`Pro Durchgang sind höchstens ${STAPEL_MAX_ZEILEN} Titel möglich. Bitte teile die Sammlung auf.`);
  }
  return zeilen;
}

export function baueStapelPayload(text, standardQuelle = "unklar", vorbeurteilen = false, bewertungen = []) {
  const zeilen = vorbereiteTitelliste(text);
  const quelle = STAPEL_STANDARD_QUELLEN.some((q) => q.key === standardQuelle) ? standardQuelle : "unklar";
  const komplett = (bewertungen || []).filter((b) =>
    b && typeof b.titel === "string" && [b.wie, b.was, b.warum].every((v) => v !== "" && v !== null && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 5)
  ).slice(0, 10).map((b) => ({ titel: kurz(b.titel, 160), wie: Number(b.wie), was: Number(b.was), warum: Number(b.warum) }));
  if (vorbeurteilen && komplett.length < 5) throw new Error("Für die Vorbeurteilung brauche ich mindestens fünf vollständige Kurzbewertungen.");
  return { liste: zeilen, standardQuelle: quelle, vorbeurteilen: vorbeurteilen === true, bewertungen: vorbeurteilen ? komplett : [] };
}

export function normalisiereStapelAntwort(antwort, master = [], { indexMap = null } = {}) {
  const hatData = istObjekt(antwort) && Object.prototype.hasOwnProperty.call(antwort, "data");
  const daten = hatData ? antwort.data : antwort;
  const gemeldeterModus = ["structured", "partial", "degraded"].includes(antwort?.responseMode)
    ? antwort.responseMode : null;
  const erwarteteIndices = Array.isArray(indexMap)
    ? [...new Set(indexMap.map((index) => sichererIndex(index)).filter((index) => index !== null))]
    : [];
  if (gemeldeterModus === "degraded" || daten === null) {
    return {
      kandidaten: [],
      fehlmenge: erwarteteIndices.map((index) => fehlEintrag(
        index,
        "offen",
        "Für diese Eingabezeile kam kein sicher prüfbarer Medieneintrag zurück.",
      )),
      warnungen: [],
      responseMode: "degraded",
      displayText: STAPEL_DEGRADED_HINWEIS,
    };
  }

  const roh = daten?.kandidaten;
  if (!Array.isArray(roh)) {
    if (!erwarteteIndices.length) throw new Error("Die KI-Antwort enthält keine lesbaren Einträge.");
    return {
      kandidaten: [],
      fehlmenge: erwarteteIndices.map((index) => fehlEintrag(
        index,
        "offen",
        "Für diese Eingabezeile kam kein sicher prüfbarer Medieneintrag zurück.",
      )),
      warnungen: [],
      responseMode: "partial",
      displayText: STAPEL_PARTIAL_HINWEIS,
    };
  }
  const masterKeys = new Set((master || []).map((e) => `${norm(e.titel)}|${e.jahr ?? ""}`));
  const gesehen = new Set();
  const kandidaten = [];
  const fehlNachId = new Map();
  const abgedeckteIndices = new Set();
  for (const [index, kandidat] of roh.slice(0, STAPEL_MAX_ZEILEN).entries()) {
    const gemeldeterIndex = eigenerWert(kandidat, "index") ?? eigenerWert(kandidat, "eingabeIndex");
    const quellIndex = sichererIndex(gemeldeterIndex, index);
    const stabilerIndex = normalisiereIndex(quellIndex, indexMap);
    if (stabilerIndex === null) continue;
    abgedeckteIndices.add(stabilerIndex);
    const serverId = eigenerWert(kandidat, "id");
    const id = Array.isArray(indexMap) ? `stapel-${stabilerIndex}` : serverId;
    if (!istObjekt(kandidat) || (kandidat.zustand !== undefined && kandidat.zustand !== "ok")) {
      const fehl = fehlEintrag(stabilerIndex, "fehlgeschlagen", eigenerWert(kandidat, "grund"), id);
      fehlNachId.set(fehl.id, fehl);
      continue;
    }
    const titel = kurz(kandidat?.titel, 160);
    if (!titel || !STAPEL_TYPEN.includes(kandidat?.typ)) {
      const grund = !titel ? "Der Titel fehlt oder ist nicht sicher lesbar." : "Der Medientyp ist nicht sicher zuordenbar.";
      const fehl = fehlEintrag(stabilerIndex, "fehlgeschlagen", grund, id);
      fehlNachId.set(fehl.id, fehl);
      continue;
    }
    const typ = kandidat.typ;
    const jahrZahl = Number(kandidat?.jahr);
    const jahr = Number.isInteger(jahrZahl) && jahrZahl >= 1888 && jahrZahl <= 2100 ? jahrZahl : null;
    const schluessel = `${norm(titel)}|${jahr ?? ""}|${typ}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const quelle = STAPEL_QUELLEN_KEYS.has(kandidat?.quelle) ? kandidat.quelle : "unklar";
    const staffeln = typ === "serie" ? kurz(kandidat?.staffeln, 80) || null : null;
    const gemeldeteBegruendung = kurz(kandidat?.begruendung, 300);
    const vorbeurteilung = ["passt", "eher_nicht"].includes(kandidat?.vorbeurteilung) && gemeldeteBegruendung
      ? kandidat.vorbeurteilung : "offen";
    kandidaten.push({
      id: `stapel-${stabilerIndex}`,
      index: stabilerIndex,
      zustand: "ok",
      titel, typ, jahr, quelle, staffeln, vorbeurteilung,
      begruendung: vorbeurteilung === "offen" ? "" : gemeldeteBegruendung,
      sicherheit: ["hoch", "mittel", "niedrig"].includes(kandidat?.sicherheit) ? kandidat.sicherheit : "niedrig",
      ausgewaehlt: true,
      vorhandenMediathek: masterKeys.has(`${norm(titel)}|${jahr ?? ""}`),
    });
  }
  const serverFehlmenge = Array.isArray(daten?.fehlmenge) ? daten.fehlmenge : [];
  for (const [fallbackIndex, rohFehl] of serverFehlmenge.slice(0, STAPEL_MAX_ZEILEN).entries()) {
    if (!istObjekt(rohFehl)) continue;
    const quellIndex = sichererIndex(rohFehl.index, fallbackIndex);
    const index = normalisiereIndex(quellIndex, indexMap);
    if (index === null) continue;
    abgedeckteIndices.add(index);
    const id = Array.isArray(indexMap) ? `stapel-${index}` : rohFehl.id;
    const fehl = fehlEintrag(index, rohFehl.zustand, rohFehl.grund, id);
    fehlNachId.set(fehl.id, fehl);
  }
  for (const index of erwarteteIndices) {
    if (abgedeckteIndices.has(index)) continue;
    const fehl = fehlEintrag(
      index,
      "offen",
      "Für diese Eingabezeile kam kein sicher prüfbarer Medieneintrag zurück.",
    );
    fehlNachId.set(fehl.id, fehl);
  }
  for (const kandidat of kandidaten) fehlNachId.delete(kandidat.id);
  const fehlmenge = [...fehlNachId.values()].sort((a, b) => a.index - b.index);
  if (!kandidaten.length && !fehlmenge.length) {
    throw new Error("Es wurde kein eindeutiger Film-, Serien- oder Musiktitel erkannt.");
  }
  const responseMode = gemeldeterModus === "partial" || fehlmenge.length ? "partial" : "structured";
  return {
    kandidaten,
    fehlmenge,
    warnungen: Array.isArray(daten?.warnungen)
      ? daten.warnungen.map(sichereWarnung).filter(Boolean).slice(0, 8)
      : [],
    responseMode,
    displayText: responseMode === "partial" ? STAPEL_PARTIAL_HINWEIS : null,
  };
}

function notizFuer(k) {
  const teile = [];
  if (k.staffeln) teile.push(`Staffel(n): ${k.staffeln}`);
  if (k.vorbeurteilung && k.vorbeurteilung !== "offen") teile.push(`KI-Voreindruck: ${k.vorbeurteilung === "passt" ? "passt wahrscheinlich" : "passt eher nicht"}`);
  if (k.begruendung) teile.push(k.begruendung);
  return teile.join(" · ");
}

export function baueStapelUebernahme(kandidaten) {
  const mediathek = [];
  for (const k of kandidaten || []) {
    if (!k.ausgewaehlt || k.vorhandenMediathek || (k.zustand && k.zustand !== "ok") || !STAPEL_TYPEN.includes(k.typ)) continue;
    const quelle = STAPEL_QUELLEN_KEYS.has(k.quelle) ? k.quelle : "unklar";
    mediathek.push({
      titel: k.titel, originaltitel: k.titel, jahr: k.jahr, jahr_bis: null,
      typ: k.typ,
      quelle, quelle_unklar: quelle === "unklar", kategorie: null, bewertung: null,
      genre: [], tags: [], begruendung: "", beschreibung: "", notiz: notizFuer(k),
      status: "gesetzt", bewertet_von: null,
    });
  }
  return { mediathek, mustwatch: [] };
}

/* Ein einziger Produktionsweg fuer die bestaetigte Auswahl. Die KI-Teilantwort
   bleibt eine Vorschau; erst diese Funktion reicht ausschliesslich angehakte,
   sichere und noch nicht vorhandene Items an den vorhandenen Schreibadapter.
   Ein Teilausfall fuehrt nie zu einem automatischen Vollretry. */
export async function persistiereStapelAuswahl(
  kandidaten,
  { addFilme, addFilm } = {},
) {
  const { mediathek } = baueStapelUebernahme(kandidaten);
  if (!mediathek.length) return { eintraege: 0 };
  if (typeof addFilme === "function") {
    const ids = await addFilme(mediathek);
    if (ids == null) return null;
    if (!Array.isArray(ids)) throw new Error("Stapelimport: Speicherantwort ist nicht lesbar.");
    return { eintraege: ids.length };
  }
  let eintraege = 0;
  for (const film of mediathek) {
    if (await addFilm?.(film)) eintraege += 1;
  }
  return { eintraege };
}

export function externerStapelPrompt() {
  return `# Kinodreieck – Mediathek-Erfassung

**Protokoll:** \`${EXTERNER_STAPEL_WORKFLOW_VERSION}\`

## Ziel
Erfasse meine Filme, Serien und Musikalben aus höchstens drei hochauflösenden Regalfotos sowie aus meinen Textkorrekturen. Erzeuge daraus importierbare JSON-Dateien für das Kinodreieck. Arbeite gründlich, aber antworte knapp und erfinde nichts.

## Aufnahme-Anleitung für deine erste Antwort
Fordere mich auf, bis zu drei Fotos nacheinander zu senden. Richtwert: 40–50 Rücken pro Foto, aber nur wenn die Schrift beim Hineinzoomen lesbar bleibt. Die Fotos sollen frontal, scharf, gut beleuchtet, nicht als Collage und möglichst ohne Spiegelung aufgenommen sein. Benachbarte Fotos sollen 3–5 bereits fotografierte Rücken überlappen. Diese Überlappung dient nur der Vollständigkeitskontrolle und wird später dedupliziert.

## Ablauf
1. Antworte auf diese erste Nachricht ausschließlich mit der kurzen Aufnahme-Anleitung. Beginne erst nach meinem ersten Foto oder einer Titelliste.
2. Vergib je Foto die ID \`Foto 1\`, \`Foto 2\` oder \`Foto 3\`. Prüfe jede sichtbare Regalreihe von links nach rechts und die Reihen von oben nach unten. Nutze die höchste verfügbare Bildgenauigkeit.
3. Bestätige jedes Foto knapp in diesem Format:
   - \`Foto N: X Titel erkannt; Y Stellen unklar.\`
   - \`Abgedeckter Bereich: [erster sicherer Titel] → [letzter sicherer Titel].\`
   - \`Offene Stellen: [Reihe/ungefähre Position + sichtbare Textreste oder Beschreibung].\`
   - Falls du nicht bis zum Bildende gekommen bist: \`Auswertung gestoppt nach [Titel/Position]; ab dort bitte per Text ergänzen.\`
   Zähle nur zur Orientierung und behaupte nie Vollständigkeit, wenn Bildteile nicht geprüft oder lesbar sind. Gib noch kein JSON und keine Gesamtliste aus.
4. Erkenne die Überlappung zum vorigen Foto anhand gemeinsamer Titel. Melde kurz, ob der Anschluss plausibel ist oder zwischen welchen Ankertiteln wahrscheinlich eine Lücke besteht.
5. Nach dem letzten Foto: Fasse ausschließlich die offenen Stellen und mögliche Lücken zusammen. Bitte mich, fehlende oder falsch gelesene Titel zeilenweise als Text zu korrigieren. Übernimm diese Korrekturen mit Vorrang.
6. Sammle alles, bis ich **SAMMLUNG ABSCHLIESSEN** schreibe. Dann Dubletten desselben Werks zusammenführen, Titel bereinigen und das Ergebnis prüfen. Keine Bewertungen, Genres, Originaltitel, Inhaltsangaben oder Filmkennungen ergänzen.
7. Stelle das Ergebnis als herunterladbare \`.json\`-Datei bereit. Falls das nicht möglich ist, gib ausschließlich einen JSON-Codeblock aus. Bei mehr als 50 Kandidaten: mehrere nummerierte Dateien mit je höchstens 50 Kandidaten.

## Erkennungsregeln
- Erfasse nur lesbare DVD-, Blu-ray- und CD-Titel. Ignoriere Poster, Tickets, Kinotermine, Spiele und andere Gegenstände.
- \`titel\`: erkannter Werktitel, ohne Editions- oder Verpackungswerbung.
- \`typ\`: \`film\`, \`serie\` oder \`musik\`.
- \`jahr\`: Erscheinungsjahr des Werks als Ganzzahl; nur eintragen, wenn sichtbar oder eindeutig bekannt, sonst \`null\`. Keine ausführliche Recherche.
- \`quelle\`: \`dvd\`, \`bluray\`, \`cd\` oder \`unklar\`.
- \`staffeln\`: bei Serien sichtbare Staffelnummern als kurzer String, sonst \`null\`.
- \`sicherheit\`: \`hoch\`, \`mittel\` oder \`niedrig\`.
- Unsichere Lesungen nicht erraten: nur einen plausibel lesbaren Kandidaten mit niedriger Sicherheit erfassen. Völlig unlesbare Rücken bleiben aus \`kandidaten\` und werden positionsbezogen in \`warnungen\` zusammengefasst. Maximal 8 Warnungen je Datei.
- \`vorbeurteilung\` ist immer \`offen\`; \`begruendung\` ist immer leer.

## Exaktes Ausgabeformat
\`\`\`json
{"kandidaten":[{"titel":"Alien","typ":"film","jahr":1979,"quelle":"bluray","staffeln":null,"vorbeurteilung":"offen","begruendung":"","sicherheit":"hoch"}],"warnungen":[]}
\`\`\`

Nur gültiges JSON: keine Kommentare, keine zusätzlichen Schlüssel und keine Erklärung nach dem Abschluss.
`;
}
