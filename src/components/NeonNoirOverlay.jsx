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
        <g filter="url(#kd-nn-sign-glow)" transform="translate(51 424) rotate(-3)">
          <rect width="66" height="186" rx="3" fill="#06131C" stroke="#4FE4EE" strokeWidth="3" />
          <text x="33" y="34" fill="#B9F8FA" fontSize="25" textAnchor="middle">
            <tspan x="33">K</tspan><tspan x="33" dy="38">I</tspan><tspan x="33" dy="38">N</tspan><tspan x="33" dy="38">O</tspan>
          </text>
        </g>
        <g transform="translate(192 348) rotate(2)">
          <rect width="104" height="42" rx="3" fill="#110B1B" stroke="#FF5BA7" strokeWidth="2" opacity="0.92" />
          <text x="52" y="28" fill="#FFC0DD" fontSize="17" textAnchor="middle">00:01</text>
        </g>
        <g filter="url(#kd-nn-sign-glow)" transform="translate(1460 382) rotate(3)">
          <rect width="90" height="48" rx="3" fill="#071923" stroke="#4FE4EE" strokeWidth="3" />
          <text x="45" y="32" fill="#CAF9FA" fontSize="20" textAnchor="middle">WIEN</text>
        </g>
        <g transform="translate(1308 548) rotate(-2)">
          <rect width="238" height="48" rx="3" fill="#180B1A" stroke="#FF5BA7" strokeWidth="2" opacity="0.9" />
          <text x="119" y="31" fill="#FFD1E6" fontSize="15" textAnchor="middle">SPÄTVORSTELLUNG</text>
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
        <g filter="url(#kd-nn-mobile-sign-glow)" transform="translate(12 330) rotate(-3)">
          <rect width="38" height="118" rx="3" fill="#07151E" stroke="#4FE4EE" strokeWidth="2" />
          <text x="19" y="23" fill="#C4F9FA" fontSize="14" textAnchor="middle">
            <tspan x="19">K</tspan><tspan x="19" dy="25">I</tspan><tspan x="19" dy="25">N</tspan><tspan x="19" dy="25">O</tspan>
          </text>
        </g>
        <g transform="translate(74 282) rotate(2)">
          <rect width="59" height="27" rx="2" fill="#130A17" stroke="#FF5BA7" strokeWidth="1.5" />
          <text x="29.5" y="18" fill="#FFD0E4" fontSize="10" textAnchor="middle">00:01</text>
        </g>
        <g filter="url(#kd-nn-mobile-sign-glow)" transform="translate(366 360) rotate(3)">
          <rect width="56" height="31" rx="2" fill="#071821" stroke="#4FE4EE" strokeWidth="2" />
          <text x="28" y="21" fill="#C7F9FA" fontSize="11" textAnchor="middle">WIEN</text>
        </g>
        <g transform="translate(326 516) rotate(-3)">
          <rect width="98" height="27" rx="2" fill="#180B1A" stroke="#FF5BA7" strokeWidth="1.5" />
          <text x="49" y="18" fill="#FFD4E7" fontSize="7" textAnchor="middle">SPÄTVORSTELLUNG</text>
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
      <div className="kd-neon-noir__rain" />
    </div>
  );
}

export default NeonNoirOverlay;
