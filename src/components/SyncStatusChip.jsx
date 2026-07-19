import { useState, useEffect } from "react";
import { T } from "../lib/tokens.js";
import { activeSyncStatus } from "../lib/storage.js";

/* Leitet aus dem Git-Sync-Status die drei Vertrauens-Zustände ab:
   synchron / ausstehend / Konflikt. Ohne Git-Konfig: neutral (null). */
function ableiten(s) {
  if (!s || !s.configured) return null;
  if (s.conflict && s.conflict.length) return { farbe: T.gefahr, bg: "rgba(217,106,90,0.14)", text: "Konflikt" };
  if (s.pending && s.pending.length) return { farbe: T.wolfram, bg: "rgba(227,166,59,0.14)", text: "ausstehend " + s.pending.length };
  if (s.stale && s.stale.length) return { farbe: T.wolfram, bg: "rgba(227,166,59,0.14)", text: "nicht aktuell" };
  return { farbe: "#6fce8f", bg: "rgba(111,206,143,0.12)", text: "synchron" };
}

/* Pollt den Sync-Status leichtgewichtig (alle 3s + bei Fensterfokus). Der Status
   ändert sich durch asynchrone Commits/Pulls, ist aber nicht reaktiv — daher Poll. */
export function useSyncStatus() {
  const [s, setS] = useState(() => { try { return activeSyncStatus(); } catch { return { configured: false, pending: [], conflict: [], stale: [] }; } });
  useEffect(() => {
    const tick = () => { try { setS(activeSyncStatus()); } catch { /* */ } };
    const iv = setInterval(tick, 3000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(iv); window.removeEventListener("focus", tick); };
  }, []);
  return s;
}

/* Persistentes Status-Pill (Header). Auf dem Handy die Vertrauensfrage der App. */
export function SyncStatusChip() {
  const v = ableiten(useSyncStatus());
  if (!v) return null;
  return (
    <span title={"Geräte-Sync: " + v.text} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999,
      background: v.bg, color: v.farbe, fontFamily: "'Space Mono', monospace", fontSize: 11, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: v.farbe }} /> {v.text}
    </span>
  );
}
