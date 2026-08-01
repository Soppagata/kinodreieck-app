import { norm } from "./match.js";

export const STAPEL_MAX_BILDER = 4;
export const STAPEL_MAX_REQUEST_BYTES = 900_000;
export const STAPEL_BILDTYPEN = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const STAPEL_TYPEN = ["film", "serie", "musik", "sonstiges"];
export const STAPEL_ZIELE = ["mediathek", "mustwatch"];

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

export function normalisiereStapelAntwort(antwort, master = [], mustwatch = []) {
  const roh = antwort?.data?.kandidaten ?? antwort?.kandidaten;
  if (!Array.isArray(roh)) throw new Error("Die KI-Antwort enthält keine lesbaren Einträge.");
  const masterKeys = new Set((master || []).map((e) => `${norm(e.titel)}|${e.jahr ?? ""}`));
  const mwKeys = new Set((mustwatch || []).map((e) => norm(e.titel)));
  const gesehen = new Set();
  const kandidaten = [];
  for (const [index, kandidat] of roh.slice(0, 30).entries()) {
    const titel = kurz(kandidat?.titel, 160);
    if (!titel) continue;
    const typ = STAPEL_TYPEN.includes(kandidat?.typ) ? kandidat.typ : "sonstiges";
    const jahrZahl = Number(kandidat?.jahr);
    const jahr = Number.isInteger(jahrZahl) && jahrZahl >= 1888 && jahrZahl <= 2100 ? jahrZahl : null;
    const schluessel = `${norm(titel)}|${jahr ?? ""}|${typ}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const ereignisart = ["poster", "ticket", "termin", "cover", "liste", "sonstiges"].includes(kandidat?.ereignisart)
      ? kandidat.ereignisart : "sonstiges";
    const ziel = ["ticket", "termin", "poster"].includes(ereignisart) ? "mustwatch" : "mediathek";
    kandidaten.push({
      id: `stapel-${index}-${norm(titel).slice(0, 30) || index}`,
      titel, typ, jahr, ereignisart,
      datum: /^\d{4}-\d{2}-\d{2}$/.test(String(kandidat?.datum || "")) ? kandidat.datum : null,
      uhrzeit: /^\d{2}:\d{2}$/.test(String(kandidat?.uhrzeit || "")) ? kandidat.uhrzeit : null,
      ort: kurz(kandidat?.ort, 160) || null,
      hinweis: kurz(kandidat?.hinweis, 300),
      sicherheit: ["hoch", "mittel", "niedrig"].includes(kandidat?.sicherheit) ? kandidat.sicherheit : "niedrig",
      ziel,
      ausgewaehlt: true,
      vorhandenMediathek: masterKeys.has(`${norm(titel)}|${jahr ?? ""}`),
      vorhandenMustwatch: mwKeys.has(norm(titel)),
    });
  }
  if (!kandidaten.length) throw new Error("Auf den Bildern wurde kein eindeutiger Titel erkannt.");
  return {
    kandidaten,
    warnungen: Array.isArray(antwort?.data?.warnungen ?? antwort?.warnungen)
      ? (antwort?.data?.warnungen ?? antwort.warnungen).map((w) => kurz(w, 180)).filter(Boolean).slice(0, 8)
      : [],
  };
}

function notizFuer(k) {
  const teile = [];
  if (k.datum) teile.push(k.datum + (k.uhrzeit ? ` ${k.uhrzeit}` : ""));
  if (k.ort) teile.push(k.ort);
  if (k.hinweis) teile.push(k.hinweis);
  return teile.join(" · ");
}

export function baueStapelUebernahme(kandidaten) {
  const mediathek = [];
  const mustwatch = [];
  for (const k of kandidaten || []) {
    if (!k.ausgewaehlt) continue;
    const notiz = notizFuer(k);
    if (k.ziel === "mustwatch") {
      if (!k.vorhandenMustwatch) mustwatch.push({
        titel: k.titel, im_besitz: false,
        beschreibung: notiz, notiz: "Per Foto-/Screenshot-Stapelimport erkannt.", verknuepfung: null,
      });
    } else if (!k.vorhandenMediathek) {
      mediathek.push({
        titel: k.titel, originaltitel: k.titel, jahr: k.jahr, jahr_bis: null,
        typ: STAPEL_TYPEN.includes(k.typ) ? k.typ : "sonstiges",
        quelle: "unklar", quelle_unklar: true, kategorie: null, bewertung: null,
        genre: [], tags: [], begruendung: "", beschreibung: "", notiz,
        status: "gesetzt", bewertet_von: null,
      });
    }
  }
  return { mediathek, mustwatch };
}

export function externerStapelPrompt(autor = "") {
  return `Du hilfst beim Stapelimport in Kinodreieck. Lies alle angehängten Fotos oder Screenshots gemeinsam. Erkenne Filme, Serien, Musik (Album, Song oder Konzert) und sonstige kulturelle Werke sowie sichtbare Termine. Erfinde nichts. Ein Poster beweist weder Besitz noch gesehen; ein Ticket beweist keine Bewertung. Ignoriere Namen, Preise, Sitzplätze, QR-/Barcodes und Bestellnummern. Fasse Dubletten zusammen. Liefere ausschließlich rohes JSON, keinen Markdown-Codeblock, in dieser Form:\n{\n  "kandidaten": [{\n    "titel": "…",\n    "typ": "film|serie|musik|sonstiges",\n    "jahr": 2026 oder null,\n    "ereignisart": "poster|ticket|termin|cover|liste|sonstiges",\n    "datum": "YYYY-MM-DD" oder null,\n    "uhrzeit": "HH:MM" oder null,\n    "ort": "…" oder null,\n    "hinweis": "kurze sachliche Zusatzinfo",\n    "sicherheit": "hoch|mittel|niedrig"\n  }],\n  "warnungen": ["…"]\n}\nAutorname für den späteren Import: ${kurz(autor, 80) || "unbekannt"}.`;
}
