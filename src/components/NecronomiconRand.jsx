import React from "react";

/* Dekorativer, eigenständiger Buchrand ohne externe Assets. Die Randfläche bleibt
   klickdurchlässig; nur das sichtbare X ist interaktiv. Escape verdrahtet App. */
export function NecronomiconRand({ onClose }) {
  return (
    <div className="kd-necro-rand">
      <div className="kd-necro-buch" aria-hidden="true">
      <svg className="kd-necro-haut" viewBox="0 0 1000 760" preserveAspectRatio="none">
        <defs>
          <filter id="kd-necro-rau" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.075" numOctaves="2" seed="23" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="9" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        <path className="kd-necro-kante" filter="url(#kd-necro-rau)"
          d="M18 34 L88 18 L164 31 L242 15 L326 27 L407 18 L492 31 L576 16 L660 27 L738 14 L817 29 L901 18 L982 39 L971 118 L984 204 L972 292 L985 382 L970 470 L983 552 L968 642 L980 724 L899 742 L818 730 L733 746 L651 731 L573 744 L489 729 L405 746 L326 731 L243 744 L161 729 L84 743 L20 721 L31 638 L17 551 L29 468 L16 381 L31 294 L18 205 L31 118 Z" />

        <g className="kd-necro-naht">
          <path d="M56 50 Q87 82 119 45 M162 43 Q190 76 224 39 M780 41 Q811 78 842 44 M879 50 Q913 82 944 54" />
          <path d="M55 706 Q89 675 122 713 M166 716 Q196 680 229 717 M775 714 Q807 680 844 716 M875 707 Q910 678 944 704" />
          <path d="M35 146 Q70 174 31 207 M34 552 Q69 579 31 616 M967 145 Q933 177 973 211 M968 552 Q932 579 972 616" />
        </g>

        <g className="kd-necro-runen">
          <path d="M79 115 l24 -28 l21 29 l-9 29 l-23 -7 z M887 111 l18 -27 l26 19 l-7 34 l-27 4 z" />
          <path d="M72 624 l21 -32 l27 31 l-12 31 z M885 626 l28 -30 l18 34 l-23 25 z" />
          <path d="M91 186 l15 25 l-29 0 z M905 181 l15 27 l-30 0 z M82 526 l28 0 l-14 27 z M890 525 l29 0 l-15 27 z" />
          <circle cx="99" cy="273" r="17" /><path d="M88 273 l22 -13 l-5 26 z" />
          <circle cx="902" cy="279" r="17" /><path d="M891 279 l22 -13 l-5 26 z" />
        </g>

        <g className="kd-necro-gesicht" transform="translate(500 79)">
          <path d="M-67 4 C-29 -12 29 -12 67 4 L53 54 C36 38 17 34 0 38 C-18 34 -36 38 -53 54 Z" />
          <path d="M-49 25 C-33 15 -18 18 -9 34 C-22 45 -37 44 -49 25 Z M49 25 C33 15 18 18 9 34 C22 45 37 44 49 25 Z" />
          <path d="M0 34 L15 63 L0 70 L-15 63 Z M-37 78 Q0 98 37 78 Q26 119 0 123 Q-27 117 -37 78 Z" />
        </g>
      </svg>

      <div className="kd-necro-seiten">
        <div className="kd-necro-seite kd-necro-links">
          <div className="kd-necro-glyphen">ᛉ ᚾ 𐌀 △ ᛟ ᚲ 𐌔</div>
          <svg className="kd-necro-studie" viewBox="0 0 390 500">
            <g className="kd-necro-zeichnung" fill="none">
              <circle cx="197" cy="83" r="42" />
              <path d="M171 79 Q180 64 192 78 M203 78 Q216 64 225 80 M197 84 L190 102 L204 102 M178 115 Q197 130 219 114" />
              <path d="M197 126 L197 317 M144 166 Q197 137 250 166 M151 180 Q197 153 243 180 M158 195 Q197 171 236 195 M166 211 Q197 191 228 211" />
              <path d="M197 155 L116 269 M197 155 L277 269 M197 315 L128 451 M197 315 L266 451" />
              <path d="M109 262 l-18 32 m24 -26 l-6 38 m11 -33 l8 34 M284 262 l17 32 m-23 -25 l5 38 m-10 -33 l-8 34" />
              <path d="M127 451 l-17 22 m24 -18 l2 28 m128 -32 l18 22 m-25 -18 l-1 28" />
              <path d="M133 157 Q82 103 47 121 Q85 159 90 214 Q117 187 151 183 M257 158 Q308 103 343 121 Q306 158 300 214 Q273 187 240 183" />
              <path d="M51 121 Q77 128 104 154 M338 122 Q313 130 286 154" />
              <circle cx="53" cy="380" r="31" /><path d="M34 378 l38 0 M53 349 v62 M31 357 l44 46 M76 357 l-45 46" />
              <path d="M302 352 q42 24 15 70 q-45 7 -49 -35 q5 -27 34 -35 z M281 380 q12 -18 25 1 M300 400 q14 -15 25 1" />
            </g>
          </svg>
          <div className="kd-necro-randnotiz">SANGUIS · OSSA · VERBUM</div>
        </div>

        <div className="kd-necro-seite kd-necro-rechts">
          <div className="kd-necro-kapitel">NECRONOMICON<br />EX MORTIS</div>
          <div className="kd-necro-siegel" aria-hidden="true"><span>△</span><i /><b /></div>
          <div className="kd-necro-beschwoerung">KLAATU<br />BARADA<br />NIKTO</div>
          <p>Die Worte sind gefallen.<br />Das Buch hat zugehört.</p>
          <div className="kd-necro-blutspur" />
          <div className="kd-necro-fussglyphen">ᚲ · ᛚ · ᚨ · ᚢ · ᛏ · ᚢ</div>
        </div>
      </div>
      </div>
      <button type="button" className="kd-necro-schliessen" onClick={onClose}
        aria-label="Necronomicon-Rand schließen" title="Schließen (Esc)">×</button>
    </div>
  );
}
