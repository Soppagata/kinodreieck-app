import { norm } from "./match.js";

export const STAPEL_MAX_ZEILEN = 60;
export const STAPEL_MAX_ZEICHEN = 12_000;
export const EXTERNER_STAPEL_WORKFLOW_VERSION = "mediathek-v1";
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

const kurz = (wert, max) => String(wert ?? "")
  .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

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

export function normalisiereStapelAntwort(antwort, master = []) {
  const roh = antwort?.data?.kandidaten ?? antwort?.kandidaten;
  if (!Array.isArray(roh)) throw new Error("Die KI-Antwort enthält keine lesbaren Einträge.");
  const masterKeys = new Set((master || []).map((e) => `${norm(e.titel)}|${e.jahr ?? ""}`));
  const gesehen = new Set();
  const kandidaten = [];
  for (const [index, kandidat] of roh.slice(0, STAPEL_MAX_ZEILEN).entries()) {
    const titel = kurz(kandidat?.titel, 160);
    if (!titel || !STAPEL_TYPEN.includes(kandidat?.typ)) continue;
    const typ = kandidat.typ;
    const jahrZahl = Number(kandidat?.jahr);
    const jahr = Number.isInteger(jahrZahl) && jahrZahl >= 1888 && jahrZahl <= 2100 ? jahrZahl : null;
    const schluessel = `${norm(titel)}|${jahr ?? ""}|${typ}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const quelle = STAPEL_QUELLEN_KEYS.has(kandidat?.quelle) ? kandidat.quelle : "unklar";
    const staffeln = typ === "serie" ? kurz(kandidat?.staffeln, 80) || null : null;
    const vorbeurteilung = ["passt", "offen", "eher_nicht"].includes(kandidat?.vorbeurteilung)
      ? kandidat.vorbeurteilung : "offen";
    kandidaten.push({
      id: `stapel-${index}-${norm(titel).slice(0, 30) || index}`,
      titel, typ, jahr, quelle, staffeln, vorbeurteilung,
      begruendung: kurz(kandidat?.begruendung, 300),
      sicherheit: ["hoch", "mittel", "niedrig"].includes(kandidat?.sicherheit) ? kandidat.sicherheit : "niedrig",
      ausgewaehlt: true,
      vorhandenMediathek: masterKeys.has(`${norm(titel)}|${jahr ?? ""}`),
    });
  }
  if (!kandidaten.length) throw new Error("Es wurde kein eindeutiger Film-, Serien- oder Musiktitel erkannt.");
  return {
    kandidaten,
    warnungen: Array.isArray(antwort?.data?.warnungen ?? antwort?.warnungen)
      ? (antwort?.data?.warnungen ?? antwort.warnungen).map((w) => kurz(w, 180)).filter(Boolean).slice(0, 8)
      : [],
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
    if (!k.ausgewaehlt || k.vorhandenMediathek || !STAPEL_TYPEN.includes(k.typ)) continue;
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

export function externerStapelPrompt() {
  return `# Kinodreieck – Mediathek-Erfassung

**Protokoll:** \`${EXTERNER_STAPEL_WORKFLOW_VERSION}\`

## Ziel
Erfasse meine Filme, Serien und Musikalben aus Fotos von DVDs, Blu-rays und CDs oder aus eingefügten Titellisten. Erzeuge daraus importierbare JSON-Dateien für das Kinodreieck. Arbeite knapp und erfinde nichts.

## Ablauf
1. Antworte auf diese erste Nachricht nur mit einer kurzen Anleitung: Ich soll gut lesbare Fotos oder Titellisten in mehreren Nachrichten senden. Du sammelst alles, bis ich **SAMMLUNG ABSCHLIESSEN** schreibe.
2. Bestätige jeden Stapel nur mit: \`Stapel N erfasst: X sicher, Y unklar.\` Fordere danach den nächsten Stapel oder das Abschlusswort an. Gib vorher keine Gesamtliste und kein JSON aus.
3. Beim Abschluss: Dubletten desselben Werks zusammenführen, Titel bereinigen und das Ergebnis prüfen. Keine Bewertungen, Genres, Originaltitel, Inhaltsangaben oder Filmkennungen ergänzen.
4. Stelle das Ergebnis als herunterladbare \`.json\`-Datei bereit. Falls das nicht möglich ist, gib ausschließlich einen JSON-Codeblock aus. Bei mehr als 50 Kandidaten: mehrere nummerierte Dateien mit je höchstens 50 Kandidaten.

## Erkennungsregeln
- Erfasse nur lesbare DVD-, Blu-ray- und CD-Titel. Ignoriere Poster, Tickets, Kinotermine, Spiele und andere Gegenstände.
- \`titel\`: erkannter Werktitel, ohne Editions- oder Verpackungswerbung.
- \`typ\`: \`film\`, \`serie\` oder \`musik\`.
- \`jahr\`: Erscheinungsjahr des Werks als Ganzzahl; nur eintragen, wenn sichtbar oder eindeutig bekannt, sonst \`null\`. Keine ausführliche Recherche.
- \`quelle\`: \`dvd\`, \`bluray\`, \`cd\` oder \`unklar\`.
- \`staffeln\`: bei Serien sichtbare Staffelnummern als kurzer String, sonst \`null\`.
- \`sicherheit\`: \`hoch\`, \`mittel\` oder \`niedrig\`.
- Unsichere Lesungen nicht erraten: bestmöglichen Kandidaten mit niedriger Sicherheit erfassen und die Stelle kurz in \`warnungen\` nennen. Maximal 8 Warnungen je Datei.
- \`vorbeurteilung\` ist immer \`offen\`; \`begruendung\` ist immer leer.

## Exaktes Ausgabeformat
\`\`\`json
{"kandidaten":[{"titel":"Alien","typ":"film","jahr":1979,"quelle":"bluray","staffeln":null,"vorbeurteilung":"offen","begruendung":"","sicherheit":"hoch"}],"warnungen":[]}
\`\`\`

Nur gültiges JSON: keine Kommentare, keine zusätzlichen Schlüssel und keine Erklärung nach dem Abschluss.
`;
}
