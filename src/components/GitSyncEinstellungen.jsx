import { useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { setTreiber } from "../lib/storage.js"; // KD-015: Git als aktiven Treiber setzen
import {
  getGitConfig, setGitConfig, isGitConfigured,
  connectionTest, syncPull, syncFlush, syncStatus,
  SYNC_MAP, resolveConflictPushLocal, resolveConflictUseRemote,
} from "../lib/gitDriver.js";

/* ================= Geräte-Sync (Git) =================
   Verbindet die App mit einem privaten Daten-Repo (GitHub Contents API).
   Repo-URL ist Konfiguration; der Token ist das einzige Geheimnis und liegt
   ausschließlich hier im Browser-Storage — nie in einer Datei, nie im Klartext-Log.
   Nach dem Verbinden lädt die App beim Start die Daten aus dem Repo (Pull) und
   committet jede Änderung zurück (Commit-on-change). */
/* ohneKopf: Kopfzeile weglassen, wenn der Titel außen an einer Klappe
   (Einstellungs-Accordion, Etappe 2) steht. */
export function GitSyncEinstellungen({ ohneKopf = false } = {}) {
  const cfg = getGitConfig();
  const [repo, setRepo] = useState(cfg.repo);
  const [branch, setBranch] = useState(cfg.branch);
  const [token, setToken] = useState(cfg.token);
  const [tokenSichtbar, setTokenSichtbar] = useState(false);
  const [status, setStatus] = useState(() => syncStatus());
  const [meldung, setMeldung] = useState(null); // {art:"ok"|"warn"|"err", text}
  const [busy, setBusy] = useState(false);

  const h2Style = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 6px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };
  const farbe = (art) => (art === "ok" ? T.leinwand : art === "warn" ? T.wolfram : T.gefahr);

  const speichern = () => { setGitConfig({ repo, token, branch }); setStatus(syncStatus()); };

  const testen = async () => {
    speichern();
    setBusy(true); setMeldung({ art: "warn", text: "Teste Verbindung …" });
    const r = await connectionTest();
    setBusy(false);
    if (r.ok) setMeldung({ art: "ok", text: `Verbunden ✓ ${r.full_name || ""} (privat: ${r.private ? "ja" : "nein"})` });
    else setMeldung({ art: "err", text: `Fehlgeschlagen: ${r.message || ("HTTP " + r.status)}` });
  };

  const verbindenNeuLaden = () => {
    speichern();
    if (!isGitConfigured()) { setMeldung({ art: "err", text: "Repo (owner/name) und Token nötig." }); return; }
    // KD-015: Git als aktiven Treiber setzen — sonst bliebe bei kd:treiber='supabase'
    // nach dem Reload weiterhin Supabase aktiv (main.jsx wählt Git nur bei t==='git'|null).
    setTreiber("git");
    // Pull passiert beim nächsten Start (main.jsx) — kontrolliert neu laden.
    setMeldung({ art: "warn", text: "Gespeichert. App wird neu geladen und synchronisiert …" });
    try { setTimeout(() => location.reload(), 400); } catch { /* */ }
  };

  const jetztSynchronisieren = async () => {
    speichern();
    if (!isGitConfigured()) { setMeldung({ art: "err", text: "Erst Repo + Token speichern." }); return; }
    setBusy(true); setMeldung({ art: "warn", text: "Lade aus dem Repo (Pull) …" });
    const r = await syncPull();
    setStatus(syncStatus());
    // Wurden Daten übernommen, MUSS neu geladen werden: sonst hält der React-State
    // noch die alten Werte und eine folgende Bearbeitung überschriebe den frischen
    // Stand mit veralteten Daten.
    if ((r.geladen || []).length > 0) {
      setMeldung({ art: "ok", text: `Pull ok — ${r.geladen.length} übernommen. App wird neu geladen …` });
      try { setTimeout(() => location.reload(), 500); } catch { /* */ }
      return;
    }
    setBusy(false);
    if (r.ok) setMeldung({ art: "ok", text: `Aktuell — nichts Neues im Repo (${r.angelegt.length} noch anzulegen).` });
    else setMeldung({ art: "warn", text: `Pull mit Problemen: ${r.fehler?.length || 0} Datei(en) fehlgeschlagen (siehe Status).` });
  };

  const ausstehendeSenden = async () => {
    setBusy(true); setMeldung({ art: "warn", text: "Sende ausstehende Änderungen …" });
    await syncFlush();
    setStatus(syncStatus()); setBusy(false);
    const s = syncStatus();
    setMeldung(s.pending.length ? { art: "warn", text: `${s.pending.length} weiterhin ausstehend.` } : { art: "ok", text: "Alles synchronisiert ✓" });
  };

  /* Konflikt bewusst auflösen — pro Datei, nie automatisch. */
  const dateiZuKey = (file) => Object.keys(SYNC_MAP).find((k) => SYNC_MAP[k] === file);
  const konfliktRemote = async (file) => {
    const key = dateiZuKey(file); if (!key) return;
    setBusy(true); setMeldung({ art: "warn", text: `Übernehme Remote-Stand für ${file} …` });
    const r = await resolveConflictUseRemote(key);
    setStatus(syncStatus());
    if (r.ok) {
      // Daten im Cache haben sich geändert → App muss neu laden, sonst hält der
      // React-State den alten Wert und die nächste Bearbeitung überschriebe ihn.
      setMeldung({ art: "ok", text: `${file}: Remote übernommen. App wird neu geladen …` });
      try { setTimeout(() => location.reload(), 500); } catch { /* */ }
      return;
    }
    setBusy(false);
    setMeldung({ art: "err", text: `${file}: Fehlgeschlagen — ${r.message || r.error || ("HTTP " + r.status)}` });
  };
  const konfliktLokal = async (file) => {
    const key = dateiZuKey(file); if (!key) return;
    setBusy(true); setMeldung({ art: "warn", text: `Pushe lokalen Stand für ${file} …` });
    const r = await resolveConflictPushLocal(key);
    setStatus(syncStatus()); setBusy(false);
    setMeldung(r && r.ok ? { art: "ok", text: `${file}: lokaler Stand gepusht ✓` }
      : { art: "err", text: `${file}: Push fehlgeschlagen — ${(r && (r.message || r.error)) || ""}` });
  };

  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      {!ohneKopf && <h2 style={h2Style}>Geräte-Sync (Git)</h2>}
      <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
        Synchronisiert deine Liste, Blogs, Pins &amp; Einstellungen über ein
        <strong style={{ color: T.leinwand }}> privates </strong> Daten-Repo — so sind alle Geräte auf demselben Stand.
        Der Token bleibt nur auf diesem Gerät und landet in keiner Datei.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...mono, textTransform: "uppercase" }}>Daten-Repo (owner/name)</span>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="deinname/kinodreieck-daten"
            autoCapitalize="off" autoCorrect="off" spellCheck={false} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...mono, textTransform: "uppercase" }}>Branch</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main"
            autoCapitalize="off" autoCorrect="off" spellCheck={false} style={{ ...inputStyle, width: 160 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...mono, textTransform: "uppercase" }}>Fine-grained Token (nur dieses Gerät)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* value ist IMMER der echte Token; die Maskierung leistet type="password"
                allein. Eine Punkte-Maske als value hätte beim Tippen die Punkte in
                den State übernommen und beim Speichern den Token zerstört. */}
            <input type={tokenSichtbar ? "text" : "password"} value={token}
              onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
            <button style={{ ...btnStyle(false), fontSize: 12, padding: "6px 10px" }}
              onClick={() => setTokenSichtbar((v) => !v)}>{tokenSichtbar ? "verbergen" : "zeigen"}</button>
          </div>
          <span style={mono}>Scope: nur das Daten-Repo · Contents: Read and write · mit Ablaufdatum.</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button style={btnStyle(false)} onClick={testen} disabled={busy}>Verbindung testen</button>
        <button style={btnStyle(true)} onClick={verbindenNeuLaden} disabled={busy}>Speichern &amp; verbinden</button>
        <button style={btnStyle(false)} onClick={jetztSynchronisieren} disabled={busy}>Jetzt synchronisieren</button>
        {status.pending.length > 0 && (
          <button style={{ ...btnStyle(false), borderColor: T.wolfram, color: T.wolfram }} onClick={ausstehendeSenden} disabled={busy}>
            Ausstehende senden ({status.pending.length})
          </button>
        )}
      </div>

      {meldung && (
        <p style={{ fontSize: 13, color: farbe(meldung.art), margin: "12px 0 0", lineHeight: 1.5, fontFamily: "'Space Mono', monospace" }}>
          {meldung.text}
        </p>
      )}

      {/* Sync-Status */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + T.saal, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={mono}>Status: {status.configured ? "konfiguriert" : "nicht konfiguriert"}</div>
        <div style={mono}>Letzter Pull: {status.lastPull ? new Date(status.lastPull).toLocaleString("de-AT") : "—"}</div>
        <div style={mono}>Letzter Commit: {status.lastCommit ? new Date(status.lastCommit).toLocaleString("de-AT") : "—"}</div>
        {status.pending.length > 0 && <div style={{ ...mono, color: T.wolfram }}>Ausstehend: {status.pending.filter((f) => !status.conflict.includes(f)).join(", ") || "—"}</div>}
        {(status.stale || []).length > 0 && <div style={{ ...mono, color: T.wolfram }}>Nicht aktuell (letzter Pull fehlgeschlagen): {status.stale.join(", ")}</div>}
        {status.conflict.length > 0 && (
          <div style={{ marginTop: 6, padding: "10px 12px", background: "rgba(217,106,90,0.10)", border: "1px solid " + T.gefahr, borderRadius: 6 }}>
            <div style={{ ...mono, color: T.gefahr, marginBottom: 6 }}>
              Konflikt: Datei wurde auf einem anderen Gerät geändert, während hier ein
              ungesyncter Stand liegt. Wähle pro Datei, welcher Stand gilt (der jeweils
              andere bleibt als Snapshot gesichert):
            </div>
            {status.conflict.map((f) => (
              <div key={f} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
                <span style={{ ...mono, color: T.leinwandTief, minWidth: 140 }}>{f}</span>
                <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }} disabled={busy}
                  onClick={() => konfliktRemote(f)}>Remote übernehmen</button>
                <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", borderColor: T.wolfram, color: T.wolfram }} disabled={busy}
                  onClick={() => konfliktLokal(f)}>Diesen Stand pushen</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
