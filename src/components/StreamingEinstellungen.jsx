import { useMemo, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { FeldHinweis } from "./FeldHinweis.jsx";
import { Klappe } from "./ui.jsx";
import quellenDefault from "../data/quellen_default.json";

/* ================= Streaming: Quellen, Katalog-Status, Refresh =================
   Aus dem Streaming-Tab in die Einstellungen verschoben — ein Ort für alle
   Konfiguration. Bekommt bekannt/entdecken + die Quellen-Auswahl als Props. */

const GRUPPEN_LABEL = { sub: "Abos (Subscription)", free: "Gratis (Free)", purchase: "Kauf & Leihe", tve: "TV-Anbieter", sonst: "Weitere" };
/* Kurzform des Gruppen-Typs für die Suchtreffer-Zeilen (390px-tauglich). */
const TYP_KURZ = { sub: "Abo", free: "Gratis", purchase: "Kauf/Leihe", tve: "TV", sonst: "Weitere", auswahl: "Deine Auswahl" };

/* Lange Quellen-Namen fürs Handy kürzen — NUR das Chip-Label. Der volle Name bleibt
   im title (Tooltip) und als Toggle-/Speicher-Wert unverändert. */
function kurzQuelle(n) {
  return String(n || "")
    .replace(/\s*\((?:via|über)\s+amazon\s+prime\)/i, " (Prime)")
    .replace(/^Crunchyroll\s+Premium\b/i, "Crunchyroll")
    .trim();
}

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

  /* Mobil-taugliche Quellen-Auswahl (Etappe 1): statt ~40 Checkbox-Zeilen
     ein Suchfeld + kompakte Angehakt-Liste. Nicht angehakte Quellen erscheinen
     NUR als Suchtreffer. Suchtext ist reiner UI-State, wird NICHT persistiert. */
  const [quellenSuche, setQuellenSuche] = useState("");
  const quellenIndex = useMemo(() => {
    const m = new Map(); // Name -> Gruppen-Typ (erste Gruppe gewinnt)
    for (const g of gruppen) for (const q of g.quellen) if (!m.has(q)) m.set(q, g.typ);
    return m;
  }, [gruppen]);
  const suchTreffer = useMemo(() => {
    const s = quellenSuche.trim().toLowerCase();
    if (!s) return [];
    return [...quellenIndex.entries()]
      .filter(([name]) => name.toLowerCase().includes(s) && !auswahl.includes(name))
      .map(([name, typ]) => ({ name, typ }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [quellenSuche, quellenIndex, auswahl]);
  const purchaseWarnung = quellenDefault.gruppen.find((x) => x.typ === "purchase")?.warnung;

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };

  if (datenGesperrt) return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      <h2 style={h2}>Streaming gesperrt</h2>
      <p style={{ fontSize: 13, color: T.rauch, margin: 0, lineHeight: 1.6 }}>
        Für diese Startart sind die vorbereiteten Streaming-Daten nicht freigegeben. Die Demo kann den beigepackten Katalog verwenden; die PWA selbst lädt keine Daten live von Watchmode.
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Etappe 2: Kästen als Accordions (Klappe). Streaming-Quellen startet
          offen, Status/Refresh zu. data-tour wandert an die Klappe (Tour-Anker). */}
      <Klappe titel={`Streaming-Quellen (${auswahl.length} gewählt)`} offen tour="streaming-quellen">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.5 }}>
          Häkchen wirken sofort als Anzeigefilter im Streaming-Tab. Für den nächsten externen
          Katalog-Lauf zusätzlich <strong style={{ color: T.leinwand }}>Config exportieren</strong> und als
          {" "}<code style={{ color: T.wolfram }}>KinoFilm/Programmdateien/System/streaming_config.json</code> im separaten Datenordner ablegen.
          Erst der nächste Lauf übernimmt diese Auswahl beim Abruf (jede Quelle kostet etwa 1 Credit pro 250 Titel).
        </p>
        {/* Suchfeld: einzige Tür zu den nicht angehakten Quellen (~40 Namen). */}
        <input value={quellenSuche} onChange={(e) => setQuellenSuche(e.target.value)}
          placeholder="Quelle suchen (z. B. Hayu, MUBI, Joyn) …"
          style={{ width: "100%", boxSizing: "border-box", background: T.saal, color: T.leinwand, border: "1px solid " + T.rauch, borderRadius: 4, padding: "10px 12px", fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }} />
        {quellenSuche.trim() !== "" && (
          <div style={{ marginBottom: 10 }}>
            {suchTreffer.length === 0 && (
              <div style={{ fontSize: 12, color: T.rauch, padding: "2px 0 4px" }}>Keine weitere Quelle gefunden (schon gewählt oder nicht in der Liste).</div>
            )}
            {suchTreffer.some((t) => t.typ === "purchase") && purchaseWarnung && (
              <div style={{ fontSize: 12, color: T.gefahr, margin: "2px 0 6px" }}>{purchaseWarnung}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {suchTreffer.map(({ name, typ }) => (
                <button key={name} onClick={() => toggleQuelle(name)} title={"„" + name + "“ zur Auswahl hinzufügen"}
                  style={{ display: "flex", gap: 8, alignItems: "center", textAlign: "left", background: "transparent", color: T.leinwand, border: "1px solid " + T.saal, borderRadius: 4, padding: "9px 10px", cursor: "pointer", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ {kurzQuelle(name)}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: typ === "purchase" ? T.gefahr : T.rauch, flexShrink: 0 }}>{TYP_KURZ[typ] || typ}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Angehakte Quellen: immer sichtbar, per × abwählbar. Union-Garantie:
            gerendert wird direkt aus `auswahl` — auch Namen außerhalb der
            Katalog-/Startliste bleiben damit sichtbar und abwählbar. */}
        {/* Angehakte Quellen als ruhige dunkle Liste (Max 2026-07-19): kein goldener
            Block mehr — goldenes ✓ zeigt auf einen Blick „gewählt", × wählt ab. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
          {auswahl.length === 0 && (
            <span style={{ fontSize: 12, color: T.rauch, padding: "2px 0" }}>Keine Quelle gewählt — der Streaming-Tab zeigt dann alle Dienste.</span>
          )}
          {[...auswahl].sort((a, b) => a.localeCompare(b)).map((q) => (
            <button key={q} onClick={() => toggleQuelle(q)} title={"„" + q + "“ abwählen"}
              style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, background: T.saal, border: "1px solid " + T.saalHoch, borderRadius: 4, padding: "7px 10px", cursor: "pointer" }}>
              <span aria-hidden="true" style={{ color: T.wolfram, flexShrink: 0, fontSize: 13 }}>✓</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kurzQuelle(q)}</span>
              <span aria-hidden="true" style={{ color: T.rauch, flexShrink: 0 }}>×</span>
            </button>
          ))}
        </div>
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
          Externer Rhythmus: 1. des Monats Voll-Lauf über alle gewählten Quellen; Mo/Mi/Fr 13:00 nur die großen
          Rotations-Kataloge (Zeitplan: <code>com.kinodreieck.streaming.plist</code> im Datenordner).
        </p>
      </div>
      </Klappe>

      <Klappe titel="Katalog-Status" tour="streaming-status">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
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
      </Klappe>

      <Klappe titel="Refresh (manuell)">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
          <strong style={{ color: T.gefahr }}>Verbraucht Watchmode-Credits.</strong> Die PWA führt
          keine Live-Abfragen aus. Starte den geschützten Ablauf nur bei Bedarf im Terminal im
          separaten Datenordner (<code>cd KinoFilm/Programmdateien/System</code>):
        </p>
        <pre style={{ background: T.saal, borderRadius: 4, padding: "10px 12px", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwand, overflowX: "auto", margin: 0 }}>
{`node streaming_auto.mjs`}</pre>
        <p style={{ fontSize: 12, color: T.rauch, margin: "8px 0 0", lineHeight: 1.5 }}>
          Der Job erzeugt die Kataloge und ruft anschließend <code>liefere_an_pwa.mjs</code> auf.
          Kein <code>--force</code> für Tests verwenden.
        </p>
      </div>
      </Klappe>
    </div>
  );
}
