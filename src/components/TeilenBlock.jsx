import { useRef, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { FeldHinweis } from "./FeldHinweis.jsx";
import {
  BEREICHE, BEREICH_LABELS, bauePaket, parsePaket, analysierePaket,
  bauePaketUebernahme, ingestionPrompt,
} from "../lib/paket.js";
import { TYP_GRUPPEN } from "../lib/typen.js";

/* ================= TEILEN & TAUSCHEN (Phase A) =================
   Export des eigenen Bestands als kinodreieck-paket (Bereichs-Auswahl),
   Import fremder Pakete mit Vorschau + Nachfrage auf Bereichs-Ebene,
   Ingestion-Popup: Prompt für eine fremde KI, die gebunchte Listen im
   selben Format erzeugt. Eigenes wird beim Import NIE überschrieben. */

const h2Style = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", get color() { return T.wolfram; }, margin: "0 0 10px" };
const monoKlein = { fontFamily: "'Space Mono', monospace", fontSize: 11, get color() { return T.rauch; } };

/* ohneKopf: Kopfzeile weglassen, wenn der Titel außen an einer Klappe steht
   (DatenTab-Accordion, Etappe 2); der Mediathek-Einsatz behält den Kopf. */
export function TeilenBlock({ master, artikel, autorName, saveAutorName, uebernehmePaket, setErr, ohneKopf = false }) {
  const [exportWahl, setExportWahl] = useState(["filme", "serien", "musik", "sonstiges", "artikel"]);
  const [promptOffen, setPromptOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [analyse, setAnalyse] = useState(null);   // Vorschau nach dem Laden
  const [importWahl, setImportWahl] = useState([]); // gewählte Bereiche
  const [report, setReport] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const dateiRef = useRef(null);

  const anzahlIm = (b) => b === "artikel"
    ? (artikel || []).filter((a) => a.status === "freigegeben").length
    : (master || []).filter((f) => TYP_GRUPPEN[b].includes(f.typ || "film")).length;

  /* ---------- Export ---------- */
  const exportiere = () => {
    const bereiche = exportWahl.filter((b) => anzahlIm(b) > 0);
    if (!bereiche.length) { setErr("Nichts zu exportieren — kein gewählter Bereich hat Inhalte."); return; }
    const paket = bauePaket({ master, artikel, bereiche, autor: autorName });
    const blob = new Blob([JSON.stringify(paket, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kinodreieck_paket_" + (paket.autor.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "export") + "_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- Import: Datei/Text -> Vorschau ---------- */
  const ladePaketText = (text) => {
    setErr(""); setReport(null);
    try {
      const p = parsePaket(text);
      const a = analysierePaket(p, master || [], artikel || []);
      if (!a.bereiche.length) throw new Error("Paket enthält keine lesbaren Bereiche.");
      setAnalyse(a);
      setImportWahl(a.bereiche.filter((b) => b.neu > 0).map((b) => b.name));
      setPromptOffen(false);
    } catch (e) { setAnalyse(null); setErr("Paket-Import: " + e.message); }
  };
  const dateiGewaehlt = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => ladePaketText(String(r.result));
    r.readAsText(file);
    e.target.value = "";
  };

  /* ---------- Import: Übernahme ---------- */
  const uebernehme = () => {
    if (!analyse) return;
    // KD-007: Übernahme kann bei kaputten Fremd-Strukturen werfen — abfangen und
    // dem Nutzer zeigen statt uncaught in die Konsole laufen zu lassen.
    try {
      const { neueFilme, neueArtikel, report: rep } = bauePaketUebernahme(analyse, importWahl, master || [], artikel || []);
      if (!neueFilme.length && !neueArtikel.length) { setErr("Nichts übernommen — die gewählten Bereiche enthalten nur bereits Vorhandenes."); return; }
      uebernehmePaket({ neueFilme, neueArtikel });
      setReport({ ...rep, autor: analyse.autor, artikelDabei: neueArtikel.length > 0 });
      setAnalyse(null);
    } catch (e) {
      setErr("Paket-Übernahme fehlgeschlagen: " + (e && e.message ? e.message : String(e)));
    }
  };

  /* ---------- Prompt kopieren (Clipboard-API mit Fallback) ---------- */
  const kopierePrompt = async () => {
    const text = ingestionPrompt(autorName);
    try { await navigator.clipboard.writeText(text); setKopiert(true); }
    catch {
      const ta = document.getElementById("kd-ingestion-prompt");
      if (ta) { ta.select(); try { document.execCommand("copy"); setKopiert(true); } catch { setErr("Kopieren blockiert — Text im Feld manuell markieren und kopieren."); } }
    }
    setTimeout(() => setKopiert(false), 2500);
  };

  const toggle = (liste, setListe, wert) =>
    setListe(liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert]);

  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      {!ohneKopf && <h2 style={h2Style}>Teilen & Tauschen</h2>}
      <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
        Bewertungen und Blog-Artikel als Paket weitergeben oder fremde Pakete übernehmen.
        Übernommenes behält seinen Autor — deine eigenen Einträge werden nie überschrieben.
      </p>

      {/* Autor-Name (steht in jedem Export und im KI-Prompt) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ ...monoKlein, textTransform: "uppercase", letterSpacing: "0.06em" }}>Dein Autorname</span>
        <input value={autorName} onChange={(e) => saveAutorName(e.target.value)} placeholder="z.B. Max"
          style={{ ...inputStyle, width: 160 }} />
        <span style={monoKlein}>steht in jedem Export — so wissen andere, wessen Urteil sie lesen</span>
      </div>

      {/* ---- Export ---- */}
      <div style={{ borderTop: "1px solid " + T.saal, paddingTop: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {BEREICHE.map((b) => (
            <label key={b} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", opacity: anzahlIm(b) ? 1 : 0.45 }}>
              <input type="checkbox" checked={exportWahl.includes(b)} onChange={() => toggle(exportWahl, setExportWahl, b)} />
              {BEREICH_LABELS[b]} <span style={monoKlein}>({anzahlIm(b)})</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button style={btnStyle(true)} onClick={exportiere}>Paket exportieren (JSON)</button>
          <FeldHinweis feld="paket" />
          <label style={{ ...btnStyle(false), display: "inline-block", cursor: "pointer" }}>
            Paket importieren
            <input ref={dateiRef} type="file" accept=".json" style={{ display: "none" }} onChange={dateiGewaehlt} />
          </label>
        </div>
        <p style={{ ...monoKlein, margin: "8px 0 0" }}>
          Ein Paket enthält die kompletten Einträge der gewählten Bereiche — Bewertung,
          Kategorie, Begründung/Beschreibung, Genres, Tags. Privat bleiben: Notizen und
          Besitz (dvd/prime/apple). Beim Blog wandern nur freigegebene Artikel mit;
          Verweise verknüpft der Empfänger neu mit der eigenen Mediathek.
        </p>
        {/* Ersterfassung ist IMPORT-Werkzeug, kein Teilen — bewusst dezent (Feedback #1) */}
        <p style={{ ...monoKlein, margin: "10px 0 0" }}>
          Ersterfassung: du hast eine rohe Titelliste und noch keine Einträge?{" "}
          <button data-tour="ki-ingestion" onClick={() => { setPromptOffen(!promptOffen); setAnalyse(null); }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.wolfram, fontFamily: "'Space Mono', monospace", fontSize: 11, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Bestand per KI erfassen …
          </button>
          <FeldHinweis feld="ki_erfassung" />
        </p>
      </div>

      {/* ---- Ingestion-Popup: Prompt für die fremde KI ---- */}
      {promptOffen && (
        <div style={{ border: "1px solid " + T.wolfram, borderRadius: 6, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ ...h2Style, fontSize: 16, margin: "0 0 8px" }}>Vorstrukturierte Listen per KI</div>
          <p style={{ fontSize: 13, color: T.leinwandTief, margin: "0 0 8px", lineHeight: 1.6 }}>
            Diesen Prompt in einen beliebigen KI-Chat kopieren und deine Titel-Liste hinterherschicken.
            Die KI recherchiert Jahr und Genre, lässt dich einige Titel selbst bewerten, schätzt den Rest
            in deinem Ton — und liefert eine JSON-Datei, die du hier über <strong style={{ color: T.leinwand }}>Upload</strong> einspielst.
          </p>
          <textarea id="kd-ingestion-prompt" readOnly value={ingestionPrompt(autorName)} rows={9}
            onFocus={(e) => e.target.select()}
            style={{ ...inputStyle, width: "100%", maxWidth: "100%", minHeight: 240, maxHeight: "50vh", resize: "vertical", overflow: "auto", boxSizing: "border-box", fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button style={btnStyle(true)} onClick={kopierePrompt}>{kopiert ? "✓ Kopiert" : "Prompt kopieren"}</button>
            <button style={btnStyle(false)} onClick={() => dateiRef.current && dateiRef.current.click()}>Upload: Datei wählen</button>
            <button style={btnStyle(false)} onClick={() => setPromptOffen(false)}>Abbrechen</button>
          </div>
          {/* KI liefert einen Codeblock — direkt einfügen ist bequemer als Datei speichern */}
          <div style={{ marginTop: 10, borderTop: "1px solid " + T.saal, paddingTop: 10 }}>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={3}
              placeholder="… oder das JSON aus der KI-Antwort hier einfügen"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "'Space Mono', monospace", fontSize: 11 }} />
            <button style={{ ...btnStyle(false), marginTop: 6 }} disabled={!pasteText.trim()}
              onClick={() => { ladePaketText(pasteText); setPasteText(""); }}>
              Eingefügtes importieren
            </button>
          </div>
        </div>
      )}

      {/* ---- Import-Vorschau: erst schauen, dann übernehmen ---- */}
      {analyse && (
        <div style={{ border: "1px solid " + T.wolfram, borderRadius: 6, padding: "12px 14px", marginBottom: 6 }}>
          <div style={{ ...h2Style, fontSize: 16, margin: "0 0 6px" }}>Paket-Vorschau — noch wird nichts übernommen</div>
          <p style={{ ...monoKlein, margin: "0 0 10px" }}>
            Autor: <span style={{ color: T.wolfram }}>{analyse.autor}</span>
            {analyse.erstellt ? " · erstellt " + String(analyse.erstellt).slice(0, 10) : ""}
            {" · Quelle: " + (analyse.quelle === "ki-ingestion" ? "KI-Ingestion" : analyse.quelle === "kinodreieck-export" ? "Kinodreieck-Export" : analyse.quelle)}
          </p>
          {analyse.bereiche.map((b) => (
            <details key={b.name} style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 14, color: T.leinwand }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={importWahl.includes(b.name)} onChange={() => toggle(importWahl, setImportWahl, b.name)} disabled={b.neu === 0} />
                  <strong>{BEREICH_LABELS[b.name]}</strong>
                </label>
                {" "}<span style={monoKlein}>{b.neu} neu{b.vorhanden ? " · " + b.vorhanden + " schon vorhanden (bleiben deine)" : ""}</span>
              </summary>
              <div style={{ padding: "6px 0 4px 22px", maxHeight: 220, overflowY: "auto" }}>
                {b.eintraege.map((e, i) => (
                  <div key={i} style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "2px 0", color: e.status === "neu" ? T.leinwandTief : T.rauch }}>
                    {e.status === "neu" ? "+ " : "= "}{e.anzeige}{e.status === "vorhanden" ? " — übersprungen" : ""}
                  </div>
                ))}
              </div>
            </details>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button style={btnStyle(true)} onClick={uebernehme} disabled={!importWahl.length}>
              Auswahl übernehmen
            </button>
            <button style={btnStyle(false)} onClick={() => setAnalyse(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* ---- Abschluss-Report ---- */}
      {report && (
        <div style={{ background: "rgba(227,166,59,0.10)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "10px 14px", fontSize: 13, lineHeight: 1.7 }}>
          <strong style={{ color: T.wolfram }}>Übernommen von {report.autor}:</strong>{" "}
          {Object.entries(report.uebernommen).filter(([, n]) => n > 0).map(([b, n]) => BEREICH_LABELS[b] + " " + n).join(" · ") || "nichts"}
          {Object.values(report.uebersprungen).some((n) => n > 0) && (
            <> — übersprungen (schon vorhanden): {Object.entries(report.uebersprungen).filter(([, n]) => n > 0).map(([b, n]) => BEREICH_LABELS[b] + " " + n).join(" · ")}</>
          )}
          {report.artikelDabei && (
            <><br />Artikel stehen auf „wartet" — Freigabe wie gewohnt im Blog. Verweise: {report.verlinkt} verknüpft, {report.rotlinks} offen (Rotlinks heilen automatisch, sobald passende Einträge entstehen).</>
          )}
          <br /><span style={monoKlein}>Fremde Einträge erkennst du am Autor im Eintrag (bewertet von …). Export nicht vergessen — der Wächter oben erinnert dich.</span>
        </div>
      )}
    </div>
  );
}
