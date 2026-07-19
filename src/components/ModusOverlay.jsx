import React from "react";

/* ---- Egg-Modus-Overlays (rein dekorativ) ----
   Liegen als fixe .kd-fx-Ebene über dem Viewport, pointer-events:none, hinter dem
   Inhalt-Fluss. KEIN filter auf .kd-app (mobil-Falle) — die Farbwelt kommt aus dem
   Token-Swap (tokens.js: THEMES.showa/.nerv), hier nur Textur & Motive.
   Alle Motive sind eigene, lizenzfreie SVGs — keine Original-Assets. */

/* Godzilla-artige Kaiju-Silhouette (eigene Geometrie), aufrecht, nach links gewandt,
   mit Ahornblatt-Rückenplatten. Sitzt klein & dunkel in der unteren rechten Ecke —
   „loomt" am Bildrand wie in den 54er-Nachtaufnahmen. */
function Kaiju() {
  return (
    <svg className="kd-kaiju" viewBox="0 0 220 280" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
      <g fill="currentColor">
        {/* Schwanz */}
        <path d="M126 214 Q182 206 208 158 Q214 146 203 143 Q190 176 138 188 Z" />
        {/* Rumpf */}
        <ellipse cx="112" cy="150" rx="46" ry="74" />
        {/* Beine (zwei Stümpfe, ausgekerbt) */}
        <path d="M80 208 h66 v40 q0 13 -15 13 h-9 v-31 h-15 v31 h-8 q-15 0 -15 -13 Z" />
        {/* Arm */}
        <path d="M80 124 q-19 5 -25 24 q-2 9 7 9 q4 -21 24 -21 Z" />
        {/* Hals + Kopf */}
        <path d="M100 96 Q94 68 104 48 Q110 34 126 35 Q142 36 143 55 Q144 76 132 96 Z" />
        {/* Schnauze / offener Kiefer */}
        <path d="M126 42 L162 37 L162 49 L150 51 L160 56 L132 60 Z" />
        {/* Rückenplatten (Ahornblatt-artig), Kopf -> Schwanzansatz */}
        <path d="M138 92 l14 -12 3 16 z" />
        <path d="M142 108 l17 -14 4 19 z" />
        <path d="M146 126 l18 -14 4 20 z" />
        <path d="M147 146 l17 -12 3 18 z" />
        <path d="M144 166 l15 -10 2 16 z" />
        <path d="M138 184 l12 -8 2 13 z" />
      </g>
    </svg>
  );
}

/* 1950er-Tokio-Miniatur-Skyline: niedrige Blöcke + ein runder Uhrturm (Wako-artig).
   Dunkle Silhouette am unteren Rand. */
function Skyline() {
  return (
    <svg className="kd-skyline" viewBox="0 0 390 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g fill="currentColor">
        <rect x="0" y="86" width="46" height="44" />
        <rect x="50" y="70" width="30" height="60" />
        <rect x="84" y="94" width="40" height="36" />
        {/* runder Uhrturm mit Zifferblatt */}
        <path d="M128 130 V64 a22 22 0 0 1 44 0 V130 Z" />
        <rect x="144" y="30" width="12" height="34" />
        <circle cx="150" cy="58" r="7" fill="#0E0E11" />
        <circle cx="150" cy="58" r="1.6" fill="currentColor" />
        <rect x="176" y="88" width="52" height="42" />
        <rect x="232" y="74" width="26" height="56" />
        <rect x="262" y="98" width="44" height="32" />
        <rect x="310" y="82" width="30" height="48" />
        <rect x="344" y="92" width="46" height="38" />
      </g>
    </svg>
  );
}

/* NERV-Homage-Logo: ersetzt im NERV-Modus die Kinodreieck-Marke im Header
   (Max' Wunsch). Eigenes, stilisiertes Halbblatt mit Diagonalschnitt + Ader —
   bewusst eigene Geometrie, kein Original-Logo. */
export function NervLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <clipPath id="kd-nlogo-cut"><path d="M74 -10 L82 -2 L14 66 L6 58 Z" /></clipPath>
      </defs>
      <g clipPath="url(#kd-nlogo-cut)">
        <path d="M32 60 C25 40 29 17 58 7 C56 31 51 51 32 60 Z" fill="#E5352A" />
        <path d="M39 53 L53 15" stroke="#0A0A0C" strokeWidth="2.4" fill="none" opacity="0.45" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function ShowaFx() {
  return (
    <div className="kd-fx kd-fx-showa" aria-hidden="true">
      <div className="grade" />
      <div className="korn" />
      <div className="kd-beam" />
      <Skyline />
      <Kaiju />
    </div>
  );
}

function NervFx() {
  return (
    <div className="kd-fx kd-fx-nerv" aria-hidden="true">
      <div className="kd-scan" />
      <div className="kd-hazard t" />
      <div className="kd-hazard b" />
      <div className="kd-hexcorner tl" />
      <div className="kd-hexcorner br" />
    </div>
  );
}

export function ModusFx({ modus }) {
  if (modus === "showa") return <ShowaFx />;
  if (modus === "nerv") return <NervFx />;
  return null;
}
