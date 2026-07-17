import { useMemo } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { FeldHinweis } from "./FeldHinweis.jsx";
import quellenDefault from "../data/quellen_default.json";

/* ================= Streaming: Quellen, Katalog-Status, Refresh =================
   Aus dem Streaming-Tab in die Einstellungen verschoben — ein Ort für alle
   Konfiguration. Bekommt bekannt/entdecken + die Quellen-Auswahl als Props. */

const GRUPPEN_LABEL = { sub: "Abos (Subscription)", free: "Gratis (Free)", purchase: "Kauf & Leihe", tve: "TV-Anbieter", sonst: "Weitere" };

function download(dateiname, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = dateiname; a.click();
  URL.revokeObjectURL(url);
}

export function StreamingEinstellungen({ bekannt, entdecken, auswahl = [], toggleQuelle, heuristikAn, setHeuristikAn, datenGesperrt = false }) {
  const datenDa = !!(bekannt && bekannt.stand);
  const entdeckenDa = !!(entdecken && entdecken.stand);
  const stand = datenDa ? new Date(bekannt.stand) : null;
  const alterTage = stand ? (Date.now() - stand.getTime()) / 86400000 : null;

  const gruppen = useMemo(() => {
    const vq = (datenDa && bekannt.verfuegbare_quellen) || [];
    if (vq.length) {
      const g = {};
      for (const q of vq) {
        const typ = ["sub", "free", "purchase", "tve"].includes(q.typ) ? q.typ : "sonst";
        (g[typ] = g[typ] || []).push(q.name);
      }
      return Object.entries(g).map(([typ, quellen]) => ({
        name: GRUPPEN_LABEL[typ] || typ, typ, quellen: quellen.sort((a, b) => a.localeCompare(b)),
        warnung: typ === "purchase" ? quellenDefault.gruppen.find((x) => x.typ === "purchase")?.warnung : undefined,
      }));
    }
    return quellenDefault.gruppen;
  }, [bekannt, datenDa]);

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };

  if (datenGesperrt) return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      <h2 style={h2}>Streaming gesperrt</h2>
      <p style={{ fontSize: 13, color: T.rauch, margin: 0, lineHeight: 1.6 }}>
        Anbieterlisten und Kataloge werden in Clean erst nach <code style={{ color: T.wolfram }}>Installation-Mac.command</code> oder <code style={{ color: T.wolfram }}>Installation-Windows.bat</code> freigeschaltet. Demo darf die beigepackten Daten ohne Installation verwenden.
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div data-tour="streaming-quellen" style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <h2 style={h2}>Streaming-Quellen ({auswahl.length} gewählt)</h2>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.5 }}>
          Nur angehakte Quellen werden beim nächsten Katalog-Lauf abgerufen (jede Quelle kostet ~1 Credit pro 250 Titel).
          Häkchen wirken sofort als Anzeigefilter im Streaming-Tab. Danach: <strong style={{ color: T.leinwand }}>Config exportieren</strong> und die Datei
          {" "}<code style={{ color: T.wolfram }}>streaming_config.json</code> im System-Ordner ersetzen.
          {" "}Nach Phase 0 erscheint hier die vollständige Live-Liste aller AT-Quellen.
        </p>
        {gruppen.map((g) => (
          <details key={g.name} open={g.typ === "sub"} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, letterSpacing: "0.05em", textTransform: "uppercase", color: T.leinwandTief, padding: "4px 0" }}>
              {g.name} ({g.quellen.filter((q) => auswahl.includes(q)).length}/{g.quellen.length})
            </summary>
            {g.warnung && <div style={{ fontSize: 12, color: T.gefahr, margin: "4px 0 6px" }}>{g.warnung}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "2px 14px", padding: "4px 0 8px" }}>
              {g.quellen.map((q) => (
                <label key={q} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={auswahl.includes(q)} onChange={() => toggleQuelle(q)} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
        <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 0 4px", fontSize: 14, cursor: "pointer", borderTop: "1px solid " + T.saal, marginTop: 8 }}>
          <input type="checkbox" checked={heuristikAn} onChange={() => setHeuristikAn(!heuristikAn)} />
          Heuristik-Relevanz im nächsten Lauf berechnen (abschalten ist folgenlos)
        </label>
        <button style={{ ...btnStyle(true), marginTop: 10 }}
          onClick={() => download("streaming_config.json", {
            quellen: auswahl,
            quellen_haeufig: ["Netflix", "Disney+", "Prime Video", "HBO Max"].filter((q) => auswahl.includes(q)),
            min_tage_voll: 25,
            min_tage_haeufig: 2,
            heuristik: heuristikAn,
          })}>
          Config exportieren (streaming_config.json)
        </button>
        <FeldHinweis feld="config_export" />
        <p style={{ fontSize: 12, color: T.rauch, margin: "8px 0 0", lineHeight: 1.5 }}>
          Rhythmus: 1. des Monats Voll-Lauf über alle gewählten Quellen; Mo/Mi/Fr 13:00 nur die großen
          Rotations-Kataloge (Zeitplan: <code>com.kinodreieck.streaming.plist</code>, siehe Anleitung).
        </p>
      </div>

      <div data-tour="streaming-status" style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <h2 style={h2}>Katalog-Status</h2>
        {datenDa ? (
          <p style={{ fontSize: 14, color: T.leinwandTief, lineHeight: 1.8, margin: 0 }}>
            Stand: <strong>{stand.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })}</strong>
            {" · "}Quellen im Katalog: {(bekannt.dienste || []).join(", ")}
            {" · "}Titel: {bekannt.titel.length} bekannt / {entdeckenDa ? entdecken.titel.length : 0} entdecken
            <br />Quota: <strong>{bekannt.quota_nach_lauf ?? "?"} / 2.500</strong> (Watchmode-Credits = API-Requests pro Monat)
            {" · "}{alterTage <= 30 ? Math.max(0, Math.ceil(30 - alterTage)) + " Tage bis zum Monats-Refresh" : <strong style={{ color: T.gefahr }}>Refresh überfällig ({Math.floor(alterTage)} Tage alt)</strong>}
          </p>
        ) : (
          <p style={{ fontSize: 14, color: T.rauch, margin: 0 }}>Noch kein Katalog geladen.</p>
        )}
      </div>

      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <h2 style={h2}>Refresh (manuell)</h2>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
          <strong style={{ color: T.gefahr }}>Verbraucht Credits.</strong> Der Job läuft höchstens 1× pro 30 Tage
          (früher nur mit <code>--force</code>); kein Auto-Fetch aus der App. Im Terminal im System-Ordner
          (<code>cd KinoFilm/Programmdateien/System</code>):
        </p>
        <pre style={{ background: T.saal, borderRadius: 4, padding: "10px 12px", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwand, overflowX: "auto", margin: 0 }}>
{`node fetch_streaming_katalog.js --force
node build_streaming_ansicht.js
npm run build:single   # frische Kinodreieck.html`}</pre>
      </div>
    </div>
  );
}
