import { T, btnStyle } from "../lib/tokens.js";
import { bewertungskategorieLabel } from "../lib/kategorien.js";
import {
  lesePrognose, passungsBand, prognoseIstVeraltet,
} from "../lib/prognose.js";

const mono = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 11,
  color: T.rauch,
};
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

function kostenText(kosten) {
  if (!Number.isFinite(kosten)) return null;
  if (kosten > 0 && kosten < 1) return "< 1 US-Cent";
  return `${kosten.toLocaleString("de-AT", { maximumFractionDigits: 2 })} US-Cent`;
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
  onKorrigieren,
  onVerwerfen,
}) {
  const gelesen = lesePrognose(film);
  if (!gelesen.ok) {
    return (
      <div role="alert" style={{ borderLeft: `3px solid ${T.gefahr}`, paddingLeft: 10, color: T.rauch, fontSize: 12 }}>
        Die gespeicherte KI-Prognose ist nicht lesbar und wird nicht als Bewertung angezeigt.
      </div>
    );
  }
  const prognose = gelesen.prognose;
  if (!prognose) {
    return (
      <div style={{ display: "grid", gap: 7, justifyItems: "start" }}>
        <button style={btnStyle(false)} disabled={laeuft || !erstellenMoeglich} onClick={onErstellen}
          title={!erstellenMoeglich ? (sperrgrund || "Prognose derzeit nicht möglich") : "Startet genau einen kostenpflichtigen KI-Aufruf"}>
          {laeuft ? "KI-Prognose wird erstellt …" : "KI-Prognose erstellen"}
        </button>
        <span style={{ ...mono, lineHeight: 1.45 }}>
          Auf Wunsch · genau ein kostenpflichtiger KI-Aufruf · keine Websuche
        </span>
        {!erstellenMoeglich && sperrgrund && <span style={{ color: T.wolfram, fontSize: 12 }}>{sperrgrund}</span>}
        {fehler && <span role="alert" style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</span>}
      </div>
    );
  }

  const e = prognose.ergebnis;
  const band = passungsBand(e.passung);
  const veraltet = prognoseIstVeraltet(prognose, aktuelleProfilVersion);
  const kosten = kostenText(prognose.verbrauch.kostenUsdCent);
  return (
    <section aria-label={`KI-Prognose für ${film?.titel || "Eintrag"}`}
      style={{ border: `1px solid ${T.saal}`, borderRadius: 6, padding: "12px 14px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: T.wolfram, letterSpacing: "0.05em" }}>KI-PROGNOSE</strong>
        <span style={{ ...mono }}>{STATUS_LABEL[prognose.status]}</span>
      </div>

      <div style={{ color: T.leinwand, fontSize: 16 }}>
        Persönliche Passung: <strong>{band?.label || "nicht bestimmbar"}</strong>
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        <Achse name="WIE" wert={e.achsen.wie} farbe={T.wie} />
        <Achse name="WAS" wert={e.achsen.was} farbe={T.was} />
        <Achse name="WARUM" wert={e.achsen.warum} farbe={T.warum} />
      </div>
      <p style={{ margin: 0, color: T.rauch, fontSize: 12 }}>
        WARUM ist eine vorläufige Sonnet-Schätzung aus Filmkontext und deinem Geschmacksprofil
        {" "}– kein belegter gemeinsamer Filmwissen-Wert und keine echte Bewertung.
      </p>
      <div style={{ color: T.leinwandTief, fontSize: 13, lineHeight: 1.55 }}>{e.begruendung}</div>
      <div style={{ ...mono }}>
        Kategorie-Vorschlag: <strong style={{ color: T.leinwand }}>{e.kategorie_vorschlag ? bewertungskategorieLabel(e.kategorie_vorschlag) : "keiner"}</strong>
        {" "}· KI-Vorschlag · {SICHERHEIT_LABEL[e.sicherheit]}
      </div>

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

      <div style={{ ...mono, opacity: 0.8 }}>
        Profil {prognose.profilVersion} · Modell {prognose.modell}
        {kosten ? ` · ${kosten}` : ""}
        {veraltet ? " · mit älterem Profil erstellt" : ""}
      </div>
      {fehler && <span role="alert" style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</span>}

      {(prognose.status === "offen" || prognose.status === "angenommen") && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {prognose.status === "offen" && <button style={btnStyle(true)} onClick={onAnnehmen}>Annehmen</button>}
          <button style={btnStyle(false)} onClick={onKorrigieren}>Echt bewerten / korrigieren</button>
          <button style={{ ...btnStyle(false), color: T.gefahr, borderColor: T.gefahr }} onClick={onVerwerfen}>Verwerfen</button>
        </div>
      )}
      {onErstellen && (
        <div style={{ display: "grid", gap: 5, justifyItems: "start" }}>
          <button style={btnStyle(false)} disabled={laeuft || !erstellenMoeglich} onClick={onErstellen}
            title="Fragt vor dem Ersetzen noch einmal nach und startet dann genau einen kostenpflichtigen KI-Aufruf">
            {laeuft ? "KI-Prognose wird neu erstellt …" : "Prognose neu berechnen"}
          </button>
          <span style={mono}>Ersetzt diese Prognose nach Bestätigung · kostenpflichtig · keine Websuche</span>
        </div>
      )}
    </section>
  );
}
