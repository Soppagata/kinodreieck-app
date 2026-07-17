import { T } from "../lib/tokens.js";
import { useSyncStatus } from "./SyncStatusChip.jsx";

/* Sichtbares, tappbares Band an der rechten Kante (nur am Handy, via CSS).
   Tap toggelt den Nav-Drawer. Trägt zusätzlich einen kleinen Sync-Status-Punkt,
   damit der Zustand auch bei geschlossener Nav sichtbar bleibt. Position/Sichtbar-
   keit steuert `.kd-navband` in index.css (Desktop: display:none). */
export function NavBand({ offen, onToggle }) {
  const s = useSyncStatus();
  const dot = !s.configured ? T.rauch : (s.conflict && s.conflict.length) ? T.gefahr
    : (s.pending && s.pending.length) ? T.wolfram : "#6fce8f";
  return (
    <button className="kd-navband" aria-label={offen ? "Menü schließen" : "Menü öffnen"} aria-expanded={offen} onClick={onToggle}>
      <span className="kd-navband-dot" style={{ background: dot }} />
      {offen ? "Zu" : "Menü"}
    </button>
  );
}
