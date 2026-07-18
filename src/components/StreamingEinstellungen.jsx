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

export function StreamingEinstellungen({ bekannt, entdecken, auswahl = [], toggleQuelle, heuristikAn, setHeuristikAn, resetTag = null, setResetTag, datenGesperrt = false }) {
  const datenDa = !!(bekannt && bekannt.stand);
  const entdeckenDa = !!(entdecken && entdecken.stand);
  const stand = datenDa ? new Date(bekannt.stand) : null;
  const alterTage = stand ? (Date.now() - stand.getTime()) / 86400000 : null;

  /* Nächster Watchmode-Credits-Reset. Der frühere Countdown „30 − Alter(stand)"
     war falsch: stand wird bei JEDEM Mo/Mi/Fr-Rotationslauf neu gesetzt, der
     Zähler sprang also ständig auf ~30 zurück. Wahrheitskette jetzt:
     1) Feld `naechster_reset` aus dem Katalog-Lauf (schreibt die Pipeline),
     2) sonst aus dem konfigurierten Reset-Tag (Abrechnungstag des Accounts)
        deterministisch berechnet, 3) sonst ehrlich „unbekannt". */
  const resetDatum = (() => {
    if (datenDa && bekannt.naechster_reset) {
      const d = new Date(bekannt.naechster_reset);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d;
    }
    const tag = Number(resetTag);
    if (Number.isInteger(tag) && tag >= 1 && tag <= 28) {
      const jetzt = new Date();
      const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), tag);
      if (d.getTime() <= jetzt.getTime()) d.setMonth(d.getMonth() + 1);
      return d;
    }
    return null;
  })();
  const resetInTagen = resetDatum ? Math.ceil((resetDatum.getTime() - Date.now()) / 86400000) : null;

  const gruppen = useMemo(() => {
    /* Demo-Snapshots (eingebettete Beispieldaten) dürfen die echte AT-Quellenliste
       NICHT verdrängen — sonst schrumpft die Abo-Auswahl auf die 4 Testquellen. */
    const vq = (datenDa && !bekannt.demo && bekannt.verfuegbare_quellen) || [];
    let basis;
    if (vq.length) {
      const g = {};
      for (const q of vq) {
        const typ = ["sub", "free", "purchase", "tve"].includes(q.typ) ? q.typ : "sonst";
        (g[typ] = g[typ] || []).push(q.name);
      }
      basis = Object.entries(g).map(([typ, quellen]) => ({
        name: GRUPPEN_LABEL[typ] || typ, typ, quellen: quellen.sort((a, b) => a.localeCompare(b)),
        warnung: typ === "purchase" ? quellenDefault.gruppen.find((x) => x.typ === "purchase")?.warnung : undefined,
      }));
    } else basis = quellenDefault.gruppen;
    /* Union-Garantie: Jede aktiv gewählte Quelle muss sichtbar und abwählbar sein,
       auch wenn Katalog/Startliste sie (noch) nicht kennen. */
    const bekannteNamen = new Set(basis.flatMap((g) => g.quellen));
    const fehlend = auswahl.filter((q) => !bekannteNamen.has(q));
    return fehlend.length ? [...basis, { name: "Deine Auswahl (nicht in der Liste)", typ: "auswahl", quellen: fehlend }] : basis;
  }, [bekannt, datenDa, auswahl]);

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
          <details key={g.name} open={g.typ === "sub" || g.typ === "auswahl"} style={{ marginBottom: 8 }}>
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
            ...(Number.isInteger(Number(resetTag)) && resetTag >= 1 && resetTag <= 28 ? { reset_tag: Number(resetTag) } : {}),
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
            {bekannt.demo && <><strong style={{ color: T.wolfram }}>Demo-Beispieldaten</strong> — der echte Katalog kommt mit dem ersten Watchmode-Lauf.<br /></>}
            Stand: <strong>{stand.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })}</strong>
            {" · "}Quellen im Katalog: {(bekannt.dienste || []).join(", ")}
            {" · "}Titel: {bekannt.titel.length} bekannt / {entdeckenDa ? entdecken.titel.length : 0} entdecken
            <br />Credits verbraucht (Stand letzter Lauf): <strong>{bekannt.quota_nach_lauf ?? "?"}{bekannt.quota_limit ? ` / ${bekannt.quota_limit}` : ""}</strong> (Watchmode-Credits pro Monat)
            {" · "}{resetDatum
              ? <>Credits-Reset: <strong>{resetDatum.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })}</strong> (in {resetInTagen} {resetInTagen === 1 ? "Tag" : "Tagen"})</>
              : <span style={{ color: T.wolfram }}>Credits-Reset: unbekannt — Reset-Tag unten setzen</span>}
            {alterTage > 35 && <><br /><strong style={{ color: T.gefahr }}>Katalog ist {Math.floor(alterTage)} Tage alt — Refresh fällig.</strong></>}
          </p>
        ) : (
          <p style={{ fontSize: 14, color: T.rauch, margin: 0 }}>Noch kein Katalog geladen.</p>
        )}
        {setResetTag && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid " + T.saal, fontSize: 13, color: T.leinwandTief }}>
            Credits-Reset-Tag (1–28):
            <input type="number" min={1} max={28} value={resetTag ?? ""} placeholder="—"
              onChange={(e) => {
                const roh = e.target.value;
                if (roh === "") { setResetTag(null); return; }
                const n = Math.round(Number(roh));
                if (Number.isInteger(n)) setResetTag(Math.max(1, Math.min(28, n)));
              }}
              style={{ width: 64, background: T.saal, color: T.leinwand, border: "1px solid " + T.rauch, borderRadius: 4, padding: "5px 8px", fontFamily: "'Space Mono', monospace", fontSize: 13 }} />
            <span style={{ fontSize: 12, color: T.rauch }}>
              Tag im Monat, an dem Watchmode die Credits zurücksetzt (Abrechnungstag laut Account). Liefert der Katalog-Lauf selbst ein Reset-Datum, hat das Vorrang.
            </span>
          </label>
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
