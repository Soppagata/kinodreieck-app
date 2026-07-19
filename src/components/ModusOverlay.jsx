import React from "react";
import nervLogoReference from "../assets/nerv-logo-reference.png";

/* ---- Egg-Modus-Overlays (rein dekorativ) ----
   Farbwelt = tokens.js; hier liegen nur Textur, Kulisse und Terminal-HUD.
   Die Ebenen bleiben pointer-events:none und verändern .kd-app nie dauerhaft. */

function Kaiju() {
  return (
    <g className="kd-kaiju-shape" transform="translate(520 63) scale(.75)">
      {/* Zusammenhängende Suitmation-Silhouette: nach vorn geneigter Kopf,
          schwerer Bauch, massive Oberschenkel und langer schleifender Schwanz. */}
      <path d="M12 326 C45 318 69 304 91 284 C87 259 86 237 90 213 C94 184 104 158 122 137 C126 115 136 94 152 75 C165 59 181 49 199 45 C217 41 235 46 248 56 C260 66 267 79 266 92 C265 102 258 109 247 114 L281 116 C296 117 305 122 304 130 C303 139 292 144 276 145 L249 144 C244 155 246 166 255 178 C267 190 278 198 287 204 C298 211 304 220 300 228 C296 236 287 237 277 232 L249 218 C238 212 229 208 218 208 C224 236 223 261 216 284 L234 318 C241 331 234 341 219 342 H198 C188 339 188 331 195 322 L201 309 L184 281 C179 303 176 319 180 329 C184 339 175 344 163 344 H129 C116 342 109 334 116 322 L124 302 L120 281 C108 283 100 286 91 293 C69 313 45 329 17 336 Z" />
      {/* Langer Unterarm mit deutlich getrennten Krallen. */}
      <path d="M220 164 C238 168 250 181 258 194 L283 209 C294 215 295 225 287 230 C279 233 273 227 267 220 L247 210 C238 205 229 202 219 201 L207 187 Z" />
      <path d="M283 209 L302 211 L289 219 L306 224 L287 228 Z" />
      {/* Große, unregelmäßige Rückenplatten entlang der gesamten Kontur. */}
      <path d="M157 81 L145 58 L156 62 L158 37 L171 56 L180 42 L179 77 Z" />
      <path d="M132 111 L113 87 L127 88 L124 58 L143 82 L151 65 L151 101 Z" />
      <path d="M111 150 L87 126 L103 126 L95 94 L119 120 L127 99 L129 139 Z" />
      <path d="M96 192 L68 171 L85 168 L72 137 L101 160 L107 137 L114 180 Z" />
      <path d="M91 236 L62 221 L79 214 L61 187 L94 204 L98 180 L109 222 Z" />
      <path d="M97 274 L68 265 L83 255 L61 235 L96 244 L96 222 L112 260 Z" />
      {/* Mundspalt, Auge und raue Hautstruktur brechen die flache Paint-Fläche. */}
      <path className="kd-kaiju-cut" d="M246 123 C266 126 281 127 296 130 C283 135 267 136 248 134 Z" />
      <circle className="kd-kaiju-eye" cx="241" cy="105" r="3.1" />
      <g className="kd-kaiju-texture" fill="none">
        <path d="M151 111 C175 102 199 106 218 122 M125 147 C153 137 188 142 207 160 M111 188 C142 177 179 184 203 205 M108 229 C140 218 177 226 203 247 M126 269 C151 258 182 264 202 280" />
        <path d="M151 113 l8 9 l9 -8 l9 10 l10 -8 M126 150 l9 10 l10 -9 l10 9 l10 -8 M114 191 l9 9 l10 -8 l11 10 l11 -8 M116 232 l10 9 l10 -8 l11 10 l11 -8" />
      </g>
    </g>
  );
}

function ShowaScene() {
  return (
    <svg className="kd-showa-scene" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {/* Rauch und entfernte Dachlandschaft. */}
      <g className="kd-city-smoke">
        <path d="M0 220 C94 185 136 210 208 176 C270 146 318 178 388 152 C458 126 508 156 572 137 C642 116 708 148 778 132 C866 111 925 147 1010 124 C1085 105 1144 131 1200 112 V320 H0 Z" />
        <path d="M615 193 C648 153 690 162 706 128 C721 96 763 91 786 124 C808 154 847 151 866 186 Z" opacity=".34" />
      </g>
      <g className="kd-city-back">
        <path d="M0 286 V224 H66 V197 H126 V238 H194 V183 H259 V221 H322 V167 H390 V226 H454 V188 H526 V220 H600 V173 H674 V228 H742 V194 H814 V221 H884 V177 H950 V232 H1028 V191 H1094 V216 H1160 V182 H1200 V320 H0 Z" />
        <path className="kd-city-roofline" d="M18 224 L50 207 L82 224 M206 183 L226 164 L246 183 M612 173 L637 151 L662 173 M1039 191 L1061 169 L1083 191" />
      </g>

      {/* Mittlere Ebene: Ginza/Wako-Uhrturm und Godzilla. */}
      <g className="kd-city-mid kd-wako">
        <path d="M262 320 V207 Q331 171 400 207 V320 Z" />
        <path d="M306 207 V135 H356 V207 Z M313 135 L331 105 L349 135 Z" />
        <rect x="326" y="83" width="10" height="23" />
        <circle className="kd-clock" cx="331" cy="159" r="15" />
        <path className="kd-clock-hand" d="M331 159 L331 149 M331 159 L339 164" />
        <path className="kd-city-window" d="M279 226 h16 v24 h-16z M307 226h16v24h-16z M339 226h16v24h-16z M367 226h16v24h-16z M279 268h16v24h-16z M307 268h16v24h-16z M339 268h16v24h-16z M367 268h16v24h-16z" />
      </g>
      <Kaiju />

      {/* Japanisches Parlamentsgebäude als rechter Bildanker. */}
      <g className="kd-city-mid kd-diet">
        <path d="M820 320 V222 H878 V184 H918 V130 H1006 V184 H1048 V222 H1124 V320 Z" />
        <path d="M902 130 L962 67 L1022 130 Z M915 130 L962 88 L1009 130 Z" />
        <path d="M932 184 V143 H992 V184 Z" />
        <path className="kd-city-window" d="M840 242h17v34h-17z M869 242h17v34h-17z M899 223h16v53h-16z M934 150h12v27h-12z M957 150h12v27h-12z M980 150h12v27h-12z M1010 223h16v53h-16z M1052 242h17v34h-17z M1082 242h17v34h-17z" />
        <path className="kd-city-detail" d="M812 222 H1132 M868 184 H1058 M918 130 H1006 M827 286 H1117" />
      </g>

      {/* Vordergrund: kleinteilige Miniaturhäuser verdecken Kaiju-Füße. */}
      <g className="kd-city-front">
        <path d="M0 320 V276 L45 242 L92 276 V320 Z M82 320 V264 L132 231 L182 264 V320 Z M168 320 V279 L205 250 L246 279 V320 Z M230 320 V255 L286 219 L342 255 V320 Z M332 320 V273 L375 239 L421 273 V320 Z M410 320 V260 L468 226 L526 260 V320 Z M511 320 V281 L556 247 L603 281 V320 Z M594 320 V267 L649 232 L705 267 V320 Z M694 320 V282 L739 250 L786 282 V320 Z M776 320 V264 L829 228 L884 264 V320 Z M872 320 V279 L917 247 L964 279 V320 Z M951 320 V263 L1006 227 L1063 263 V320 Z M1048 320 V280 L1093 249 L1140 280 V320 Z M1128 320 V266 L1164 237 L1200 266 V320 Z" />
        <path className="kd-city-window" d="M31 282h13v19H31z M58 282h13v19H58z M110 272h14v20h-14z M143 272h14v20h-14z M255 265h16v22h-16z M298 265h16v22h-16z M438 269h16v21h-16z M480 269h16v21h-16z M620 276h15v20h-15z M663 276h15v20h-15z M802 273h16v21h-16z M843 273h16v21h-16z M978 272h16v21h-16z M1020 272h16v21h-16z M1150 279h14v19h-14z" />
        <path className="kd-city-detail" d="M0 276 H92 M82 264 H182 M230 255 H342 M410 260 H526 M594 267 H705 M776 264 H884 M951 263 H1063" />
      </g>
      <g className="kd-utility" fill="none">
        <path d="M188 320 V202 M173 218 H203 M181 235 H197 M1068 320 V210 M1052 226 H1084 M1060 244 H1076" />
        <path d="M203 218 C470 186 788 190 1052 226 M197 235 C471 211 790 214 1060 244" opacity=".58" />
      </g>
    </svg>
  );
}

/* Privates Easteregg: Max' Referenzbild wird unverändert verwendet. Der Wrapper
   schneidet ausschließlich den grauen Screenshot-Streifen am unteren Rand ab. */
export function NervLogo() {
  return (
    <span className="kd-nerv-logo" role="img" aria-label="NERV">
      <img src={nervLogoReference} alt="" />
    </span>
  );
}

function ShowaFx() {
  return (
    <div className="kd-fx kd-fx-showa" aria-hidden="true">
      <div className="grade" />
      <div className="korn" />
      <div className="kd-beam" />
      <ShowaScene />
    </div>
  );
}

function NervFx() {
  return (
    <div className="kd-fx kd-fx-nerv" aria-hidden="true">
      <div className="kd-scan" />
      <div className="kd-hazard t" /><div className="kd-hazard b" />
      <svg className="kd-nerv-grid" viewBox="0 0 1000 700" preserveAspectRatio="none">
        <g fill="none" vectorEffect="non-scaling-stroke">
          <path d="M26 120 H156 L202 74 H386 M614 74 H798 L844 120 H974" />
          <path d="M26 580 H180 L224 626 H410 M590 626 H776 L820 580 H974" />
          <path d="M74 156 L138 92 H292 L330 130 H670 L708 92 H862 L926 156" />
          <polygon points="72,250 126,202 238,202 292,250 238,298 126,298" />
          <polygon points="708,404 762,356 874,356 928,404 874,452 762,452" />
          <path d="M292 250 H414 L454 290 H546 L586 250 H708 M292 404 H414 L454 364 H546 L586 404 H708" />
        </g>
      </svg>

      <div className="kd-nerv-battle">
        <b lang="ja">第一種戦闘配置</b>
        <span>BATTLE STATIONS · CONDITION ONE</span>
      </div>

      <div className="kd-nerv-alert l"><b lang="ja">警報</b><span>ALERT</span></div>
      <div className="kd-nerv-alert r"><b lang="ja">警報</b><span>ALERT</span></div>

      <div className="kd-nerv-episode">
        <b lang="ja">第3話</b>
        <span>THE THIRD EPISODE</span>
        <em>KINODREIECK</em>
      </div>

      <div className="kd-nerv-micro m1"><b lang="ja">作戦</b><span>OPERATION</span></div>
      <div className="kd-nerv-micro m2"><b lang="ja">外部</b><span>EXTERNAL</span></div>
      <div className="kd-nerv-micro m3"><b lang="ja">内部</b><span>INTERNAL</span></div>

    </div>
  );
}

export function ModusFx({ modus }) {
  if (modus === "showa") return <ShowaFx />;
  if (modus === "nerv") return <NervFx />;
  return null;
}
