import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { catalogService } from "../services/catalog.js";
import { errorText, ERROR_CODES } from "../services/errors.js";

export function KatalogZugang({ onFertig, onAbbrechen, zwingend = false }) {
  const cfg = catalogService.getConnection();
  const [url, setUrl] = useState(cfg.url);
  const [key, setKey] = useState(cfg.key);
  const [sichtbar, setSichtbar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");
  /* "ok" | "warnung" | "fehler" — der Ton der Rückmeldung wird gesetzt, nicht
     aus dem Text geraten (früher: meldung.includes("fehl")). */
  const [art, setArt] = useState("ok");
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
    catalogService.setConnection({ url, key });
    setBusy(true); setArt("ok"); setMeldung("Verbindung wird geprüft …");
    try {
      /* Der Test prüft nicht mehr nur das (für alle lesbare) Manifest, sondern
         auch die Zeile, die diese Sitzung wirklich braucht. Sonst stünde hier
         „Verbunden ✓", während Kino und Streaming leer bleiben. */
      const r = await catalogService.testConnection();
      const a = r.asset;
      if (a && !a.ok && a.code === ERROR_CODES.INVALID_KEY) {
        /* Der häufigste Einrichtungsfehler überhaupt — und der einzige, den der
           Tester selbst beheben kann. Er darf sich nicht als „Anmeldung nötig"
           tarnen, sonst sucht man an der falschen Stelle. Und der Dialog bleibt
           offen: mit abgelehntem Schlüssel ist nichts eingerichtet. */
        setArt("fehler");
        setMeldung("Der Zugangsschlüssel wird nicht akzeptiert. Prüfe den mitgeschickten Leseschlüssel (vollständig kopiert, keine Leerzeichen).");
        return;
      }
      if (a && !a.ok && a.code === ERROR_CODES.NO_DEMO_DATA) {
        setArt("warnung");
        setMeldung("Verbindung steht ✓ — für den öffentlichen Zugang sind allerdings noch keine Beispieldaten veröffentlicht. Mit einer Anmeldung (Settings → Konto) siehst du das laufende Programm.");
      } else if (a && !a.ok && a.anmeldungNoetig) {
        setArt("warnung");
        setMeldung("Verbindung steht ✓ — für das laufende Kinoprogramm ist zusätzlich eine Anmeldung nötig (Settings → Konto).");
      } else if (a && !a.ok) {
        setArt("warnung");
        setMeldung("Verbindung steht ✓ — das Kinoprogramm ist gerade nicht abrufbar: " + errorText(a.fehler));
      } else if (a && a.abgelaufen) {
        setArt("warnung");
        setMeldung("Verbindung steht ✓ — der hinterlegte Demo-Schnappschuss ist allerdings abgelaufen.");
      } else {
        setArt("ok");
        setMeldung(a && a.variante === "demo" ? "Verbunden ✓ — Demo-Programm ist abrufbar." : "Verbunden ✓ — Programm ist abrufbar.");
      }
      onFertig?.(r.manifest);
    } catch (error) {
      setArt("fehler");
      setMeldung("Verbindung fehlgeschlagen: " + errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 12000, background: "rgba(23,21,26,.92)", display: "flex", alignItems: "center", justifyContent: "center",
      /* Safe-Area wie die CSS-Overlays (Muster .kd-help-layer) — JS-Portale bekamen es bisher nicht (Befund B5 #4). */
      padding: "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))" }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Programmdaten verbinden"
        style={{ width: "100%", maxWidth: 500, boxSizing: "border-box", background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 9, padding: "24px", boxShadow: "0 12px 48px rgba(0,0,0,.65)" }}>
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
        {meldung && <p style={{ color: art === "fehler" ? T.gefahr : T.wolfram, fontFamily: "'Space Mono', monospace", fontSize: 12, margin: "12px 0 0", lineHeight: 1.5 }}>{meldung}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button style={btnStyle(true)} disabled={busy || !key.trim() || !url.trim()} onClick={verbinden}>{busy ? "Prüfe …" : "Verbinden & laden"}</button>
          {!zwingend && onAbbrechen && <button style={btnStyle(false)} disabled={busy} onClick={onAbbrechen}>Abbrechen</button>}
        </div>
      </div>
    </div>, document.body
  );
}
