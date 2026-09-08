export const ROTLINK = "#E06C6C"; // Wikipedia-Prinzip: offene Referenz

/* ---------- Design-Tokens: "Saal & Leinwand" ----------
   Themes über EIN mutables T-Objekt: alle Komponenten lesen T.x zur
   Renderzeit — setzeTheme() tauscht die Werte, die App stößt einen
   Re-Render an, keine Komponente muss davon wissen.
   Kontrastpaare (in beiden Themes gültig):
     saal/saalHoch (Flächen)  ↔  leinwand/rauch (Text darauf)
     leinwand als Karten-BG   ↔  tinte/tinteWeich (Text darauf)
     wolfram (Akzent/Buttons) ↔  wolframText / kontrastFarbe(wolfram)
   Im hellen "Foyer"-Theme bleiben die FilmCards bewusst dunkel —
   Leinwände im hellen Saal. */
export const THEMES = {
  dunkel: {
    saal: "#17151A",
    saalHoch: "#211E26",
    leinwand: "#ECE8DF",
    leinwandTief: "#DFDACD",
    tinte: "#1C1A1E",
    tinteWeich: "#57525C",
    rauch: "#B6AFBE",
    wolfram: "#E3A63B",
    wie: "#6FA8DC",
    was: "#B08BD9",
    warum: "#E3A63B",
    gefahr: "#D96A5A",
    ok: "#6FCE8F", // C4: Erfolg/„OK"-Grün
    kartenFeld: "#FBFAF7", // Eingabefelder AUF den (hellen) FilmCards
    kartenText: "#1C1A1E",
    kartenTextWeich: "#57525C",
    kartenAkzent: "#E3A63B",
    linie: "#8C8593",
    wolframText: "#000000",
  },
  hell: {
    saal: "#EDEAE3",
    saalHoch: "#FBFAF7",
    leinwand: "#23202A",
    leinwandTief: "#3A3644",
    tinte: "#F0EDE6",
    tinteWeich: "#C8C2D1",
    rauch: "#595363",
    wolfram: "#B07E1F",
    wie: "#2F6CA8",
    was: "#7B4FB0",
    warum: "#B07E1F",
    gefahr: "#C14B3C",
    ok: "#2E8B57", // C4
    kartenFeld: "#2E2A36", // Eingabefelder AUF den (im Foyer dunklen) FilmCards
    kartenText: "#F0EDE6",
    kartenTextWeich: "#C8C2D1",
    kartenAkzent: "#E3A63B",
    linie: "#6A6473",
    wolframText: "#000000",
  },
  /* ---- Egg-Modus SHOWA — Kaiju-Eiga 1954, heller S/W-Abzug ----
     Reiner Token-Swap (KEIN filter auf .kd-app — mobil-tauglich). Die freie
     App-Fläche ist helles Filmpapier; Karten bleiben wie Fototafeln dunkel. */
  showa: {
    saal: "#E5E2DA",
    saalHoch: "#F4F1EA",
    leinwand: "#242321",
    leinwandTief: "#393735",
    tinte: "#F2EFE7",
    tinteWeich: "#C3BEB4",
    rauch: "#66635D",
    wolfram: "#3D3A35",
    wie: "#A7B0B2",
    was: "#C7C1B7",
    warum: "#ECE9E2",
    gefahr: "#A64E45",
    ok: "#5E7D63", // C4: gedämpftes S/W-Grün (Showa)
    kartenFeld: "#34322F",
    kartenText: "#F2EFE7",
    kartenTextWeich: "#C3BEB4",
    kartenAkzent: "#ECE9E2",
    linie: "#66635D",
    wolframText: "#FFFFFF",
  },
  /* ---- Egg-Modus NEON NOIR — Cyan und Pink auf dunklem Petrol ----
     Leinwand bleibt zugleich heller Saaltext und kühle Kartenfläche.
     Die Karten behalten ihre dunkle Tinte; Cyan führt durch die Controls. */
  "neon-noir": {
    saal: "#040F1A",
    saalHoch: "#0A2330",
    leinwand: "#DDF7F6",
    leinwandTief: "#C2E5E7",
    tinte: "#06212C",
    tinteWeich: "#385C67",
    rauch: "#A0BCC5",
    wolfram: "#43EAF2",
    wie: "#19BCD8",
    was: "#F253AC",
    warum: "#F2B95D",
    gefahr: "#FF7587",
    ok: "#62D9AA",
    kartenFeld: "#F0FFFF",
    kartenText: "#06212C",
    kartenTextWeich: "#385C67",
    kartenAkzent: "#43EAF2",
    linie: "#508B9A",
    wolframText: "#000000",
  },
};

export const T = { ...THEMES.dunkel };

/* Schwarz oder Weiß nach dem tatsächlich höheren WCAG-Kontrast. Für jede
   gültige sRGB-Hintergrundfarbe erreicht mindestens eine der beiden Varianten
   4,5:1; aktive Chips dürfen deshalb nicht blind den Theme-Token `tinte`
   verwenden (im hellen Theme war Gold auf heller Tinte kaum lesbar). */
export function kontrastFarbe(hintergrund) {
  const roh = String(hintergrund || "").trim();
  const kurz = /^#([0-9a-f]{3})$/i.exec(roh);
  const lang = /^#([0-9a-f]{6})$/i.exec(roh);
  const hex = lang?.[1] || (kurz ? [...kurz[1]].map((x) => x + x).join("") : null);
  if (!hex) return "#000000";
  const kanaele = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const luminanz = 0.2126 * kanaele[0] + 0.7152 * kanaele[1] + 0.0722 * kanaele[2];
  const zuSchwarz = (luminanz + 0.05) / 0.05;
  const zuWeiss = 1.05 / (luminanz + 0.05);
  return zuSchwarz >= zuWeiss ? "#000000" : "#FFFFFF";
}

export function setzeTheme(name) {
  Object.assign(T, THEMES[name] || THEMES.dunkel);
  if (typeof document !== "undefined") {
    if (document.body) {
      document.body.style.background = T.saal;
      document.body.style.colorScheme = name === "hell" || name === "showa" ? "light" : "dark"; // native Controls (Scrollbar, Select)
    }
    // Die vollständige Palette spiegeln: Bereichs-Heros, Dashboard-Tickets und
    // reine CSS-Komponenten müssen im Foyer dieselben Kontrastpaare sehen wie
    // inline gestylte React-Komponenten. Nur Wolfram/Tinte zu setzen ließ z. B.
    // Hero-Überschriften am hellen Hintergrund weiß stehen.
    const root = document.documentElement;
    if (root && root.style) {
      root.dataset.kdTheme = THEMES[name] ? name : "dunkel";
      for (const name of ["saal", "saalHoch", "leinwand", "leinwandTief", "tinte", "tinteWeich", "rauch", "wolfram", "gefahr", "ok", "wie", "was", "warum", "kartenFeld", "kartenText", "kartenTextWeich", "kartenAkzent", "linie", "wolframText"]) {
        root.style.setProperty("--" + name, T[name]);
        root.style.setProperty("--kd-" + name, T[name]);
      }
    }
  }
}

/* ---------- Basis-Styles ----------
   btnStyle ist eine Funktion (liest T beim Aufruf). inputStyle/lightInput
   nutzen GETTER, damit auch {...inputStyle}-Spreads zur Renderzeit die
   aktuellen Theme-Werte ziehen. */
export const btnStyle = (primary) => ({
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 600,
  fontSize: "calc(14px * var(--kd-schriftfaktor, 1))",
  lineHeight: 1.35,
  padding: "10px 16px",
  minHeight: 44,
  borderRadius: 8,
  border: primary ? "1px solid " + T.wolfram : "1px solid " + T.rauch,
  background: primary ? T.wolfram : "transparent",
  color: primary ? kontrastFarbe(T.wolfram) : T.leinwand,
  cursor: "pointer",
});

export const inputStyle = {
  get background() { return T.saal; },
  get border() { return "1px solid " + T.rauch; },
  borderRadius: 8,
  get color() { return T.leinwand; },
  minHeight: 44,
  padding: "9px 12px",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: "max(16px, calc(16px * var(--kd-schriftfaktor, 1)))",
  lineHeight: 1.4,
};

export const lightInput = {
  get background() { return T.kartenFeld; },
  get border() { return "1px solid " + T.tinteWeich; },
  borderRadius: 8,
  get color() { return T.tinte; },
  minHeight: 44,
  padding: "8px 10px",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: "max(16px, calc(16px * var(--kd-schriftfaktor, 1)))",
  lineHeight: 1.4,
};
