import React from "react";

/* Rein visuelle Moment-Egg-Komponente. Datum, Frequenz und Mounting bleiben
   außerhalb; die Sterne sind absichtlich deterministisch statt zufällig. */
const STERNE = Array.from({ length: 86 }, (_, i) => ({
  x: (i * 83 + 17) % 1000,
  y: (i * 197 + 43) % 700,
  r: i % 13 === 0 ? 2.1 : i % 5 === 0 ? 1.45 : 0.8,
  o: 0.34 + ((i * 7) % 6) * 0.1,
}));

const SPRUNG = Array.from({ length: 34 }, (_, i) => {
  const winkel = (i / 34) * Math.PI * 2;
  const innen = 34 + (i % 4) * 8;
  const aussen = 260 + (i % 7) * 36;
  return {
    x1: 500 + Math.cos(winkel) * innen,
    y1: 350 + Math.sin(winkel) * innen,
    x2: 500 + Math.cos(winkel) * aussen,
    y2: 350 + Math.sin(winkel) * aussen,
  };
});

function Sternfeld() {
  return (
    <svg className="kd-crawl-stars" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {STERNE.map((stern, i) => (
        <circle key={i} cx={stern.x} cy={stern.y} r={stern.r} opacity={stern.o} />
      ))}
    </svg>
  );
}

function Hyperraum() {
  return (
    <svg className="kd-crawl-hyperspace" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {SPRUNG.map((linie, i) => (
        <line key={i} x1={linie.x1} y1={linie.y1} x2={linie.x2} y2={linie.y2} />
      ))}
    </svg>
  );
}

function MatchText({ match }) {
  const titel = match?.titel || "Unbekannter Film";
  const jahr = match?.jahr ? ` (${match.jahr})` : "";
  const kinos = Array.isArray(match?.kinos) ? match.kinos.filter(Boolean) : [];
  const zeiten = Array.isArray(match?.zeiten) ? match.zeiten.filter(Boolean) : [];
  const vorstellung = [kinos.join(" · "), zeiten.join(" / ")].filter(Boolean).join(" — ");

  return (
    <p className="kd-crawl-match">
      <strong>{titel}{jahr}</strong>
      {vorstellung && <><br /><span>{vorstellung}</span></>}
    </p>
  );
}

export function Crawl({ matches, episode, onSkip, reduced }) {
  const treffer = Array.isArray(matches) ? matches : [];
  const ueberspringen = () => {
    if (typeof onSkip === "function") onSkip();
  };
  const tastatur = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ueberspringen();
    }
  };

  return (
    <div
      className={`kd-crawl${reduced ? " kd-crawl-reduced" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Opening Crawl überspringen"
      onClick={ueberspringen}
      onKeyDown={tastatur}
    >
      <Sternfeld />
      <Hyperraum />
      <div className="kd-crawl-nebel" aria-hidden="true" />
      <svg className="kd-crawl-mond" viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <radialGradient id="kd-crawl-kugel" cx="34%" cy="30%" r="72%">
            <stop offset="0" stopColor="#dce4ef" /><stop offset=".58" stopColor="#8793a5" /><stop offset="1" stopColor="#202737" />
          </radialGradient>
        </defs>
        <circle cx="110" cy="110" r="102" fill="url(#kd-crawl-kugel)" />
        <path d="M12 119 H208 M22 83 H198 M32 153 H188 M110 9 V211 M68 18 Q92 110 66 202 M153 18 Q128 110 155 202" />
        <ellipse cx="146" cy="78" rx="32" ry="23" transform="rotate(-24 146 78)" />
        <circle cx="146" cy="78" r="6" />
      </svg>
      <div className="kd-crawl-horizont" aria-hidden="true" />
      <div className="kd-crawl-rahmen" aria-hidden="true">
        <span>MAY THE FOURTH</span><i>WIEN · LICHTSPIELHÄUSER · 04/05</i><b>◇</b>
      </div>

      <div className="kd-crawl-stage">
        <div className="kd-crawl-plane">
          <div className="kd-crawl-copy">
            <p className="kd-crawl-episode">EPISODE {episode || "CDXII"}</p>
            <h2>DEIN KINOABEND</h2>
            <p className="kd-crawl-intro">
              In den Lichtspielhäusern der Stadt beginnt ein neuer Kinoabend.
              Die Projektoren laufen, die Säle warten – und diese Vorstellungen
              haben heute deine Auswahl erreicht.
            </p>
            {treffer.length > 0 ? (
              <div className="kd-crawl-matches">
                {treffer.map((match, i) => <MatchText key={`${match?.titel || "film"}-${i}`} match={match} />)}
              </div>
            ) : (
              <p className="kd-crawl-leer">Heute hat die Macht noch keine Vorstellung offenbart.</p>
            )}
          </div>
        </div>
      </div>

      <span className="kd-crawl-skip" aria-hidden="true">ANTIPPEN ZUM ÜBERSPRINGEN</span>
    </div>
  );
}
