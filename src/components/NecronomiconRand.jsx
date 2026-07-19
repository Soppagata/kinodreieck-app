import React from "react";

/* Dekorativer, eigenständiger Buchrand. Keine Logik, keine Interaktion und
   keine externen Assets – dadurch kann Claude ihn gezielt nur im Personal-
   Modus mounten. */
export function NecronomiconRand() {
  return (
    <div className="kd-necro-rand" aria-hidden="true">
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

      <svg className="kd-necro-chainsaw" viewBox="0 0 260 92">
        <path className="kd-necro-saegeblatt" d="M12 31 H177 L209 42 L177 55 H12 L1 47 Z" />
        <path className="kd-necro-zaehne" d="M18 28 l8 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 l9 -8 l8 8 M20 58 l8 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8 l9 8 l8 -8" />
        <path className="kd-necro-motor" d="M169 27 L214 20 L245 36 L250 63 L226 79 L181 72 L164 55 Z" />
        <path className="kd-necro-griff" d="M199 24 Q201 3 221 4 H244 V16 H224 Q214 16 214 27 M207 72 Q205 87 188 88 H169 V77 H186 Q194 77 194 68" />
        <circle className="kd-necro-niete" cx="210" cy="49" r="8" />
      </svg>
    </div>
  );
}
