import React, { useEffect, useRef, useState } from "react";
import "../styles/deep-space-horror.css";

function DesktopCorridor() {
  return (
    <svg
      className="kd-deep-space__scene kd-deep-space__scene--desktop"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id="kd-dsh-d3-bg" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#111512" /><stop offset="0.55" stopColor="#090D0A" /><stop offset="1" stopColor="#020302" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-ceiling" x1="0" y1="0" x2="0.55" y2="1">
          <stop stopColor="#252A25" /><stop offset="0.5" stopColor="#171C18" /><stop offset="1" stopColor="#090C0A" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-left" x1="0" y1="0" x2="1" y2="0.65">
          <stop stopColor="#0A0D0B" /><stop offset="0.22" stopColor="#202620" /><stop offset="0.68" stopColor="#141915" /><stop offset="1" stopColor="#080B09" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-right" x1="1" y1="0" x2="0" y2="0.7">
          <stop stopColor="#070A08" /><stop offset="0.24" stopColor="#1C221D" /><stop offset="0.72" stopColor="#111612" /><stop offset="1" stopColor="#070A08" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-floor" x1="0.48" y1="0" x2="0.52" y2="1">
          <stop stopColor="#181E19" /><stop offset="0.47" stopColor="#0D120E" /><stop offset="1" stopColor="#020302" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-metal" x1="0" y1="0" x2="1" y2="0.55">
          <stop stopColor="#667068" /><stop offset="0.18" stopColor="#3A423B" /><stop offset="0.72" stopColor="#222922" /><stop offset="1" stopColor="#101510" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-pipe" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#59615A" /><stop offset="0.18" stopColor="#333B35" /><stop offset="0.64" stopColor="#171D18" /><stop offset="1" stopColor="#070A08" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-light" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#E0DFD2" /><stop offset="0.48" stopColor="#B9BBAF" /><stop offset="1" stopColor="#707A71" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-cold" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#9FC8C4" stopOpacity="0" /><stop offset="0.72" stopColor="#A9D6D3" stopOpacity="0.22" /><stop offset="1" stopColor="#D6EEEA" stopOpacity="0.52" />
        </linearGradient>
        <linearGradient id="kd-dsh-d3-warm" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#765139" stopOpacity="0.3" /><stop offset="1" stopColor="#765139" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="kd-dsh-d3-beam-a">
          <stop stopColor="#E5E3D5" stopOpacity="0.23" /><stop offset="1" stopColor="#E5E3D5" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-dsh-d3-beam-b">
          <stop stopColor="#D8DACE" stopOpacity="0.145" /><stop offset="1" stopColor="#D8DACE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-dsh-d3-warm-glow">
          <stop stopColor="#B57A4C" stopOpacity="0.18" /><stop offset="1" stopColor="#B57A4C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-dsh-d3-cold-fog">
          <stop stopColor="#B5D8D3" stopOpacity="0.045" /><stop offset="1" stopColor="#B5D8D3" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-dsh-d3-vignette" cx="55%" cy="45%" r="73%">
          <stop offset="0.2" stopColor="#000" stopOpacity="0.04" /><stop offset="0.62" stopColor="#000" stopOpacity="0.18" /><stop offset="1" stopColor="#000" stopOpacity="0.62" />
        </radialGradient>
        <pattern id="kd-dsh-d3-grime" width="157" height="131" patternUnits="userSpaceOnUse">
          <path d="M18 34h38M104 91h31M75 18h12M33 109h18" stroke="#BEC4BC" strokeWidth="2" opacity="0.035" />
          <path d="M0 118h72M113 58h44" stroke="#000" strokeWidth="9" opacity="0.055" />
          <circle cx="91" cy="41" r="3" fill="#000" opacity="0.1" /><circle cx="26" cy="87" r="2" fill="#AFB7AF" opacity="0.05" />
        </pattern>
        <filter id="kd-dsh-d3-soft" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="kd-dsh-d3-shadow" x="-30%" y="-30%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>

      <rect width="1600" height="1000" fill="url(#kd-dsh-d3-bg)" />

      {/* 32–35-mm-Raum: off-axis, senkrechte Pfosten, keine Tunnelkeile. */}
      <path d="M0 0h1600L1082 334H760z" fill="url(#kd-dsh-d3-ceiling)" />
      <path d="M0 0h388l372 334v196L184 1000H0z" fill="url(#kd-dsh-d3-left)" />
      <path d="M1600 0h-302l-216 334v196l408 470h110z" fill="url(#kd-dsh-d3-right)" />
      <path d="M184 1000h1306l-408-470H760z" fill="url(#kd-dsh-d3-floor)" />
      <path d="M0 0h388l372 334v196L184 1000H0zM1600 0h-302l-216 334v196l408 470h110zM0 0h1600L1082 334H760z" fill="url(#kd-dsh-d3-grime)" opacity="0.7" />

      {/* Ferne Rückwand und rechts abknickender Quergang statt Endtür. */}
      <g>
        <path d="M719 312h381l74 53v183l-98 67H748l-72-67V365z" fill="#111512" />
        <path d="M746 340h319l54 39v142l-65 45H770l-50-45V379z" fill="#090C0A" />
        <path d="M694 418h178v103H681l-52-49z" fill="#020403" />
        <path d="M842 374h92v177h-92z" fill="#0D110E" />
        <path d="M930 382h320l86 53v111H930z" fill="#020403" />
        <path d="M1305 392h13v146h-13z" fill="url(#kd-dsh-d3-cold)" opacity="0.34" />
        <path d="M1311 405h4v121h-4z" fill="#B8D8D3" opacity="0.15" />
        <path d="M784 362h38v177h-38zM918 360h31v183h-31z" fill="#070A08" />
        <path d="M821 414h27v105h-27z" fill="#242A25" opacity="0.3" />
      </g>
      <ellipse cx="1288" cy="468" rx="75" ry="105" fill="url(#kd-dsh-d3-cold-fog)" filter="url(#kd-dsh-d3-soft)" />
      <path d="M1286 529h25l54 98h-48z" fill="url(#kd-dsh-d3-cold)" opacity="0.055" filter="url(#kd-dsh-d3-soft)" />
      <ellipse cx="955" cy="457" rx="390" ry="225" fill="#000" opacity="0.37" filter="url(#kd-dsh-d3-soft)" />

      {/* Linke Wand: reale Buchten und ein einzelner Rohr-/Kabelkanal. */}
      <g opacity="0.62">
        <path d="M0 105l132 55v585L0 817z" fill="#2E352E" />
        <path d="M143 165l128 73v420l-128 82z" fill="#394139" />
        <path d="M283 245l119 80v249l-119 78z" fill="#2A322A" />
        <path d="M415 332l103 60v121l-103 56z" fill="#3A4239" />
        <path d="M126 154h20v591h-20zM267 233h20v426h-20zM399 320h18v255h-18zM516 388h16v131h-16z" fill="#111611" />
        <path d="M0 150l132 49v38L0 197zM143 219l128 65v34l-128-57zM283 292l119 72v27l-119-64z" fill="#4D554D" opacity="0.32" />
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M-30 280L310 351L646 432M-32 338L302 392L638 450M-28 398L294 432L631 471" stroke="#050705" strokeWidth="38" opacity="0.72" filter="url(#kd-dsh-d3-shadow)" />
        <path d="M-30 269L310 340L646 421M-32 327L302 381L638 439M-28 387L294 421L631 460" stroke="url(#kd-dsh-d3-pipe)" strokeWidth="24" opacity="0.68" />
        <path d="M-30 263L310 334L646 415M-32 321L302 375L638 433M-28 381L294 415L631 454" stroke="#A6AEA7" strokeWidth="3" opacity="0.1" />
      </g>
      <g fill="#111611" stroke="#5A625B" strokeWidth="3">
        <path d="M133 295h25v92h-25zM291 345h22v76h-22zM441 383h18v62h-18zM566 415h15v44h-15z" />
      </g>
      <path d="M0 478l97 13v64L0 550z" fill="url(#kd-dsh-d3-warm)" opacity="0.72" />
      <path d="M31 489h40v20H31z" fill="#B37A4E" opacity="0.2" />
      <ellipse cx="52" cy="515" rx="72" ry="104" fill="url(#kd-dsh-d3-warm-glow)" filter="url(#kd-dsh-d3-soft)" />

      {/* Rechte Wand: asymmetrische Schränke und große Serviceklappen. */}
      <g opacity="0.6">
        <path d="M1600 101l-116 48v675l116 45z" fill="#202720" />
        <path d="M1472 154l-124 69v524l124 72z" fill="#374037" />
        <path d="M1335 231l-111 75v359l111 73z" fill="#2A322A" />
        <path d="M1212 314l-94 70v205l94 69z" fill="#384138" />
        <path d="M1480 148h18v678h-18zM1337 220h18v530h-18zM1214 302h17v367h-17zM1106 374h15v226h-15z" fill="#0A0E0B" />
        <path d="M1505 211h74v236h-74zM1373 283h75v195h-75zM1252 349h66v143h-66zM1142 407h53v94h-53z" fill="#151B16" />
        <path d="M1517 227h49v93h-49zM1385 299h51v72h-51zM1263 364h44v53h-44zM1152 419h33v34h-33z" fill="#4D574D" opacity="0.42" />
        <path d="M1521 343h42v8h-42zM1389 393h43v7h-43zM1266 441h37v6h-37zM1154 466h28v5h-28z" fill="#89938A" opacity="0.28" />
        <circle cx="1564" cy="420" r="7" fill="#747D75" opacity="0.34" /><circle cx="1432" cy="452" r="6" fill="#747D75" opacity="0.3" />
      </g>

      {/* Offene Service-Luke: schwarze Tiefe in der rechten Wand und ein zur
          Seite geschobener, perforierter Wartungsdeckel. */}
      <g>
        <path d="M1470 267l88-43v234l-88 58z" fill="#010201" stroke="#4D574F" strokeWidth="3" strokeOpacity="0.22" />
        <path d="M1485 285l54-26v174l-54 37z" fill="#040605" />
        <path d="M1458 264l13 7v248l-13-8z" fill="#0A0E0B" />
        <path d="M1558 260l42-21v225l-42 29z" fill="#251910" stroke="#687068" strokeWidth="2" strokeOpacity="0.25" />
        <g fill="#070806" opacity="0.75">
          <circle cx="1574" cy="280" r="4" /><circle cx="1590" cy="271" r="4" />
          <circle cx="1574" cy="323" r="4" /><circle cx="1590" cy="314" r="4" />
          <circle cx="1574" cy="366" r="4" /><circle cx="1590" cy="357" r="4" />
          <circle cx="1574" cy="409" r="4" /><circle cx="1590" cy="400" r="4" />
        </g>
      </g>

      {/* Drei motivierte Büro-Leuchten und ihr lokaler Falloff. */}
      <g className="kd-deep-space__lights">
        <g filter="url(#kd-dsh-d3-soft)">
          <ellipse cx="760" cy="272" rx="405" ry="188" fill="url(#kd-dsh-d3-beam-a)" opacity="0.55" />
          <ellipse cx="850" cy="365" rx="205" ry="116" fill="url(#kd-dsh-d3-beam-b)" opacity="0.38" />
          <path d="M380 65h810l-82 74H442z" fill="#E6E4D6" opacity="0.1" />
          <path d="M585 188h513l-55 56H628z" fill="#DBDDD1" opacity="0.08" />
          <path d="M0 96l337 76l216 197l-323-89zM1600 83l-302 84l-180 194l271-95z" fill="url(#kd-dsh-d3-beam-a)" opacity="0.38" />
          <path d="M388 211l244 91l113 124l-200-72zM1295 201l-211 94l-94 126l172-75z" fill="url(#kd-dsh-d3-beam-b)" opacity="0.28" />
          <path d="M290 580l370-33l-54 280H235z" fill="url(#kd-dsh-d3-beam-a)" opacity="0.36" />
          <path d="M751 536l240-16l155 238H880z" fill="url(#kd-dsh-d3-beam-b)" opacity="0.29" />
          <path d="M814 486l146-8l52 102H842z" fill="url(#kd-dsh-d3-beam-b)" opacity="0.18" />
        </g>
        <g fill="#111612">
          <path d="M350 36h886l-44 80H392zM558 163h576l-37 64H593zM739 279h330l-29 45H765z" />
        </g>
        <g fill="url(#kd-dsh-d3-light)">
          <path d="M382 54h818l-24 43H405z" opacity="0.66" />
          <g opacity="0.46">
            <g className="kd-deep-space__flicker-light">
              <path d="M585 180h521l-22 36H607z" />
            </g>
          </g>
          <path d="M762 291h281l-14 22H777z" opacity="0.23" />
        </g>
        <g fill="#4B514B" opacity="0.2">
          <path d="M614 54h113l-13 43H601zM1031 54h84l-12 43h-85z" />
          <path d="M755 180h74l-9 36h-75zM985 180h51l-8 36h-52z" />
        </g>
      </g>

      {/* Glatter Plattenboden mit weichen, gebrochenen Reflexionen. */}
      <g fill="none" stroke="#626A62" strokeLinecap="round">
        <path d="M417 1000L812 530M844 1000L888 530M1269 1000L965 530" strokeWidth="5" opacity="0.18" />
        <path d="M315 838L1322 821M416 718L1219 708M527 626L1145 620M617 570L1094 567" strokeWidth="4" opacity="0.12" />
      </g>
      <g fill="#050705" opacity="0.5">
        <path d="M184 1000h124l452-470h-38zM1490 1000h-112l-332-470h36z" />
      </g>
      <g fill="#77533D" opacity="0.075"><path d="M82 642l196 9l-12 15l-200-4zM1397 597l151-7l4 14l-155 14z" /></g>
      <rect width="1600" height="1000" fill="url(#kd-dsh-d3-vignette)" />
      <rect width="1600" height="1000" fill="url(#kd-dsh-d3-grime)" opacity="0.22" />
    </svg>
  );
}

function MobileCorridor() {
  return (
    <svg
      className="kd-deep-space__scene kd-deep-space__scene--mobile"
      viewBox="0 0 393 852"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id="kd-dsh-m4-bg" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#0B0F0C" /><stop offset="0.56" stopColor="#050806" /><stop offset="1" stopColor="#010201" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-ceiling" x1="0" y1="0" x2="0.58" y2="1">
          <stop stopColor="#252B26" /><stop offset="0.52" stopColor="#171C18" /><stop offset="1" stopColor="#080B09" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-left" x1="0" y1="0" x2="1" y2="0.7">
          <stop stopColor="#202620" /><stop offset="0.5" stopColor="#151A16" /><stop offset="1" stopColor="#070A08" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-right" x1="1" y1="0" x2="0" y2="0.7">
          <stop stopColor="#1A211B" /><stop offset="0.5" stopColor="#111612" /><stop offset="1" stopColor="#050806" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-floor" x1="0.46" y1="0" x2="0.54" y2="1">
          <stop stopColor="#151B16" /><stop offset="0.48" stopColor="#0B100C" /><stop offset="1" stopColor="#030503" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-panel" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#303731" /><stop offset="0.2" stopColor="#202620" /><stop offset="0.78" stopColor="#121713" /><stop offset="1" stopColor="#090C0A" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-pipe" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#69736B" /><stop offset="0.2" stopColor="#343D36" /><stop offset="0.7" stopColor="#171D18" /><stop offset="1" stopColor="#070A08" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-light" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#D2D4CA" /><stop offset="0.48" stopColor="#8F978E" /><stop offset="1" stopColor="#485148" />
        </linearGradient>
        <linearGradient id="kd-dsh-m4-cold-edge" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#9EC8C4" stopOpacity="0" /><stop offset="1" stopColor="#C7E0DC" stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id="kd-dsh-m4-service-a">
          <stop stopColor="#D7D8CD" stopOpacity="0.18" /><stop offset="1" stopColor="#D7D8CD" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-dsh-m4-service-b">
          <stop stopColor="#C8CCC2" stopOpacity="0.11" /><stop offset="1" stopColor="#C8CCC2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kd-dsh-m4-wet" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#738078" stopOpacity="0.12" /><stop offset="1" stopColor="#738078" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="kd-dsh-m4-warm">
          <stop stopColor="#9D653D" stopOpacity="0.16" /><stop offset="1" stopColor="#9D653D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-dsh-m4-vignette" cx="57%" cy="46%" r="72%">
          <stop offset="0.18" stopColor="#000" stopOpacity="0.04" /><stop offset="0.65" stopColor="#000" stopOpacity="0.2" /><stop offset="1" stopColor="#000" stopOpacity="0.68" />
        </radialGradient>
        <pattern id="kd-dsh-m4-grime" width="71" height="89" patternUnits="userSpaceOnUse">
          <path d="M8 18h19M42 70h14M50 29h7M14 59h8" stroke="#BAC2BA" strokeWidth="1" opacity="0.035" />
          <path d="M0 82h36M51 47h20" stroke="#000" strokeWidth="5" opacity="0.075" />
          <circle cx="39" cy="15" r="1.4" fill="#000" opacity="0.13" /><circle cx="13" cy="74" r="1" fill="#AAB4AB" opacity="0.045" />
        </pattern>
        <filter id="kd-dsh-m4-soft" x="-55%" y="-55%" width="210%" height="210%"><feGaussianBlur stdDeviation="8" /></filter>
        <filter id="kd-dsh-m4-shadow" x="-35%" y="-35%" width="190%" height="190%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>

      <rect width="393" height="852" fill="url(#kd-dsh-m4-bg)" />

      {/* Eigener mobiler Wartungsschacht: niedrige Röhre, sehr kurzer Blickweg. */}
      <path d="M0 0h393L286 345H132z" fill="url(#kd-dsh-m4-ceiling)" />
      <path d="M0 0h28l104 345v93L0 852z" fill="url(#kd-dsh-m4-left)" />
      <path d="M393 0h-20l-87 345v93l107 414z" fill="url(#kd-dsh-m4-right)" />
      <path d="M0 852h393L286 438H132z" fill="url(#kd-dsh-m4-floor)" />

      {/* Das Ende bleibt ein beinahe lichtloser Hohlraum ohne Tor- oder Türmotiv. */}
      <g>
        <path d="M132 345h154v93H132z" fill="#050706" />
        <path d="M132 367h53v45h-53zM249 367h37v45h-37z" fill="#010201" />
        <path d="M185 352h64v79h-64z" fill="#040605" />
        <path d="M139 359h40M257 359h25M140 419h38M258 419h23" fill="none" stroke="#303832" strokeWidth="2" opacity="0.12" />
        <path d="M248 352l6-7h32v61l-5 6h-33z" fill="url(#kd-dsh-m4-cold-edge)" opacity="0.43" />
        <path d="M279 367h7v45h-7z" fill="url(#kd-dsh-m4-cold-edge)" opacity="0.09" />
        <path d="M283 372h1.5v34H283z" fill="#C3DEDA" opacity="0.045" />
        <path d="M138 438h143l8 10H130z" fill="#050806" />
        <path d="M279 438h5l10 25h-8z" fill="url(#kd-dsh-m4-cold-edge)" opacity="0.028" />
      </g>

      {/* Vorderflansch und vier Ringe bleiben am oberen/lateralen Crop hängen;
          die Beine verschwinden früh in Wand und Bodenwanne. */}
      <g fill="none" strokeLinecap="square" strokeLinejoin="bevel">
        <path d="M14 282V69l22-22h324l20 22v216M14 702v66l20 22M380 704v64l-20 22M0 824h393" stroke="url(#kd-dsh-m4-panel)" strokeWidth="31" />
        <path d="M22 323V112l20-20h314l21 20v215M22 560v44M377 560v44" stroke="#252C26" strokeWidth="20" />
        <path d="M60 351V205l19-17h250l17 17v150M60 474v34M346 474v34" stroke="#1A201B" strokeWidth="17" />
        <path d="M99 373V277l16-14h194l15 14v100M99 435v24M324 435v24" stroke="#111612" strokeWidth="14" />
        <path d="M124 388v-47l13-12h149l13 12v50M124 414v16M299 414v16" stroke="#090D0A" strokeWidth="11" />
      </g>
      <g fill="#8A948B" opacity="0.25">
        <circle cx="24" cy="92" r="2" /><circle cx="370" cy="92" r="2" /><circle cx="27" cy="729" r="2" /><circle cx="366" cy="729" r="2" />
        <circle cx="70" cy="214" r="1.7" /><circle cx="336" cy="214" r="1.7" /><circle cx="70" cy="495" r="1.7" /><circle cx="335" cy="495" r="1.7" />
        <circle cx="107" cy="284" r="1.4" /><circle cx="316" cy="284" r="1.4" /><circle cx="107" cy="450" r="1.4" /><circle cx="316" cy="450" r="1.4" />
      </g>

      {/* Linke Seitenhaut mit eingelassenem Rohr- und Kabelkanal. */}
      <g>
        <path d="M0 108l51 73l81 164v93L0 775z" fill="#1D241E" />
        <path d="M0 211l66 58l66 108v31L0 342z" fill="#262D27" opacity="0.58" />
        <path d="M0 438l132-28v28L0 576z" fill="#0C110D" />
        <path d="M0 590l132-126v33L0 733z" fill="#151A16" />
        <path d="M0 339l132 58M0 575l132-123M0 733l132-235" fill="none" stroke="#465047" strokeWidth="3" opacity="0.16" />
        <path d="M5 475l52-18v95L5 597zM67 440l48-16v72l-48 42z" fill="#090D0A" stroke="#424B43" strokeOpacity="0.18" />
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M-24 74C45 105 83 218 139 354M-24 110C41 140 80 237 139 367" stroke="#020302" strokeWidth="25" opacity="0.82" filter="url(#kd-dsh-m4-shadow)" />
        <path d="M-24 67C45 98 83 211 139 347M-24 103C41 133 80 230 139 360" stroke="url(#kd-dsh-m4-pipe)" strokeWidth="15" />
        <path d="M-24 63C45 94 83 207 139 343M-24 99C41 129 80 226 139 356" stroke="#98A29A" strokeWidth="1.5" opacity="0.18" />
      </g>
      <g fill="#0A0E0B" stroke="#596159" strokeWidth="1.2">
        <path d="M31 112l10 4l10 47l-10-4zM68 189l9 6l12 43l-9-5zM103 267l8 8l11 37l-8-7zM128 326l7 8l8 27l-7-7z" />
      </g>

      {/* Rechte Seitenhaut: tiefer Kabelkanal und ein einziger Wartungsdeckel. */}
      <g>
        <path d="M393 72l-48 62v575l48 81z" fill="#202721" />
        <path d="M347 149l-42 67v397l42 83z" fill="#141A15" />
        <path d="M305 224l-24 68v244l24 74z" fill="#202721" />
        <path d="M352 184l34-43v437l-34 63z" fill="#080B09" stroke="#465047" strokeOpacity="0.25" />
        <path d="M362 210l17-22v330l-17 34z" fill="#111612" />
        <path d="M313 291l28-45v281l-28 51z" fill="#0B0F0C" stroke="#465047" strokeOpacity="0.24" />
        <path d="M319 316l16-28v203l-16 31z" fill="#242B25" opacity="0.38" />
        <path d="M348 134h8v579h-8zM304 210h8v416h-8zM278 284h7v260h-7z" fill="#050705" />
      </g>
      {/* Offener Wartungsschacht: schwarze Tiefe, matte Vorderlippe und der
          nach rechts geschobene perforierte Deckel. */}
      <g>
        <path d="M338 299l35-38v151l-35 42z" fill="#010201" stroke="#475048" strokeOpacity="0.2" />
        <path d="M345 309l23-25v105l-23 30z" fill="#050706" />
        <path d="M336 297l6 5v153l-6-5z" fill="#0A0D0A" />
        <path d="M373 300l20-22v139l-20 40z" fill="#23170F" stroke="#606961" strokeOpacity="0.28" />
      </g>
      <g fill="#060705" opacity="0.72">
        <circle cx="382" cy="311" r="2.5" /><circle cx="389" cy="302" r="2.2" /><circle cx="382" cy="336" r="2.5" /><circle cx="389" cy="327" r="2.2" /><circle cx="382" cy="361" r="2.5" /><circle cx="389" cy="352" r="2.2" />
      </g>
      <g fill="#778178" opacity="0.24">
        <circle cx="356" cy="190" r="1.7" /><circle cx="356" cy="622" r="1.7" /><circle cx="310" cy="232" r="1.4" /><circle cx="310" cy="600" r="1.4" />
      </g>

      {/* Acht Zentimeter tiefe Bodenwanne mit Mittelablauf und drei breiten Nähten. */}
      <g>
        <path d="M198 852l20-414h13l13 414z" fill="#020403" />
        <path d="M214 852l8-414h4l2 414z" fill="#1A211B" opacity="0.25" />
        <path d="M39 708c45 6 91 8 132 7m25 0c52-1 105-5 158-12M82 587c39 4 78 6 113 5m20-1c35-1 72-4 109-8M126 505c27 3 54 4 78 3m15 0c24-1 48-3 73-5" fill="none" stroke="#020403" strokeWidth="7" opacity="0.58" />
        <path d="M146 564c38-7 84-4 119 3l-12 119c-35 12-88 8-125-2z" fill="url(#kd-dsh-m4-wet)" opacity="0.31" />
      </g>

      {/* Kaltes Licht fällt von der Wartungsöffnung hinter der Kamera ein:
          erste Rippe lesbar, zweite halb, danach bricht es vollständig ab. */}
      <g className="kd-deep-space__lights">
        <g filter="url(#kd-dsh-m4-soft)">
          <ellipse cx="86" cy="88" rx="171" ry="139" fill="url(#kd-dsh-m4-service-a)" opacity="0.58" />
          <ellipse cx="132" cy="193" rx="111" ry="91" fill="url(#kd-dsh-m4-service-b)" opacity="0.31" />
          <path d="M0 0h277v105L212 174H38L0 142z" fill="url(#kd-dsh-m4-service-a)" opacity="0.16" />
          <g opacity="0.8">
            <g className="kd-deep-space__flicker-light">
              <ellipse cx="385" cy="347" rx="30" ry="72" fill="url(#kd-dsh-m4-warm)" />
            </g>
          </g>
          <ellipse cx="301" cy="365" rx="13" ry="39" fill="url(#kd-dsh-m4-service-b)" opacity="0.055" />
        </g>
        <path d="M0 0h231v52H0z" fill="url(#kd-dsh-m4-light)" opacity="0.09" />
        <path d="M15 255V72l23-22h154" fill="none" stroke="#98A49B" strokeWidth="3" strokeLinecap="round" opacity="0.14" />
        <path d="M303 343h2v40h-2z" fill="#C9E0DC" opacity="0.065" />
      </g>

      {/* Kondensationsspuren bleiben statisch und sparsam. */}
      <g fill="none" stroke="#AAB6AD" strokeLinecap="round" opacity="0.1">
        <path d="M52 104v43m0 8v15M92 163v31m0 7v12M344 153v43m0 7v18" />
      </g>
      <path d="M47 174c8 7 13 7 21 0M86 218c7 5 12 5 19-1M335 226c6 5 11 5 17-1" fill="none" stroke="#8D9990" strokeWidth="1.2" opacity="0.09" />

      <path d="M0 0h28l104 345v93L0 852zM393 0h-20l-87 345v93l107 414zM0 0h393L286 345H132z" fill="url(#kd-dsh-m4-grime)" opacity="0.42" />
      <rect width="393" height="852" fill="url(#kd-dsh-m4-vignette)" />
      <rect width="393" height="852" fill="url(#kd-dsh-m4-grime)" opacity="0.16" />
    </svg>
  );
}

const DEEP_SPACE_AMBIENT_EVENTS = ["steam-burst", "light-flicker", "sparks", "beacon-sweep"];

const DEEP_SPACE_EVENT_DURATIONS = {
  compact: {
    "steam-burst": 800,
    "light-flicker": 680,
    sparks: 900,
    "beacon-sweep": 2800,
  },
  mobile: {
    "steam-burst": 800,
    "light-flicker": 680,
    sparks: 900,
    "beacon-sweep": 2800,
  },
  desktop: {
    "steam-burst": 800,
    "light-flicker": 680,
    sparks: 900,
    "beacon-sweep": 2800,
  },
};

function viewportBand(width) {
  if (width <= 383) return "compact";
  if (width <= 760) return "mobile";
  return "desktop";
}

function SteamBurst() {
  return <div className="kd-deep-space__steam-burst" />;
}

function CableSparks() {
  return (
    <div className="kd-deep-space__sparks">
      <svg viewBox="0 0 120 190" focusable="false">
        <g fill="none" strokeLinecap="round">
          <path d="M16 2L8 36M35 0L22 52M54 5L40 70" />
          <path d="M73 0L58 58M92 4L74 76M109 1L91 51" opacity="0.72" />
          <path d="M28 48L15 103M49 62L31 126M70 53L51 119" opacity="0.9" />
          <path d="M91 67L71 143M110 54L88 126" opacity="0.58" />
          <path d="M58 116L39 184M84 127L66 189M112 115L93 178" opacity="0.76" />
        </g>
      </svg>
    </div>
  );
}

function ActiveDeepSpaceEvent({ event }) {
  if (!event) return null;
  if (event.type === "steam-burst") return <SteamBurst />;
  if (event.type === "sparks") return <CableSparks />;
  return null;
}

function useDeepSpaceEventScheduler(enabled = true) {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setEvent(null);
      return undefined;
    }
    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let startTimer = null;
    let endTimer = null;
    let lastAmbient = null;
    let nonce = 0;
    let disposed = false;

    const ambientDelay = () => 14000 + Math.round(Math.random() * 22000);
    let nextAmbientAt = Date.now() + ambientDelay();

    const clearTimers = () => {
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (endTimer !== null) window.clearTimeout(endTimer);
      startTimer = null;
      endTimer = null;
    };

    const chooseWithoutRepeat = (pool, previous) => {
      const choices = pool.filter((type) => type !== previous);
      const index = Math.min(choices.length - 1, Math.floor(Math.random() * choices.length));
      return choices[index];
    };

    const schedule = () => {
      if (disposed || motionQuery?.matches) return;
      const now = Date.now();
      const delay = Math.max(0, nextAmbientAt - now);
      startTimer = window.setTimeout(() => {
        startTimer = null;
        if (disposed || motionQuery?.matches) return;
        const type = chooseWithoutRepeat(DEEP_SPACE_AMBIENT_EVENTS, lastAmbient);
        lastAmbient = type;
        const band = viewportBand(window.innerWidth);
        const duration = DEEP_SPACE_EVENT_DURATIONS[band][type];
        nonce += 1;
        setEvent({ type, nonce });
        endTimer = window.setTimeout(() => {
          endTimer = null;
          if (disposed) return;
          setEvent(null);
          const endedAt = Date.now();
          nextAmbientAt = endedAt + ambientDelay();
          schedule();
        }, duration);
      }, delay);
    };

    const handleMotionChange = () => {
      clearTimers();
      setEvent(null);
      if (!motionQuery?.matches) {
        const resumedAt = Date.now();
        nextAmbientAt = resumedAt + ambientDelay();
        schedule();
      }
    };

    schedule();
    motionQuery?.addEventListener?.("change", handleMotionChange);
    return () => {
      disposed = true;
      clearTimers();
      motionQuery?.removeEventListener?.("change", handleMotionChange);
    };
  }, [enabled]);

  return event;
}

const DEEP_SPACE_TEST_BUTTONS = [
  { type: "steam-burst", label: "Dampfstoß" },
  { type: "light-flicker", label: "Lichtflackern" },
  { type: "sparks", label: "Funkenregen" },
  { type: "beacon-sweep", label: "Drehleuchte" },
];

function DeepSpaceTestPanel({ event, automatisch, pausiert, minimiert, onTrigger, onStop, onToggleAuto, onTogglePause, onToggleMinimized }) {
  return (
    <aside className={`kd-deep-space-testpanel${minimiert ? " kd-deep-space-testpanel--min" : ""}`}
      aria-label="Deep-Space-Animationswerkstatt">
      <div className="kd-deep-space-testpanel__head">
        <div>
          <strong>Deep Space Test</strong>
          {!minimiert && <span>{automatisch ? "Zufallsfolge" : event?.type || "bereit"}</span>}
        </div>
        <button type="button" onClick={onToggleMinimized}
          aria-label={minimiert ? "Testfenster öffnen" : "Testfenster minimieren"}
          aria-expanded={!minimiert}>{minimiert ? "+" : "−"}</button>
      </div>
      {!minimiert && (
        <>
          <div className="kd-deep-space-testpanel__grid">
            {DEEP_SPACE_TEST_BUTTONS.map(({ type, label }) => (
              <button type="button" key={type} onClick={() => onTrigger(type)}
                aria-pressed={!automatisch && event?.type === type}>{label}</button>
            ))}
          </div>
          <div className="kd-deep-space-testpanel__controls">
            <button type="button" onClick={onTogglePause} disabled={automatisch || !event}
              aria-pressed={pausiert}>{pausiert ? "Weiter" : "Pause"}</button>
            <button type="button" onClick={onStop}>Stopp</button>
            <button type="button" className={automatisch ? "is-active" : ""}
              onClick={onToggleAuto} aria-pressed={automatisch}>Zufall</button>
          </div>
          <p>Ein Effekt pro Klick. Derselbe Knopf startet ihn erneut.</p>
        </>
      )}
    </aside>
  );
}

export function DeepSpaceHorrorOverlay({ testPanel = false }) {
  const [manuellesEvent, setManuellesEvent] = useState(null);
  const [automatisch, setAutomatisch] = useState(false);
  const [pausiert, setPausiert] = useState(false);
  const [minimiert, setMinimiert] = useState(false);
  const manuellerNonceRef = useRef(0);
  const geplantesEvent = useDeepSpaceEventScheduler(!testPanel || automatisch);
  const event = testPanel && !automatisch ? manuellesEvent : geplantesEvent;
  const eventClass = event ? ` kd-deep-space--event-active kd-deep-space--event-${event.type}` : "";

  /* Ein Ereignis soll auch Schrift und Bedienplatten erreichen. Der Marker
     ist reiner DOM-Laufzeitzustand und wird nie gespeichert. */
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const wurzel = document.querySelector(".kd-wrap.kd-deep-space-horror");
    if (!wurzel) return undefined;
    if (event?.type) wurzel.dataset.kdDeepEvent = event.type;
    else delete wurzel.dataset.kdDeepEvent;
    return () => { delete wurzel.dataset.kdDeepEvent; };
  }, [event]);

  const trigger = (type) => {
    setAutomatisch(false);
    setPausiert(false);
    manuellerNonceRef.current += 1;
    setManuellesEvent({ type, nonce: `${type}-${manuellerNonceRef.current}` });
  };
  const stop = () => {
    setAutomatisch(false);
    setPausiert(false);
    setManuellesEvent(null);
  };
  const toggleAuto = () => {
    setPausiert(false);
    setManuellesEvent(null);
    setAutomatisch((aktiv) => !aktiv);
  };

  return (
    <>
      <div
        className={`kd-fx kd-fx-deep-space kd-deep-space-overlay${eventClass}${pausiert ? " kd-deep-space--test-paused" : ""}`}
        aria-hidden="true"
      >
        <DesktopCorridor />
        <MobileCorridor />
        <div className="kd-deep-space__steam" />
        <div className="kd-deep-space__beacon" />
        <ActiveDeepSpaceEvent key={event?.nonce ?? "idle"} event={event} />
      </div>
      {testPanel && (
        <DeepSpaceTestPanel
          event={event}
          automatisch={automatisch}
          pausiert={pausiert}
          minimiert={minimiert}
          onTrigger={trigger}
          onStop={stop}
          onToggleAuto={toggleAuto}
          onTogglePause={() => setPausiert((stand) => !stand)}
          onToggleMinimized={() => setMinimiert((stand) => !stand)}
        />
      )}
    </>
  );
}

export default DeepSpaceHorrorOverlay;
