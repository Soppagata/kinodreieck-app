import React, { useEffect, useState } from "react";
import "../styles/neon-noir.css";

function DesktopCity() {
  return (
    <svg
      className="kd-neon-noir__city kd-neon-noir__city--desktop"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id="kd-nn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060711" /><stop offset="0.58" stopColor="#0A1420" /><stop offset="1" stopColor="#07101A" />
        </linearGradient>
        <linearGradient id="kd-nn-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0A111B" stopOpacity="0" /><stop offset="0.42" stopColor="#0A111B" stopOpacity="0.78" />
          <stop offset="1" stopColor="#03050B" />
        </linearGradient>
        <linearGradient id="kd-nn-cyan-reflection" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#55E6F3" stopOpacity="0.42" /><stop offset="1" stopColor="#2A91B2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="kd-nn-pink-reflection" x1="1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#FF5BA7" stopOpacity="0.48" /><stop offset="1" stopColor="#A42A70" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="kd-nn-haze-left">
          <stop offset="0" stopColor="#52D6E4" stopOpacity="0.28" /><stop offset="1" stopColor="#52D6E4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-nn-haze-right">
          <stop offset="0" stopColor="#239BB8" stopOpacity="0.22" /><stop offset="1" stopColor="#239BB8" stopOpacity="0" />
        </radialGradient>
        <pattern id="kd-nn-windows-a" width="38" height="42" patternUnits="userSpaceOnUse">
          <rect x="8" y="9" width="4" height="9" rx="1" fill="#6BC7D6" opacity="0.27" />
          <rect x="22" y="9" width="5" height="9" rx="1" fill="#E8D9A0" opacity="0.16" />
          <rect x="8" y="28" width="5" height="4" rx="1" fill="#9DE2EA" opacity="0.12" />
        </pattern>
        <pattern id="kd-nn-windows-b" width="31" height="36" patternUnits="userSpaceOnUse">
          <rect x="6" y="7" width="3" height="7" rx="1" fill="#9BDCE3" opacity="0.18" />
          <rect x="18" y="20" width="4" height="6" rx="1" fill="#FFBE73" opacity="0.14" />
        </pattern>
        <filter id="kd-nn-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="kd-nn-sign-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="kd-nn-hologram-column" x1="0" y1="0" x2="0.25" y2="1">
          <stop stopColor="#8DF7F6" stopOpacity="0.22" />
          <stop offset="0.48" stopColor="#38CEDB" stopOpacity="0.075" />
          <stop offset="1" stopColor="#1B768F" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1600" height="1000" fill="url(#kd-nn-sky)" />
      <ellipse cx="205" cy="420" rx="370" ry="410" fill="url(#kd-nn-haze-left)" />
      <ellipse cx="1408" cy="458" rx="360" ry="430" fill="url(#kd-nn-haze-right)" />

      <g fill="#101D28" opacity="0.48">
        <path d="M0 704V292h76V188h122v104h92v-46h118v458z" />
        <path d="M265 704V354h92v-96h96v96h74v350z" />
        <path d="M442 704V508h112v-86h96v282z" />
        <path d="M1015 704V478h98V386h92v318z" />
        <path d="M1176 704V328h91v-90h113v90h78v376z" />
        <path d="M1374 704V244h116V142h110v562z" />
      </g>
      <g opacity="0.58">
        <path d="M0 708V204h126V98h112v606z" fill="#07111D" />
        <path d="M84 708V294h184V162h112v546z" fill="#0A1420" />
        <path d="M0 708V204h126V98h112v606z" fill="url(#kd-nn-windows-a)" />
        <path d="M84 708V294h184V162h112v546z" fill="url(#kd-nn-windows-b)" />
        <path d="M1220 708V228h112V122h128v586z" fill="#08121F" />
        <path d="M1350 708V306h118V182h132v526z" fill="#0A1420" />
        <path d="M1220 708V228h112V122h128v586z" fill="url(#kd-nn-windows-b)" />
        <path d="M1350 708V306h118V182h132v526z" fill="url(#kd-nn-windows-a)" />
      </g>

      <g>
        <path d="M0 1000V346h88V274h152v154h88V1000z" fill="#050A12" />
        <path d="M0 1000V346h88V274h152v154h88V1000z" fill="url(#kd-nn-windows-a)" opacity="0.52" />
        <path d="M0 1000V530h116V458h176v542z" fill="#060B13" opacity="0.96" />
        <path d="M1600 1000V326h-94V248h-148v136h-90v616z" fill="#050A12" />
        <path d="M1600 1000V326h-94V248h-148v136h-90v616z" fill="url(#kd-nn-windows-b)" opacity="0.56" />
        <path d="M1600 1000V540h-120V448h-166v552z" fill="#060B13" opacity="0.96" />
      </g>

      <g fontFamily="'Barlow Condensed', Arial, sans-serif" fontWeight="600" letterSpacing="4">
        <g className="kd-neon-noir__kino-hologram" transform="translate(28 350) rotate(-4)">
          <path d="M25 0h78l30 266H5z" fill="url(#kd-nn-hologram-column)" />
          <path d="M29 4h70M19 65h91M14 126h104M10 188h114M6 250h124" fill="none" stroke="#72EAF0" strokeWidth="1" opacity="0.12" />
          <path d="M23 -5h82l-8 13H31z" fill="#102B35" stroke="#64E5EA" strokeWidth="2" opacity="0.82" />
          <text className="kd-neon-noir__kino-depth" x="69" y="50" fill="#15768D" stroke="#15768D" strokeWidth="4" fontSize="39" textAnchor="middle" opacity="0.3">
            <tspan x="69">K</tspan><tspan x="69" dy="53">I</tspan><tspan x="69" dy="53">N</tspan><tspan x="69" dy="53">O</tspan>
          </text>
          <text className="kd-neon-noir__kino-depth" x="64" y="45" fill="#2AAAB9" stroke="#2AAAB9" strokeWidth="2.4" fontSize="39" textAnchor="middle" opacity="0.48">
            <tspan x="64">K</tspan><tspan x="64" dy="53">I</tspan><tspan x="64" dy="53">N</tspan><tspan x="64" dy="53">O</tspan>
          </text>
          <text className="kd-neon-noir__kino-face" filter="url(#kd-nn-sign-glow)" x="59" y="40" fill="#C9FCFC" stroke="#65E8EC" strokeWidth="1.2" paintOrder="stroke" fontSize="39" textAnchor="middle">
            <tspan x="59">K</tspan><tspan x="59" dy="53">I</tspan><tspan x="59" dy="53">N</tspan><tspan x="59" dy="53">O</tspan>
          </text>
        </g>
        <g className="kd-neon-noir__wien-sign" filter="url(#kd-nn-sign-glow)" transform="translate(1430 350) rotate(5)">
          <path d="M0 12L19 0h103l18 13-7 52H10L0 50z" fill="#180817" stroke="#FF5BA7" strokeWidth="3" />
          <path d="M12 17L27 8h86l15 10-5 35H19l-7-10z" fill="none" stroke="#FF9ACA" strokeWidth="1.5" opacity="0.68" />
          <circle cx="17" cy="31" r="3.5" fill="#FFD0E5" />
          <path d="M114 21l9 9-12 12" fill="none" stroke="#FF78B8" strokeWidth="3" strokeLinecap="round" />
          <text x="70" y="41" fill="#FFE4F0" fontSize="24" fontStyle="italic" textAnchor="middle">WIEN</text>
        </g>
      </g>

      <g className="kd-neon-noir__road-ads" filter="url(#kd-nn-sign-glow)" aria-hidden="true">
        <g className="kd-neon-noir__road-ad" transform="translate(92 548) rotate(-5)">
          <path d="M0 8L12 0h66l10 9-7 37H7z" fill="#19090E" stroke="#FF503F" strokeWidth="2.5" />
          <path d="M17 13h48M13 24h31M49 24h18M10 35h55" stroke="#FF8A63" strokeWidth="3" opacity="0.86" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(150 603) rotate(3)">
          <rect width="68" height="30" rx="3" fill="#07171A" stroke="#49E5DD" strokeWidth="2" />
          <path d="M11 20l10-10 10 10 10-10 15 10" fill="none" stroke="#B8FFEC" strokeWidth="2" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(218 635) rotate(-2)">
          <path d="M0 6l8-6h45l7 7-6 24H5z" fill="#1A1208" stroke="#FFBD4A" strokeWidth="1.8" />
          <circle cx="18" cy="15" r="5" fill="none" stroke="#FFE18A" strokeWidth="2" /><path d="M30 10h18M30 17h14M30 24h10" stroke="#FFBD4A" strokeWidth="2" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(1490 515) rotate(4)">
          <rect width="54" height="132" rx="2" fill="#130914" stroke="#FF4F9A" strokeWidth="2.5" />
          <path d="M16 17h22l-8 19 10 16-20 20 15 18-18 25" fill="none" stroke="#FF98C8" strokeWidth="4" strokeLinejoin="round" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(1372 617) rotate(-3)">
          <path d="M0 5l8-5h67l7 7-5 31H5z" fill="#07161B" stroke="#50DDE8" strokeWidth="2" />
          <path d="M12 11h19v16H12zM38 11h27M38 19h20M38 27h14" fill="none" stroke="#A8F7F8" strokeWidth="2" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(1263 655) rotate(2)">
          <rect width="59" height="27" rx="2" fill="#1A0B08" stroke="#FF694E" strokeWidth="1.8" />
          <path d="M9 18l8-10 8 10 8-10 8 10 8-10" fill="none" stroke="#FFD078" strokeWidth="2" />
        </g>
      </g>

      <path d="M0 650H1600V1000H0z" fill="url(#kd-nn-road)" />
      <g filter="url(#kd-nn-soft-glow)">
        <path d="M42 604L162 604L292 1000H14z" fill="url(#kd-nn-cyan-reflection)" opacity="0.58" />
        <path d="M215 600L295 600L386 1000H186z" fill="url(#kd-nn-pink-reflection)" opacity="0.42" />
        <path d="M1390 588L1538 588L1584 1000H1262z" fill="url(#kd-nn-pink-reflection)" opacity="0.5" />
        <path d="M1270 606L1354 606L1308 1000H1152z" fill="url(#kd-nn-cyan-reflection)" opacity="0.36" />
      </g>
      <g fill="none" strokeLinecap="round" opacity="0.18">
        <path d="M72 748h298M24 822h452M1122 756h438M1068 854h520" stroke="#86E8EF" strokeWidth="3" />
        <path d="M178 786h230M1194 794h338" stroke="#FF68AF" strokeWidth="2" />
      </g>
    </svg>
  );
}

function MobileCity() {
  return (
    <svg
      className="kd-neon-noir__city kd-neon-noir__city--mobile"
      viewBox="0 0 430 932"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id="kd-nn-mobile-sky" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#060711" /><stop offset="0.56" stopColor="#0A1826" /><stop offset="1" stopColor="#050811" />
        </linearGradient>
        <linearGradient id="kd-nn-mobile-road" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#101B28" /><stop offset="1" stopColor="#03050A" />
        </linearGradient>
        <radialGradient id="kd-nn-mobile-haze-c">
          <stop stopColor="#74F0EC" stopOpacity="0.22" /><stop offset="0.34" stopColor="#36BBD8" stopOpacity="0.1" />
          <stop offset="1" stopColor="#36BBD8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kd-nn-mobile-haze-p">
          <stop stopColor="#FF5BA7" stopOpacity="0.16" /><stop offset="1" stopColor="#FF5BA7" stopOpacity="0" />
        </radialGradient>
        <filter id="kd-nn-mobile-sign-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="kd-nn-mobile-hologram-column" x1="0" y1="0" x2="0.3" y2="1">
          <stop stopColor="#8DF7F6" stopOpacity="0.22" />
          <stop offset="0.48" stopColor="#38CEDB" stopOpacity="0.075" />
          <stop offset="1" stopColor="#1B768F" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="430" height="932" fill="url(#kd-nn-mobile-sky)" />
      <ellipse cx="62" cy="506" rx="128" ry="280" fill="url(#kd-nn-mobile-haze-c)" />
      <ellipse cx="388" cy="586" rx="112" ry="238" fill="url(#kd-nn-mobile-haze-p)" />

      {/* Entfernte zentrale Stadt und klarer Fluchtpunkt. */}
      <g fill="#0C1723" opacity="0.48">
        <path d="M82 610V248h38v-91h47v453zM142 610V326h36v-112h42v396z" />
        <path d="M203 610V286h42v-145h48v469zM274 610V348h36v-102h42v364z" />
        <path d="M335 610V264h38v-79h57v425z" />
      </g>
      <g fill="#9BDCE3" opacity="0.13">
        <rect x="101" y="302" width="4" height="9" /><rect x="129" y="397" width="5" height="3" />
        <rect x="164" y="356" width="4" height="8" /><rect x="210" y="329" width="4" height="10" />
        <rect x="263" y="276" width="5" height="3" /><rect x="298" y="401" width="4" height="9" />
        <rect x="350" y="324" width="4" height="10" /><rect x="389" y="429" width="5" height="3" />
      </g>
      <g fill="#FFBE73" opacity="0.1">
        <rect x="116" y="442" width="4" height="3" /><rect x="187" y="417" width="4" height="8" />
        <rect x="280" y="462" width="4" height="3" /><rect x="369" y="396" width="4" height="8" />
      </g>

      {/* Drei versetzte hohe Gebäudelagen links. */}
      <g>
        <path d="M0 0h70l38 176v518H0z" fill="#050A12" />
        <path d="M28 58h78l32 128v508H49z" fill="#08131E" opacity="0.92" />
        <path d="M77 126h78l25 178v390H119z" fill="#0B1722" opacity="0.78" />
        <path d="M0 34h24l14 92v568H0z" fill="#050A12" opacity="0.98" />
        <path d="M22 74h34l12 116v504H38z" fill="#08131E" opacity="0.9" />
        <path d="M50 142h31l9 150v402H66z" fill="#0B1722" opacity="0.76" />
        <g fill="none" stroke="#8ADCE4" strokeWidth="1" opacity="0.07">
          <path d="M24 82l14 612M55 142l13 552M80 222l10 472" />
        </g>
        <path d="M0 694V412h62v-94h58v376z" fill="#060B13" />
        <path d="M62 694V492h62v-78h52v280z" fill="#07101A" opacity="0.94" />
        <g fill="#8ADCE4" opacity="0.16">
          <rect x="22" y="96" width="4" height="9" /><rect x="48" y="188" width="5" height="3" />
          <rect x="72" y="133" width="4" height="10" /><rect x="101" y="242" width="5" height="3" />
          <rect x="128" y="208" width="4" height="9" /><rect x="142" y="356" width="5" height="3" />
          <rect x="28" y="472" width="4" height="10" /><rect x="91" y="528" width="5" height="3" />
          <rect x="9" y="162" width="3" height="6" /><rect x="34" y="254" width="2" height="3" />
          <rect x="57" y="322" width="3" height="7" /><rect x="13" y="381" width="2" height="3" />
          <rect x="42" y="430" width="3" height="5" /><rect x="68" y="586" width="2" height="6" />
        </g>
        <g fill="#FFBE73" opacity="0.1">
          <rect x="16" y="222" width="2" height="3" /><rect x="51" y="282" width="3" height="5" />
          <rect x="30" y="542" width="2" height="4" />
        </g>
      </g>

      {/* Rechts andere Höhen und Rücksprünge, nicht gespiegelt. */}
      <g>
        <path d="M430 0h-64l-34 158v536h98z" fill="#050A12" />
        <path d="M402 42h-83l-28 151v501h91z" fill="#08131E" opacity="0.92" />
        <path d="M344 151h-74l-20 168v375h58z" fill="#0B1722" opacity="0.76" />
        <path d="M430 26h-27l-13 102v566h40z" fill="#050A12" opacity="0.98" />
        <path d="M409 68h-36l-11 132v494h31z" fill="#08131E" opacity="0.9" />
        <path d="M380 154h-32l-8 157v383h25z" fill="#0B1722" opacity="0.75" />
        <g fill="none" stroke="#8ADCE4" strokeWidth="1" opacity="0.07">
          <path d="M403 83l-13 611M374 152l-12 542M349 232l-9 462" />
        </g>
        <path d="M430 694V386h-64v-102h-54v410z" fill="#060B13" />
        <path d="M368 694V506h-66v-86h-52v274z" fill="#07101A" opacity="0.94" />
        <g fill="#8ADCE4" opacity="0.15">
          <rect x="393" y="82" width="4" height="10" /><rect x="370" y="176" width="5" height="3" />
          <rect x="336" y="119" width="4" height="9" /><rect x="311" y="251" width="5" height="3" />
          <rect x="286" y="232" width="4" height="10" /><rect x="273" y="368" width="5" height="3" />
          <rect x="396" y="462" width="4" height="9" /><rect x="333" y="543" width="5" height="3" />
          <rect x="419" y="144" width="2" height="6" /><rect x="386" y="236" width="3" height="3" />
          <rect x="361" y="304" width="2" height="7" /><rect x="416" y="368" width="3" height="3" />
          <rect x="388" y="426" width="2" height="5" /><rect x="357" y="578" width="3" height="6" />
        </g>
        <g fill="#FFBE73" opacity="0.09">
          <rect x="413" y="211" width="2" height="3" /><rect x="377" y="275" width="3" height="5" />
          <rect x="401" y="529" width="2" height="4" />
        </g>
      </g>

      <g fontFamily="'Barlow Condensed', Arial, sans-serif" fontWeight="600" letterSpacing="2.5">
        <g className="kd-neon-noir__kino-hologram" transform="translate(-4 286) rotate(-4)">
          <path d="M8 0h34l16 171H0z" fill="url(#kd-nn-mobile-hologram-column)" />
          <path d="M10 3h30M6 44h41M3 85h48M1 127h54M1 166h57" fill="none" stroke="#72EAF0" strokeWidth="0.8" opacity="0.15" />
          <path d="M7 -3h37l-4 8H10z" fill="#102B35" stroke="#64E5EA" strokeWidth="1.4" opacity="0.88" />
          <text className="kd-neon-noir__kino-depth" x="26" y="31" fill="#15768D" stroke="#15768D" strokeWidth="2.5" fontSize="24" textAnchor="middle" opacity="0.36">
            <tspan x="26">K</tspan><tspan x="26" dy="35">I</tspan><tspan x="26" dy="35">N</tspan><tspan x="26" dy="35">O</tspan>
          </text>
          <text className="kd-neon-noir__kino-depth" x="23" y="28" fill="#2AAAB9" stroke="#2AAAB9" strokeWidth="1.5" fontSize="24" textAnchor="middle" opacity="0.54">
            <tspan x="23">K</tspan><tspan x="23" dy="35">I</tspan><tspan x="23" dy="35">N</tspan><tspan x="23" dy="35">O</tspan>
          </text>
          <text className="kd-neon-noir__kino-face" filter="url(#kd-nn-mobile-sign-glow)" x="20" y="25" fill="#D7FFFF" stroke="#65E8EC" strokeWidth="0.9" paintOrder="stroke" fontSize="24" textAnchor="middle">
            <tspan x="20">K</tspan><tspan x="20" dy="35">I</tspan><tspan x="20" dy="35">N</tspan><tspan x="20" dy="35">O</tspan>
          </text>
        </g>
        <g className="kd-neon-noir__wien-sign" filter="url(#kd-nn-mobile-sign-glow)" transform="translate(337 338) rotate(5) scale(.66)">
          <path d="M0 10L15 0h81l15 11-6 43H8L0 42z" fill="#180817" stroke="#FF5BA7" strokeWidth="3" />
          <path d="M10 14L22 7h66l12 8-4 28H16l-6-8z" fill="none" stroke="#FF9ACA" strokeWidth="1.5" opacity="0.72" />
          <circle cx="14" cy="27" r="3" fill="#FFD0E5" />
          <path d="M88 18l8 8-10 10" fill="none" stroke="#FF78B8" strokeWidth="3" strokeLinecap="round" />
          <text x="55" y="35" fill="#FFE4F0" fontSize="21" fontStyle="italic" textAnchor="middle">WIEN</text>
        </g>
      </g>

      <g className="kd-neon-noir__road-ads" filter="url(#kd-nn-mobile-sign-glow)" opacity="0.74" aria-hidden="true">
        <g className="kd-neon-noir__road-ad" transform="translate(-32 470) rotate(-4)">
          <path d="M0 5l7-5h39l6 6-5 27H4z" fill="#19090E" stroke="#FF5547" strokeWidth="1.6" />
          <path d="M10 10h27M8 17h18M29 17h10M7 25h31" stroke="#FF9A68" strokeWidth="1.7" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(-27 548) rotate(3)">
          <rect width="43" height="20" rx="2" fill="#07171A" stroke="#49E5DD" strokeWidth="1.4" />
          <path d="M7 14l7-7 7 7 7-7 9 7" fill="none" stroke="#B8FFEC" strokeWidth="1.3" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(-25 597) rotate(-2)">
          <path d="M0 4l5-4h31l5 5-4 17H3z" fill="#1A1208" stroke="#FFBD4A" strokeWidth="1.3" />
          <circle cx="12" cy="11" r="3.5" fill="none" stroke="#FFE18A" strokeWidth="1.3" /><path d="M20 7h13M20 12h10M20 17h7" stroke="#FFBD4A" strokeWidth="1.2" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(407 452) rotate(4)">
          <rect width="31" height="83" rx="2" fill="#130914" stroke="#FF4F9A" strokeWidth="1.7" />
          <path d="M10 10h13l-5 12 7 10-13 12 9 11-11 16" fill="none" stroke="#FF98C8" strokeWidth="2.5" strokeLinejoin="round" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(409 543) rotate(-3)">
          <path d="M0 4l5-4h42l5 5-4 23H3z" fill="#07161B" stroke="#50DDE8" strokeWidth="1.5" />
          <path d="M8 8h12v12H8zM25 8h16M25 14h13M25 20h9" fill="none" stroke="#A8F7F8" strokeWidth="1.3" />
        </g>
        <g className="kd-neon-noir__road-ad" transform="translate(408 603) rotate(2)">
          <rect width="39" height="19" rx="2" fill="#1A0B08" stroke="#FF694E" strokeWidth="1.3" />
          <path d="M6 13l5-7 6 7 5-7 6 7 5-7" fill="none" stroke="#FFD078" strokeWidth="1.3" />
        </g>
      </g>

      <path d="M0 932L196 535h52l182 397z" fill="url(#kd-nn-mobile-road)" />
      <g fill="#62E4E0" opacity="0.14">
        <path d="M9 648l47-3 13 4-8 4-52 2zM342 675l62-3 16 4-9 4-58 1z" />
        <path d="M31 724l35-2 19 5-11 4-48-2zM366 748l43-2 13 5-17 3-41-2z" opacity="0.78" />
        <path d="M5 792l26-2 10 3-7 3-29 1zM319 816l48-3 14 4-12 4-53-1z" opacity="0.55" />
      </g>
      <g fill="#FF5BA7" opacity="0.11">
        <path d="M18 684l30-2 11 3-8 3-37 1zM374 631l42-3 10 3-7 4-47 1z" />
        <path d="M66 763l27-2 9 4-13 3-30-2zM337 781l35-2 18 4-14 4-43-2z" opacity="0.72" />
      </g>
      <g fill="none" strokeLinecap="round" opacity="0.065">
        <path d="M12 704h44M354 713h62M28 838h51M347 850h52" stroke="#91EDF1" strokeWidth="2" />
      </g>
    </svg>
  );
}

function RainLayer() {
  return (
    <svg
      className="kd-neon-noir__rain"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id="kd-nn-rain-far" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#D8F3F5" stopOpacity="0" />
          <stop offset="0.38" stopColor="#C6EDF1" stopOpacity="0.42" />
          <stop offset="1" stopColor="#8BC8D1" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="kd-nn-rain-near" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#EFFBFC" stopOpacity="0" />
          <stop offset="0.28" stopColor="#E2F7F8" stopOpacity="0.72" />
          <stop offset="0.82" stopColor="#A5D7DE" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7EB6C1" stopOpacity="0" />
        </linearGradient>
        <pattern id="kd-nn-rain-field-far" width="113" height="137" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="url(#kd-nn-rain-far)" strokeLinecap="round" vectorEffect="non-scaling-stroke">
            <path d="M8 7l-2 7M31 16l-3 9M55 5l-1 6M79 23l-4 11M105 10l-2 8" strokeWidth="1.15" opacity="0.7" />
            <path d="M17 41l-4 11M42 52l-2 7M66 36l-3 10M94 57l-3 9M110 43l-1 6" strokeWidth="1" opacity="0.56" />
            <path d="M5 75l-3 9M26 88l-1 7M51 71l-4 12M75 95l-2 8M103 80l-4 13" strokeWidth="1.24" opacity="0.66" />
            <path d="M13 116l-2 8M38 106l-3 10M61 123l-1 6M87 112l-3 9M110 126l-2 7" strokeWidth="1.06" opacity="0.6" />
          </g>
        </pattern>
        <pattern id="kd-nn-rain-field-near" width="181" height="211" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="url(#kd-nn-rain-near)" strokeLinecap="round" vectorEffect="non-scaling-stroke">
            <path d="M14 12l-5 15M58 5l-4 12M105 23l-6 18M165 10l-4 14" strokeWidth="1.85" opacity="0.66" />
            <path d="M34 51l-6 19M83 41l-4 15M137 63l-7 20M177 47l-3 12" strokeWidth="1.56" opacity="0.56" />
            <path d="M9 98l-4 14M48 85l-7 21M101 109l-5 17M153 94l-6 19" strokeWidth="2" opacity="0.7" />
            <path d="M25 146l-5 18M74 133l-3 13M121 159l-7 21M173 140l-4 16" strokeWidth="1.68" opacity="0.62" />
            <path d="M6 195l-3 12M46 183l-6 19M96 199l-4 14M146 185l-7 22M179 201l-3 10" strokeWidth="1.9" opacity="0.66" />
          </g>
        </pattern>
      </defs>
      <rect width="1600" height="1000" fill="url(#kd-nn-rain-field-far)" />
      <rect width="1600" height="1000" fill="url(#kd-nn-rain-field-near)" />
    </svg>
  );
}

function RareFlyby() {
  return (
    <div className="kd-neon-noir__flyby" aria-hidden="true">
      <span /><span />
    </div>
  );
}

function useRareFlyby() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let startTimer = null;
    let endTimer = null;
    let disposed = false;

    const clearTimers = () => {
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (endTimer !== null) window.clearTimeout(endTimer);
      startTimer = null;
      endTimer = null;
    };

    const schedule = () => {
      if (disposed || motionQuery?.matches) return;
      const delay = 90000 + Math.round(Math.random() * 240000);
      startTimer = window.setTimeout(() => {
        startTimer = null;
        if (disposed || motionQuery?.matches) return;
        setActive(true);
        endTimer = window.setTimeout(() => {
          endTimer = null;
          if (disposed) return;
          setActive(false);
          schedule();
        }, 1050);
      }, delay);
    };

    const handleMotionChange = () => {
      clearTimers();
      setActive(false);
      if (!motionQuery?.matches) schedule();
    };

    schedule();
    motionQuery?.addEventListener?.("change", handleMotionChange);
    return () => {
      disposed = true;
      clearTimers();
      motionQuery?.removeEventListener?.("change", handleMotionChange);
    };
  }, []);

  return active;
}

/** Rein dekorative Neon-Noir-Kulisse ohne Interaktionen oder externe Assets. */
export function NeonNoirOverlay() {
  const flybyActive = useRareFlyby();
  return (
    <div className={`kd-fx kd-fx-neon-noir kd-neon-noir-overlay${flybyActive ? " kd-neon-noir--flyby" : ""}`} aria-hidden="true">
      <DesktopCity />
      <MobileCity />
      <div className="kd-neon-noir__mist" />
      <RareFlyby />
      <RainLayer />
    </div>
  );
}

export default NeonNoirOverlay;
