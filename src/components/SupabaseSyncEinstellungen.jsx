import { useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { Klappe } from "./ui.jsx";
import { getTreiber, setTreiber } from "../lib/storage.js";
import {
  getSupabaseConfig, setSupabaseConfig, isSupabaseConfigured,
  connectionTest, syncPull, syncFlush, syncStatus,
  resolveConflictPushLocal, resolveConflictUseRemote,
} from "../lib/supabaseDriver.js";

/* ================= Geräte-Sync (Supabase) =================
   Verbindet die App mit einer managed Postgres-DB (Supabase, PostgREST). Login-frei:
   Projekt-URL + öffentlicher anon-Key sind Konfiguration; der Sync-Schlüssel ist das
   einzige Geheimnis und liegt ausschließlich hier im Browser-Storage — nie in einer
   Zeile, nie im Build, nie im Klartext-Log. Nach dem Aktivieren zieht die App beim
   Start die Owner-Zeilen (Pull) und schreibt jede Änderung zurück (Commit-on-change).
   Der Git-Treiber bleibt als umschaltbarer Fallback erhalten.

   Ansicht (Max 2026-07-19): VERBUNDEN -> schlanke „✓ Verbunden"-Zeile + Bearbeiten (Popup)
   / Trennen; NICHT VERBUNDEN -> Ersteinrichtung (Owner + Schlüssel, Rest unter „Erweitert"). */
export function SupabaseSyncEinstellungen({ ohneKopf = false } = {}) {
  const cfg = getSupabaseConfig();
  const [url, setUrl] = useState(cfg.url);
  const [anon, setAnon] = useState(cfg.anon);
  const [owner, setOwner] = useState(cfg.owner);
  const [skey, setSkey] = useState(cfg.key);
  const [keySichtbar, setKeySichtbar] = useState(false);
  const [status, setStatus] = useState(() => syncStatus());
  const [meldung, setMeldung] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const aktiv = getTreiber() === "supabase";
  const verbunden = aktiv && isSupabaseConfigured();

  const h2Style = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 6px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };
  const farbe = (art) => (art === "ok" ? T.leinwand : art === "warn" ? T.wolfram : T.gefahr);

  const speichern = () => { setSupabaseConfig({ url, anon, key: skey, owner }); setStatus(syncStatus()); };

  const testen = async () => {
    speichern();
    setBusy(true); setMeldung({ art: "warn", text: "Teste Verbindung …" });
    const r = await connectionTest();
    setBusy(false);
    if (r.ok) setMeldung({ art: "ok", text: "Verbunden ✓ (Projekt erreichbar, anon-Key gültig)" });
    else setMeldung({ art: "err", text: `Fehlgeschlagen: ${r.message || ("HTTP " + r.status)}` });
  };

  /* Speichern + Supabase als aktiven Treiber setzen, dann kontrolliert neu laden
     (der Pull passiert beim nächsten Start in main.jsx). */
  const aktivieren = () => {
    speichern();
    if (!isSupabaseConfigured()) { setMeldung({ art: "err", text: "URL, anon-Key, Owner und Sync-Schlüssel nötig." }); return; }
    setTreiber("supabase");
    setMeldung({ art: "warn", text: "Gespeichert & aktiviert. App wird neu geladen und synchronisiert …" });
    try { setTimeout(() => location.reload(), 400); } catch { /* */ }
  };

  /* Gerät trennen: Sync-Schlüssel + Owner löschen (nicht mehr verbunden), Treiber zurück
     auf lokal. URL/anon bleiben als Default für eine spätere Neu-Einrichtung. */
  const trennen = () => {
    if (typeof confirm === "function" && !confirm("Dieses Gerät von der Datenbank trennen? Deine lokalen Daten bleiben; zum Wiederverbinden brauchst du den Sync-Schlüssel erneut.")) return;
    setSupabaseConfig({ key: "", owner: "" });
    setTreiber(null);
    setStatus(syncStatus());
    setMeldung({ art: "warn", text: "Getrennt. App wird neu geladen …" });
    try { setTimeout(() => location.reload(), 400); } catch { /* */ }
  };

  const jetztSynchronisieren = async () => {
    speichern();
    if (!isSupabaseConfigured()) { setMeldung({ art: "err", text: "Erst URL, anon-Key, Owner und Sync-Schlüssel speichern." }); return; }
    setBusy(true); setMeldung({ art: "warn", text: "Lade aus der Datenbank (Pull) …" });
    const r = await syncPull();
    setStatus(syncStatus());
    if ((r.geladen || []).length > 0) {
      setMeldung({ art: "ok", text: `Pull ok — ${r.geladen.length} übernommen. App wird neu geladen …` });
      try { setTimeout(() => location.reload(), 500); } catch { /* */ }
      return;
    }
    setBusy(false);
    if (r.ok) setMeldung({ art: "ok", text: `Aktuell — nichts Neues (${(r.angelegt || []).length} noch anzulegen).` });
    else setMeldung({ art: "warn", text: `Pull mit Problemen: ${(r.fehler || []).length} Schlüssel fehlgeschlagen (siehe Status).` });
  };

  const ausstehendeSenden = async () => {
    setBusy(true); setMeldung({ art: "warn", text: "Sende ausstehende Änderungen …" });
    await syncFlush();
    setStatus(syncStatus()); setBusy(false);
    const s = syncStatus();
    setMeldung(s.pending.length ? { art: "warn", text: `${s.pending.length} weiterhin ausstehend.` } : { art: "ok", text: "Alles synchronisiert ✓" });
  };

  /* Konflikt bewusst auflösen — pro Schlüssel, nie automatisch. */
  const konfliktRemote = async (key) => {
    setBusy(true); setMeldung({ art: "warn", text: `Übernehme Remote-Stand für ${key} …` });
    const r = await resolveConflictUseRemote(key);
    setStatus(syncStatus());
    if (r.ok) {
      setMeldung({ art: "ok", text: `${key}: Remote übernommen. App wird neu geladen …` });
      try { setTimeout(() => location.reload(), 500); } catch { /* */ }
      return;
    }
    setBusy(false);
    setMeldung({ art: "err", text: `${key}: Fehlgeschlagen — ${r.message || r.error || ("HTTP " + r.status)}` });
  };
  const konfliktLokal = async (key) => {
    setBusy(true); setMeldung({ art: "warn", text: `Pushe lokalen Stand für ${key} …` });
    const r = await resolveConflictPushLocal(key);
    setStatus(syncStatus()); setBusy(false);
    setMeldung(r && r.ok ? { art: "ok", text: `${key}: lokaler Stand gepusht ✓` }
      : { art: "err", text: `${key}: Push fehlgeschlagen — ${(r && (r.message || r.error)) || ""}` });
  };

  /* Eingabefelder (Owner + Sync-Schlüssel oben, URL/anon unter „Erweitert") — von der
     Ersteinrichtung UND dem Bearbeiten-Popup genutzt. */
  const formFelder = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ ...mono, textTransform: "uppercase" }}>Owner (deine Kennung)</span>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="z.B. max"
          autoCapitalize="off" autoCorrect="off" spellCheck={false} style={{ ...inputStyle, width: 200 }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ ...mono, textTransform: "uppercase" }}>Sync-Schlüssel (nur dieses Gerät)</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* value ist IMMER der echte Schlüssel; die Maskierung leistet type="password"
              allein (Lernpunkt aus dem Git-Token-Feld: Punkte-Maske als value zerstört ihn). */}
          <input type={keySichtbar ? "text" : "password"} value={skey}
            onChange={(e) => setSkey(e.target.value)} placeholder="dein geheimer Sync-Schlüssel"
            autoCapitalize="off" autoCorrect="off" spellCheck={false} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
          <button style={{ ...btnStyle(false), fontSize: 12, padding: "6px 10px" }}
            onClick={() => setKeySichtbar((v) => !v)}>{keySichtbar ? "verbergen" : "zeigen"}</button>
        </div>
        <span style={mono}>Wird nur als Header gesendet, nie gespeichert oder committet. Auf jedem Gerät gleich eintragen.</span>
      </label>
      <Klappe titel="Erweitert · Projekt-URL & anon-Key">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <span style={mono}>Vorbelegt — nur bei Projektwechsel oder Ersteinrichtung ändern.</span>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ ...mono, textTransform: "uppercase" }}>Projekt-URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ ...mono, textTransform: "uppercase" }}>anon / publishable Key (öffentlich)</span>
            <input value={anon} onChange={(e) => setAnon(e.target.value)} placeholder="sb_publishable_…"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} style={inputStyle} />
          </label>
        </div>
      </Klappe>
    </div>
  );

  const statusBlock = (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + T.saal, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={mono}>Letzter Pull: {status.lastPull ? new Date(status.lastPull).toLocaleString("de-AT") : "—"}</div>
      <div style={mono}>Letzter Commit: {status.lastCommit ? new Date(status.lastCommit).toLocaleString("de-AT") : "—"}</div>
      {status.pending.length > 0 && <div style={{ ...mono, color: T.wolfram }}>Ausstehend: {status.pending.filter((k) => !status.conflict.includes(k)).join(", ") || "—"}</div>}
      {(status.stale || []).length > 0 && <div style={{ ...mono, color: T.wolfram }}>Nicht aktuell (letzter Pull fehlgeschlagen): {status.stale.join(", ")}</div>}
      {status.conflict.length > 0 && (
        <div style={{ marginTop: 6, padding: "10px 12px", background: "rgba(217,106,90,0.10)", border: "1px solid " + T.gefahr, borderRadius: 6 }}>
          <div style={{ ...mono, color: T.gefahr, marginBottom: 6 }}>
            Konflikt: Der Schlüssel wurde auf einem anderen Gerät geändert, während hier ein
            ungesyncter Stand liegt. Wähle pro Schlüssel, welcher Stand gilt (der jeweils
            andere bleibt als Snapshot gesichert):
          </div>
          {status.conflict.map((k) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
              <span style={{ ...mono, color: T.leinwandTief, minWidth: 140 }}>{k}</span>
              <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }} disabled={busy}
                onClick={() => konfliktRemote(k)}>Remote übernehmen</button>
              <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", borderColor: T.wolfram, color: T.wolfram }} disabled={busy}
                onClick={() => konfliktLokal(k)}>Diesen Stand pushen</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      {!ohneKopf && <h2 style={h2Style}>Geräte-Sync (Supabase)</h2>}

      {verbunden ? (
        /* ---- VERBUNDEN: schlank ---- */
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: T.leinwand }}>
            <span aria-hidden="true" style={{ color: "#6fce8f" }}>✓</span>
            <span>Verbunden mit der Datenbank</span>
          </div>
          <div style={{ ...mono, margin: "4px 0 12px" }}>owner: {owner || "—"} · Sync-Schlüssel auf diesem Gerät hinterlegt</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btnStyle(false)} onClick={jetztSynchronisieren} disabled={busy}>Jetzt synchronisieren</button>
            <button style={btnStyle(false)} onClick={() => { setMeldung(null); setBearbeiten(true); }} disabled={busy}>Bearbeiten</button>
            <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }} onClick={trennen} disabled={busy}>Trennen</button>
            {status.pending.length > 0 && (
              <button style={{ ...btnStyle(false), borderColor: T.wolfram, color: T.wolfram }} onClick={ausstehendeSenden} disabled={busy}>
                Ausstehende senden ({status.pending.length})
              </button>
            )}
          </div>
          {statusBlock}
        </>
      ) : (
        /* ---- NICHT VERBUNDEN: Ersteinrichtung ---- */
        <>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Synchronisiert deine Liste, Blogs, Pins &amp; Einstellungen über eine
            <strong style={{ color: T.leinwand }}> managed Datenbank</strong>. Login-frei: der
            <strong style={{ color: T.leinwand }}> Sync-Schlüssel</strong> autorisiert den Schreibzugriff,
            bleibt nur auf diesem Gerät und landet in keiner Zeile. Einmal eintragen &amp; „Speichern &amp; aktivieren".
          </p>
          {formFelder}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button style={btnStyle(false)} onClick={testen} disabled={busy}>Verbindung testen</button>
            <button style={btnStyle(true)} onClick={aktivieren} disabled={busy}>Speichern &amp; aktivieren</button>
          </div>
        </>
      )}

      {meldung && (
        <p style={{ fontSize: 13, color: farbe(meldung.art), margin: "12px 0 0", lineHeight: 1.5, fontFamily: "'Space Mono', monospace" }}>
          {meldung.text}
        </p>
      )}

      {/* Bearbeiten-Popup (Max 2026-07-19): Felder im Modal, nicht dauerhaft inline. */}
      {bearbeiten && (
        <div style={{ position: "fixed", inset: 0, zIndex: 11000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setBearbeiten(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.saalHoch, border: "1px solid " + T.rauch, borderRadius: 10, padding: "18px", maxWidth: 460, width: "100%", maxHeight: "90dvh", overflowY: "auto", boxShadow: "0 12px 48px rgba(0,0,0,0.6)" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", color: T.wolfram, marginBottom: 12 }}>Sync bearbeiten</div>
            {formFelder}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <button style={btnStyle(false)} onClick={testen} disabled={busy}>Verbindung testen</button>
              <button style={btnStyle(true)} onClick={aktivieren} disabled={busy}>Speichern &amp; aktivieren</button>
              <button style={{ ...btnStyle(false), borderColor: T.rauch }} onClick={() => setBearbeiten(false)} disabled={busy}>Schließen</button>
            </div>
            {meldung && (
              <p style={{ fontSize: 13, color: farbe(meldung.art), margin: "12px 0 0", lineHeight: 1.5, fontFamily: "'Space Mono', monospace" }}>
                {meldung.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
