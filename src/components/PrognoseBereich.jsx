import { T, btnStyle } from "../lib/tokens.js";
import { bewertungskategorieLabel } from "../lib/kategorien.js";
import {
  lesePrognose, passungsBand, prognoseIstVeraltet,
} from "../lib/prognose.js";
import { FilmwissenBereich } from "./FilmwissenBereich.jsx";
import { runtimeConfig } from "../config/runtime.js";

const mono = { fontFamily: "'Space Grotesk', sans-serif", fontSize: "calc(12px * var(--kd-schriftfaktor, 1))", color: T.rauch };
const SICHERHEIT_LABEL = {
  sehr_niedrig: "sehr unsicher",
  niedrig: "unsicher",
  mittel: "mittlere Sicherheit",
  hoch: "hohe Sicherheit",
};
const STATUS_LABEL = {
  offen: "noch nicht bestätigt",
  angenommen: "von dir angenommen",
  korrigiert: "von dir korrigiert",
  verworfen: "von dir verworfen",
};

function Achse({ name, wert, farbe }) {
  return (
    <div style={{ minWidth: 75 }}>
      <div style={{ ...mono, color: farbe, textTransform: "uppercase" }}>{name}</div>
      <div style={{ color: T.leinwand, fontSize: 17, fontWeight: 700 }}>
        {wert == null ? "—" : `${wert} / 5`}
      </div>
    </div>
  );
}

function PrognoseMeldung({ meldung }) {
  if (meldung?.art === "hinweis" && typeof meldung.text === "string" && meldung.text) {
    return (
      <span role="status" style={{ color: T.wolfram, fontSize: 12, lineHeight: 1.5 }}>
        <strong>KI-Hinweis (unverbindlich):</strong> {meldung.text}
      </span>
    );
  }
  return typeof meldung === "string" && meldung
    ? <span role="alert" style={{ color: T.gefahr, fontSize: 12 }}>{meldung}</span>
    : null;
}

export function PrognoseBereich({
  film,
  laeuft = false,
  fehler = null,
  erstellenMoeglich = true,
  sperrgrund = null,
  aktuelleProfilVersion = null,
  onErstellen,
  onAnnehmen,
  onUebernehmen,
  onKorrigieren,
  onVerwerfen,
  uebernehmenLabel = "Als Bewertung übernehmen",
  filmwissen = null,
  config = runtimeConfig,
}) {
  const gelesen = lesePrognose(film);
  if (!gelesen.ok) {
    return (
      <div role="alert" style={{ borderLeft: `3px solid ${T.gefahr}`, paddingLeft: 10, color: T.rauch, fontSize: 12 }}>
        Die gespeicherte KI-Bewertung ist nicht lesbar und wird nicht als Bewertung angezeigt.
      </div>
    );
  }
  const prognose = gelesen.prognose;
  if (!prognose) {
    return (
      <section className="kd-prognose kd-ki-bewertung" aria-label={`KI-Bewertung für ${film?.titel || "Eintrag"}`}>
        <div className="kd-ki-bewertung-kopf">
          <strong>KI-Bewertung</strong>
          <span>Persönliche Einschätzung mit Quellenprüfung für WARUM.</span>
        </div>
        {filmwissen && (
          <FilmwissenBereich {...filmwissen} eingebettet zeigeRechercheAktion={false} />
        )}
        <div className="kd-prognose-start">
          {onErstellen && (
            <button style={btnStyle(false)} disabled={laeuft || !erstellenMoeglich} onClick={onErstellen}
              title={!erstellenMoeglich ? (sperrgrund || "KI-Bewertung derzeit nicht möglich") : "Erstellt eine unverbindliche persönliche KI-Bewertung"}>
              {laeuft ? "KI-Bewertung wird erstellt …" : "KI-Bewertung erstellen"}
            </button>
          )}
          <span style={{ ...mono, lineHeight: 1.45 }}>
            WIE, WAS und Passung sind persönlich geschätzt. Ohne belegte Quellenbasis bleibt WARUM klar als vorläufig markiert.
          </span>
          {!erstellenMoeglich && sperrgrund && <span style={{ color: T.wolfram, fontSize: 12 }}>{sperrgrund}</span>}
          <PrognoseMeldung meldung={fehler} />
        </div>
      </section>
    );
  }

  const e = prognose.ergebnis;
  const band = passungsBand(e.passung);
  const veraltet = prognoseIstVeraltet(prognose, aktuelleProfilVersion);
  return (
    <section className="kd-prognose kd-ki-bewertung" aria-label={`KI-Bewertung für ${film?.titel || "Eintrag"}`}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.saal}`, borderRadius: "var(--kd-radius-karte)", padding: "16px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: T.leinwand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: "calc(22px * var(--kd-schriftfaktor, 1))", fontWeight: 600, lineHeight: 1.2 }}>KI-Bewertung</strong>
        <span style={{ ...mono }}>{STATUS_LABEL[prognose.status]}</span>
      </div>

      <p style={{ margin: 0, color: T.rauch, fontSize: 12 }}>
        WIE, WAS und Passung sind persönliche KI-Einschätzungen. Filmwissen prüft, ob WARUM quellenbasiert belegt werden kann.
      </p>

      {filmwissen && (
        <FilmwissenBereich {...filmwissen} eingebettet zeigeRechercheAktion={false} />
      )}

      <div style={{ color: T.leinwand, fontSize: 16 }}>
        Persönliche Passung: <strong>{band?.label || "nicht bestimmbar"}</strong>
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        <Achse name="WIE" wert={e.achsen.wie} farbe={T.wie} />
        <Achse name="WAS" wert={e.achsen.was} farbe={T.was} />
        <Achse name="WARUM" wert={e.achsen.warum} farbe={T.warum} />
      </div>
      <p style={{ margin: 0, color: T.rauch, fontSize: 12 }}>
        {e.achsen.warum == null
          ? "Für WARUM liegt kein sicher belegbarer Wert vor; die Quellenlage reicht derzeit nicht aus."
          : prognose.warumHerkunft === "filmwissen"
            ? "WARUM übernimmt die belegte gemeinsame Einordnung aus dem Filmwissen; die persönliche KI verbindet sie mit deinem Geschmacksprofil."
            : "WARUM ist vorläufig aus Filmkontext und deinem Geschmacksprofil geschätzt; ein belegter gemeinsamer Quellenwert liegt nicht vor."}
        {" "}Die KI-Bewertung ist ohne dein bewusstes Speichern keine echte Bewertung.
      </p>
      {e.begruendung && (
        <div style={{ color: T.leinwandTief, fontSize: 13, lineHeight: 1.55 }}>{e.begruendung}</div>
      )}
      {(e.kategorie_vorschlag || e.sicherheit) && (
        <div style={{ ...mono }}>
          {e.kategorie_vorschlag && (
            <>Kategorie-Vorschlag: <strong style={{ color: T.leinwand }}>{bewertungskategorieLabel(e.kategorie_vorschlag)}</strong></>
          )}
          {e.kategorie_vorschlag && e.sicherheit ? " · " : ""}
          {e.sicherheit ? `KI-Vorschlag · ${SICHERHEIT_LABEL[e.sicherheit]}` : ""}
        </div>
      )}

      {e.verwendete_signale.length > 0 && (
        <div>
          <div style={{ ...mono, marginBottom: 5 }}>Verwendete Profilsignale</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {e.verwendete_signale.map((signal) => (
              <span key={signal.id} style={{ ...mono, border: `1px solid ${T.saal}`, borderRadius: 12, padding: "3px 7px" }}>
                {signal.richtung === "zieht_an" ? "+" : signal.richtung === "stoesst_ab" ? "−" : "±"} {signal.wert}
              </span>
            ))}
          </div>
        </div>
      )}

      {config.appEnvironment !== "production" ? (
        <div style={{ ...mono, opacity: 0.8 }}>
          Profil {prognose.profilVersion} · Modell {prognose.modell}
          {prognose.warumHerkunft === "filmwissen" ? ` · Filmwissen ${prognose.filmwissenVersionId}` : ""}
          {veraltet ? " · mit älterem Profil erstellt" : ""}
        </div>
      ) : veraltet ? (
        <div style={{ ...mono, opacity: 0.8 }}>Mit einem älteren Geschmacksprofil erstellt.</div>
      ) : null}
      <PrognoseMeldung meldung={fehler} />

      {(prognose.status === "offen" || prognose.status === "angenommen") && (
        <div className="kd-prognose-aktionen">
          {onUebernehmen && <button style={btnStyle(true)} onClick={onUebernehmen}>{uebernehmenLabel}</button>}
          {prognose.status === "offen" && onAnnehmen && <button style={btnStyle(false)} onClick={onAnnehmen}>Nur Vorschlag bestätigen</button>}
          {onVerwerfen && <button style={{ ...btnStyle(false), color: T.gefahr, borderColor: T.gefahr }} onClick={onVerwerfen}>Verwerfen</button>}
        </div>
      )}
      {onErstellen && (
        <div className="kd-prognose-neuberechnen">
          <button style={btnStyle(false)} disabled={laeuft || !erstellenMoeglich} onClick={onErstellen}
            title="Fragt vor dem Ersetzen noch einmal nach">
            {laeuft ? "KI-Bewertung wird neu erstellt …" : "KI-Bewertung neu berechnen"}
          </button>
          <span style={mono}>Ersetzt den Vorschlag nach Bestätigung.</span>
        </div>
      )}
    </section>
  );
}
