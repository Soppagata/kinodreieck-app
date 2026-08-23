import { T, btnStyle } from "../lib/tokens.js";
import { FILMWISSEN_STATUS } from "../lib/filmwissen.js";

const SICHERHEIT = {
  sehr_niedrig: "sehr unsicher",
  niedrig: "unsicher",
  mittel: "mittlere Sicherheit",
  hoch: "hohe Sicherheit",
};

const mono = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export function FilmwissenBereich({
  phase = "idle",
  daten = null,
  fehler = null,
  rechercheLaeuft = false,
  rechercheMoeglich = false,
  onRecherchieren,
}) {
  const status = daten?.status || null;
  return (
    <section aria-label="Belegtes Filmwissen">
      <div style={{ ...mono, color: T.warum, marginBottom: 7 }}>Belegtes Filmwissen</div>

      {phase === "laedt" && (
        <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>Gemeinsamer Bericht wird geladen …</p>
      )}
      {fehler && (
        <p role="alert" style={{ margin: "0 0 8px", color: T.gefahr, fontSize: 13 }}>{fehler}</p>
      )}
      {daten?.displayText && ["partial", "degraded"].includes(daten.responseMode) && (
        <p role="status" style={{ margin: "0 0 8px", color: T.rauch, fontSize: 12, lineHeight: 1.5 }}>
          <strong style={{ color: T.leinwand }}>
            {daten.responseMode === "degraded" ? "Unverbindlicher Hinweis/Entwurf: " : "Teilweise bereinigt: "}
          </strong>
          {daten.displayText}
        </p>
      )}

      {status === FILMWISSEN_STATUS.BELEGT && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong style={{ color: T.warum, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 25 }}>
              WARUM {daten.warum.wert}/5
            </strong>
            <span style={{ ...mono, color: T.rauch }}>{SICHERHEIT[daten.warum.sicherheit]}</span>
          </div>
          <p style={{ margin: "6px 0 8px", color: T.leinwand, fontSize: 14, lineHeight: 1.55 }}>
            {daten.warum.kurztext}
          </p>
          <p style={{ margin: "0 0 8px", color: T.rauch, fontSize: 11 }}>
            Gemeinsame Einordnung · Stand {new Date(daten.version.stand).toLocaleDateString("de-AT")}
            {" · "}Version {daten.version.nr}
          </p>
          <details>
            <summary style={{ cursor: "pointer", color: T.wolfram, fontSize: 12 }}>
              {daten.fundstellen.length} {daten.fundstellen.length === 1 ? "Fundstelle" : "Fundstellen"} ansehen
            </summary>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {daten.fundstellen.map((fundstelle) => (
                <div key={fundstelle.quelle + "|" + fundstelle.url}
                  style={{ borderLeft: "2px solid " + T.wolfram, paddingLeft: 9 }}>
                  <a href={fundstelle.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: T.leinwand, fontSize: 13 }}>
                    {fundstelle.titel} ↗
                  </a>
                  <div style={{ color: T.rauch, fontSize: 11 }}>{fundstelle.attribution}</div>
                  {fundstelle.kernaussagen.map((aussage, index) => (
                    <div key={index} style={{ color: T.rauch, fontSize: 12, marginTop: 3 }}>• {aussage}</div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {status === FILMWISSEN_STATUS.NICHT_BELEGT && (
        <p style={{ margin: 0, color: T.rauch, fontSize: 13, lineHeight: 1.5 }}>
          Noch keine ausreichend belegte gemeinsame WARUM-Einordnung. Das bedeutet nicht,
          dass der Film wenig relevant ist — nur, dass der feste Quellenweg es derzeit nicht belegt.
        </p>
      )}
      {status === FILMWISSEN_STATUS.ENTWURF && (
        <>
          <p style={{ margin: "0 0 8px", color: T.rauch, fontSize: 13, lineHeight: 1.5 }}>
            Diese einzeln geprüften Bausteine sind nur eine Vorschau. Das Paket ist nicht
            als „belegt“ veröffentlicht und wurde nicht als Filmwissen gespeichert.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {daten.claims.map((claim) => (
              <div key={claim.quelle + "|" + claim.url + "|" + claim.aussage}
                style={{ borderLeft: "2px solid " + T.wolfram, paddingLeft: 9 }}>
                <div style={{ color: T.leinwand, fontSize: 13 }}>{claim.aussage}</div>
                <a href={claim.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: T.rauch, fontSize: 11 }}>
                  {claim.titel} · {claim.quelle} ↗
                </a>
              </div>
            ))}
          </div>
        </>
      )}
      {status === FILMWISSEN_STATUS.NICHT_ZUORDENBAR && (
        <>
          <p style={{ margin: "0 0 8px", color: T.rauch, fontSize: 13, lineHeight: 1.5 }}>
            {rechercheMoeglich
              ? "Die Filmkennung ist eindeutig, aber noch keinem gemeinsamen Werkbericht zugeordnet."
              : "Für diesen Eintrag fehlt noch eine eindeutige IMDb-, TMDB- oder Wikidata-Kennung."}
          </p>
          {rechercheMoeglich && (
            <>
              <button style={{ ...btnStyle(false), fontSize: 12 }} disabled={rechercheLaeuft}
                onClick={onRecherchieren}>
                {rechercheLaeuft ? "Bericht wird erstellt …" : "Recherchebericht erstellen"}
              </button>
              <div style={{ ...mono, color: T.rauch, marginTop: 7, textTransform: "none", letterSpacing: 0 }}>
                Ein ausdrücklicher Sonnet-Aufruf · höchstens 6 US-Cent · keine automatische Wiederholung
              </div>
            </>
          )}
        </>
      )}
      {status === FILMWISSEN_STATUS.GESPERRT && (
        <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>Der belegte Quellenweg ist derzeit nicht verfügbar.</p>
      )}
      {status === FILMWISSEN_STATUS.VERALTET && (
        <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>Der Kontostand hat gewechselt. Öffne die Karte erneut.</p>
      )}

      {status === FILMWISSEN_STATUS.CACHE_MISS && (
        <>
          <p style={{ margin: "0 0 8px", color: T.rauch, fontSize: 13, lineHeight: 1.5 }}>
            {rechercheMoeglich
              ? "Für diesen Film gibt es noch keinen gemeinsamen Bericht."
              : "Für diesen Eintrag fehlt noch eine eindeutige IMDb-, TMDB- oder Wikidata-Kennung."}
          </p>
          {rechercheMoeglich && (
            <>
              <button style={{ ...btnStyle(false), fontSize: 12 }} disabled={rechercheLaeuft}
                onClick={onRecherchieren}>
                {rechercheLaeuft ? "Bericht wird erstellt …" : "Recherchebericht erstellen"}
              </button>
              <div style={{ ...mono, color: T.rauch, marginTop: 7, textTransform: "none", letterSpacing: 0 }}>
                Ein ausdrücklicher Sonnet-Aufruf · höchstens 6 US-Cent · keine automatische Wiederholung
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
