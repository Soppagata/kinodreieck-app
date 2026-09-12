import { useState, useEffect } from "react";
import { syncStatusAnzeige } from "../lib/syncStatus.js";
import { activeSyncStatus } from "../services/storage.js";

/* Leitet aus dem aktiven Kontospeicher die drei Vertrauens-Zustände ab:
   synchron / ausstehend / Konflikt. Im lokalen Gastmodus: neutral (null). */

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
  const v = syncStatusAnzeige(useSyncStatus());
  if (!v) return null;
  return (
    <span className="kd-syncchip" title={"Geräte-Sync: " + v.text} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999,
      background: v.bg, color: v.farbe, fontFamily: "'Space Mono', monospace", fontSize: 11, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: v.farbe }} /> {v.text}
    </span>
  );
}
