import { useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { restoreBackup, restoreRueckgaengig } from "../lib/restore.js";
import { isGitConfigured } from "../lib/gitDriver.js";

/* ================= Backup wiederherstellen (Datenmigration) =================
   Spielt ein Gesamt-Backup der alten App in die neue ein — einmaliger Schritt,
   BEVOR Git verbunden wird. Ersetzt die lokalen Daten (kein Merge), sichert den
   vorherigen Stand als Snapshot (rückgängig machbar) und zeigt einen Zählbericht
   (der Abgleich gegen die alte App = Checkpoint B der Migration). */
/* ohneKopf: Kopfzeile weglassen, wenn der Titel außen an einer Klappe
   (Einstellungs-Accordion, Etappe 2) steht. */
export function RestoreImport({ ohneKopf = false } = {}) {
  const [bericht, setBericht] = useState(null);
  const [meldung, setMeldung] = useState(null); // {art:"ok"|"warn"|"err", text}
  const [busy, setBusy] = useState(false);

  const h2Style = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 6px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch };
  const farbe = (art) => (art === "ok" ? T.leinwand : art === "warn" ? T.wolfram : T.gefahr);

  const verarbeite = async (text) => {
    setBusy(true); setMeldung(null); setBericht(null);
    let backup;
    try { backup = JSON.parse(text); }
    catch { setBusy(false); setMeldung({ art: "err", text: "Keine gültige JSON-Datei." }); return; }
    const gitHinweis = isGitConfigured()
      ? "\n\nACHTUNG: Git-Sync ist bereits verbunden — der wiederhergestellte Stand wird beim nächsten Sync als neue Version ins Daten-Repo committet. Für die Erst-Migration gilt: Backup einspielen, DANN Git verbinden."
      : "";
    // KD-008: fail-closed Snapshot-Zusage · KD-009: Wortlaut (vorhandene Felder ersetzen, im Backup fehlende bleiben)
    const ok = window.confirm("Backup wiederherstellen?\n\nVorhandene Felder des Backups ERSETZEN die entsprechenden lokalen Daten dieser App (Filmliste, Blogs, Pins, Merkliste, Vokabular, Einstellungen, Entdecken-Status, Autor-Name, Must-Watch-Liste); im Backup fehlende Bereiche bleiben unverändert. Der vorherige Stand wird als Snapshot gesichert und ist rückgängig machbar — lässt sich der Snapshot nicht sichern, wird abgebrochen und nichts überschrieben." + gitHinweis);
    if (!ok) { setBusy(false); return; }
    try {
      const r = await restoreBackup(backup);
      setBericht(r.bericht);
      const teile = [];
      if (r.warnung) teile.push(r.warnung);
      teile.push("Wiederhergestellt. Zum Anwenden die App neu laden.");
      if (r.dbHinweis) teile.push(r.dbHinweis);
      setMeldung({ art: (r.warnung || r.dbWarnung) ? "warn" : "ok", text: teile.join(" ") });
    } catch (e) { setMeldung({ art: "err", text: "Fehlgeschlagen: " + e.message }); }
    setBusy(false);
  };

  const aufDatei = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => verarbeite(String(rd.result || ""));
    rd.onerror = () => setMeldung({ art: "err", text: "Datei nicht lesbar." });
    rd.readAsText(f);
  };

  const rueckgaengig = async () => {
    setBusy(true);
    try { await restoreRueckgaengig(); setMeldung({ art: "ok", text: "Rückgängig gemacht. Zum Anwenden neu laden." }); setBericht(null); }
    catch (e) { setMeldung({ art: "err", text: e.message }); }
    setBusy(false);
  };

  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      {!ohneKopf && <h2 style={h2Style}>Backup wiederherstellen</h2>}
      <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
        Einmaliger Umzug: das <strong style={{ color: T.leinwand }}>Gesamt-Backup der alten App</strong> hier
        einspielen — Filmliste, Blogs, Pins, Merkliste, Vokabular, Einstellungen, Entdecken-Status und
        {/* KD-009: Wortlaut — Restore ist preserve-missing (fehlende Backup-Bereiche bleiben), nicht „alles ersetzen". Verhalten in restore.js unverändert. */}
        Autor-Name in einem Schritt. <strong>Vorhandene Felder des Backups ersetzen die lokalen; im Backup fehlende
        Bereiche bleiben unverändert.</strong> Der vorherige Stand wird gesichert. Danach neu laden und die Zählstände
        prüfen, <em>bevor</em> du Git verbindest.
        Deine Abo-Auswahl (Streaming-Dienste) ist im alten Backup nicht enthalten — die setzt du einmal manuell.
      </p>
      <input type="file" accept=".json,application/json" onChange={aufDatei} disabled={busy}
        style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwand }} />

      {meldung && (
        <p style={{ fontSize: 13, color: farbe(meldung.art), margin: "12px 0 0", lineHeight: 1.5, fontFamily: "'Space Mono', monospace" }}>{meldung.text}</p>
      )}

      {bericht && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + T.saal }}>
          <div style={{ ...mono, textTransform: "uppercase", marginBottom: 6 }}>Zählbericht</div>
          {bericht.map((b) => (
            <div key={b.topf} style={{ display: "flex", justifyContent: "space-between", gap: 10, ...mono, padding: "2px 0", color: /ÜBERSPRUNGEN/.test(b.status) ? T.wolfram : T.leinwandTief }}>
              <span>{b.topf}</span>
              <span>{/übernommen/.test(b.status) ? b.count + " · " : ""}{b.status}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button style={btnStyle(true)} onClick={() => { try { location.reload(); } catch { /* */ } }}>Neu laden &amp; anwenden</button>
            <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }} onClick={rueckgaengig} disabled={busy}>Rückgängig</button>
          </div>
        </div>
      )}
    </div>
  );
}
