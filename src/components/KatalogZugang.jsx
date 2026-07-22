import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { getKatalogZugang, setKatalogZugang, testeKatalogZugang } from "../lib/katalog.js";
import { setSupabaseConfig } from "../lib/supabaseDriver.js";

export function KatalogZugang({ onFertig, onAbbrechen, zwingend = false }) {
  const cfg = getKatalogZugang();
  const [url, setUrl] = useState(cfg.url);
  const [key, setKey] = useState(cfg.key);
  const [sichtbar, setSichtbar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");
  const dialog = useRef(null);

  useEffect(() => {
    const vorher = document.activeElement;
    dialog.current?.querySelector("input")?.focus();
    const keydown = (e) => {
      if (e.key === "Escape" && !zwingend && onAbbrechen) { e.preventDefault(); onAbbrechen(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.removeEventListener("keydown", keydown, true); vorher?.focus?.(); };
  }, [onAbbrechen, zwingend]);

  const verbinden = async () => {
    setKatalogZugang({ url, key });
    /* Dieselbe reine Lesekonfiguration speist Demo- und Shared-Blog-Reads. Owner
       und Sync-Schlüssel bleiben unberührt; der Geräte-Sync wird nicht aktiviert. */
    setSupabaseConfig({ url, anon: key });
    setBusy(true); setMeldung("Verbindung wird geprüft …");
    const r = await testeKatalogZugang();
    setBusy(false);
    if (!r.ok) { setMeldung("Verbindung fehlgeschlagen: " + r.message); return; }
    setMeldung("Verbunden ✓");
    onFertig?.(r.manifest);
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 12000, background: "rgba(23,21,26,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Programmdaten verbinden"
        style={{ width: "100%", maxWidth: 500, background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 9, padding: "24px", boxShadow: "0 12px 48px rgba(0,0,0,.65)" }}>
        <h2 style={{ margin: "0 0 8px", color: T.wolfram, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 25, letterSpacing: ".05em", textTransform: "uppercase" }}>Programmdaten verbinden</h2>
        <p style={{ margin: "0 0 16px", color: T.leinwandTief, fontSize: 14, lineHeight: 1.6 }}>
          Der Zugang lädt das gemeinsame Wiener Kinoprogramm und den vorbereiteten Streamingkatalog. Im Demo-Modus kommen zusätzlich Max’ Beispieldaten dazu. Der Schlüssel wird nur in diesem Browser gespeichert.
        </p>
        {!cfg.url && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            <span style={{ color: T.rauch, fontFamily: "'Space Mono', monospace", fontSize: 11, textTransform: "uppercase" }}>Supabase-Projekt-URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…supabase.co" style={inputStyle} autoCapitalize="off" spellCheck={false} />
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ color: T.rauch, fontFamily: "'Space Mono', monospace", fontSize: 11, textTransform: "uppercase" }}>Mitgeschickter Leseschlüssel</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input type={sichtbar ? "text" : "password"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_…" style={{ ...inputStyle, flex: 1, minWidth: 0 }} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <button style={{ ...btnStyle(false), padding: "7px 10px" }} onClick={() => setSichtbar((v) => !v)}>{sichtbar ? "Verbergen" : "Zeigen"}</button>
          </div>
        </label>
        {meldung && <p style={{ color: meldung.includes("fehl") ? T.gefahr : T.wolfram, fontFamily: "'Space Mono', monospace", fontSize: 12, margin: "12px 0 0" }}>{meldung}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button style={btnStyle(true)} disabled={busy || !key.trim() || !url.trim()} onClick={verbinden}>{busy ? "Prüfe …" : "Verbinden & laden"}</button>
          {!zwingend && onAbbrechen && <button style={btnStyle(false)} disabled={busy} onClick={onAbbrechen}>Abbrechen</button>}
        </div>
      </div>
    </div>, document.body
  );
}
