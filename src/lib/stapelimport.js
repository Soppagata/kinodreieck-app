import { norm } from "./match.js";

export const STAPEL_MAX_BILDER = 4;
export const STAPEL_MAX_REQUEST_BYTES = 900_000;
export const STAPEL_BILDTYPEN = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const STAPEL_TYPEN = ["film", "serie"];
export const STAPEL_QUELLEN = [
  { key: "unklar", label: "Quelle später ergänzen" },
  { key: "dvd", label: "DVD" }, { key: "bluray", label: "Blu-ray" },
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

export function schaetzeBildTokens(bilder) {
  return (bilder || []).reduce((summe, bild) => {
    const breite = Number(bild?.width) || 0;
    const hoehe = Number(bild?.height) || 0;
    return summe + Math.ceil((breite * hoehe) / 750);
  }, 0);
}

export function normalisiereStapelAntwort(antwort, master = []) {
  const roh = antwort?.data?.kandidaten ?? antwort?.kandidaten;
  if (!Array.isArray(roh)) throw new Error("Die KI-Antwort enthält keine lesbaren Einträge.");
  const masterKeys = new Set((master || []).map((e) => `${norm(e.titel)}|${e.jahr ?? ""}`));
  const gesehen = new Set();
  const kandidaten = [];
  for (const [index, kandidat] of roh.slice(0, 30).entries()) {
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
  if (!kandidaten.length) throw new Error("Auf den Bildern wurde kein eindeutiger Film- oder Serientitel erkannt.");
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

export function externerStapelPrompt(autor = "") {
  return [
    "Du hilfst mir beim Stapelimport in Kinodreieck, um meine eigene Film- und Seriensammlung zu erfassen. Analysiere alle angehängten Fotos oder Screenshots gemeinsam.",
    "Berücksichtige ausschließlich Filme und Serien, die auf den Bildern als physisch vorhanden oder digital gekauft erkennbar sind. Streaming-Abos, Wunschlisten, Poster, Kinotickets, Termine, Musik und andere Medien gehören nicht in diesen Import.",
    "Erfinde nichts und fasse Dubletten zusammen. Wenn bei einer Serie zwar der Titel, aber keine Staffel sicher erkennbar ist, setze staffeln auf null; ich kann sie später freiwillig ergänzen.",
    "",
    "Bevor du das Ergebnis ausgibst, frage mich in EINER Nachricht nach 5 bis 10 sehr kurzen eigenen Bewertungen zu erkannten Titeln: jeweils WIE, WAS und WARUM von 0 bis 5 plus höchstens einen Begründungssatz. Empfehle passende erkannte Titel für diese Stichprobe.",
    "Nutze meine Antworten nur, um für die übrigen Titel einen vorsichtigen Voreindruck passt, offen oder eher_nicht abzuleiten. Meine echten Bewertungen dürfen ausschließlich bei den ausdrücklich bewerteten Titeln liegen; der Import selbst legt alle Einträge unbewertet an.",
    "",
    "Nachdem ich geantwortet habe, liefere ausschließlich rohes JSON, keinen Markdown-Codeblock, in dieser Form:",
    "{",
    '  "kandidaten": [{',
    '    "titel": "…",',
    '    "typ": "film|serie",',
    '    "jahr": 2026 oder null,',
    '    "quelle": "dvd|bluray|vhs|filmrolle|festplatte|phys_sonst|apple|google|amazon|sony|microsoft|youtube|virt_sonst|unklar",',
    '    "staffeln": "1, 2–4" oder null,',
    '    "vorbeurteilung": "passt|offen|eher_nicht",',
    '    "begruendung": "kurze, nachvollziehbare Begründung oder leer",',
    '    "sicherheit": "hoch|mittel|niedrig"',
    "  }],",
    '  "warnungen": ["…"]',
    "}",
    `Autorname für den späteren Import: ${kurz(autor, 80) || "unbekannt"}. Nutze gutes Reasoning für Zuordnung und Dubletten, aber gib keine internen Gedankengänge aus.`,
  ].join("\n");
}
