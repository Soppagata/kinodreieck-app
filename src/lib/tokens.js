/* ---------- Design-Tokens: "Saal & Leinwand" ----------
   Themes über EIN mutables T-Objekt: alle Komponenten lesen T.x zur
   Renderzeit — setzeTheme() tauscht die Werte, die App stößt einen
   Re-Render an, keine Komponente muss davon wissen.
   Kontrastpaare (in beiden Themes gültig):
     saal/saalHoch (Flächen)  ↔  leinwand/rauch (Text darauf)
     leinwand als Karten-BG   ↔  tinte/tinteWeich (Text darauf)
     wolfram (Akzent/Buttons) ↔  tinte (Text darauf)
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
    rauch: "#948FA0",
    wolfram: "#E3A63B",
    wie: "#6FA8DC",
    was: "#B08BD9",
    warum: "#E3A63B",
    gefahr: "#D96A5A",
    kartenFeld: "#FFFFFF", // Eingabefelder AUF den (hellen) FilmCards
  },
  hell: {
    saal: "#EDEAE3",
    saalHoch: "#FBFAF7",
    leinwand: "#23202A",
    leinwandTief: "#3A3644",
    tinte: "#F0EDE6",
    tinteWeich: "#B9B4C2",
    rauch: "#6E6879",
    wolfram: "#B07E1F",
    wie: "#2F6CA8",
    was: "#7B4FB0",
    warum: "#B07E1F",
    gefahr: "#C14B3C",
    kartenFeld: "#2E2A36", // Eingabefelder AUF den (im Foyer dunklen) FilmCards
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
    kartenFeld: "#34322F",
  },
  /* ---- Egg-Modus NERV — Evangelion-Terminal, Schwarz/Rot ----
     Nahezu schwarzer Grund, warmes Bein für Fließtext (wie die weißen MAGI-Label),
     Signal-Rot als Akzent/Buttons. Bewertungstrio = Konsolen-Tricolor Cyan/Rot/Amber. */
  nerv: {
    saal: "#050506",
    saalHoch: "#150507",
    leinwand: "#E9E4DC",
    leinwandTief: "#CDC7BE",
    tinte: "#140C0E",
    tinteWeich: "#4A4046",
    rauch: "#AA969C",
    wolfram: "#F0181D",
    wie: "#55C8D3",
    was: "#F0181D",
    warum: "#FFAE18",
    gefahr: "#F0181D",
    kartenFeld: "#F4EFE8",
  },
};

export const T = { ...THEMES.dunkel };

export function setzeTheme(name) {
  Object.assign(T, THEMES[name] || THEMES.dunkel);
  if (typeof document !== "undefined" && document.body) {
    document.body.style.background = T.saal;
    document.body.style.colorScheme = name === "hell" || name === "showa" ? "light" : "dark"; // native Controls (Scrollbar, Select)
  }
}

/* ---------- Basis-Styles ----------
   btnStyle ist eine Funktion (liest T beim Aufruf). inputStyle/lightInput
   nutzen GETTER, damit auch {...inputStyle}-Spreads zur Renderzeit die
   aktuellen Theme-Werte ziehen. */
export const btnStyle = (primary) => ({
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "10px 18px",
  borderRadius: 4,
  border: primary ? "none" : "1px solid " + T.rauch,
  background: primary ? T.wolfram : "transparent",
  color: primary ? T.tinte : T.leinwand,
  cursor: "pointer",
});

export const inputStyle = {
  get background() { return T.saal; },
  get border() { return "1px solid " + T.rauch; },
  borderRadius: 4,
  get color() { return T.leinwand; },
  padding: "9px 12px",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 14,
};

export const lightInput = {
  get background() { return T.kartenFeld; },
  get border() { return "1px solid " + T.tinteWeich; },
  borderRadius: 4,
  get color() { return T.tinte; },
  padding: "6px 10px",
  fontFamily: "'Space Mono', monospace",
  fontSize: 13,
};
