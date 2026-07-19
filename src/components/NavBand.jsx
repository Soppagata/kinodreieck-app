/* Griff an der Bildschirmkante (nur am Handy, via CSS): kompakt, ohne Text,
   drei Striche (Etappe 3, Schablone drawer_schablone.html). Tap toggelt das
   Nav-Popup. Standard links; die Linkshänder-Option (.kd-links am Wrapper)
   spiegelt Griff und Popup. Position/Sichtbarkeit steuert `.kd-navband` in
   index.css (Desktop: display:none).
   Der ÜBERGANGS-Sync-Punkt (Etappe 3) ist seit Etappe 4 entfernt — die
   Vertrauens-Zeile im Start-Dashboard ist jetzt der Sync-Ort
   (Entscheidungs-Log: kein Zeitfenster ohne sichtbaren Sync-Status). */
import { forwardRef } from "react";

export const NavBand = forwardRef(function NavBand({ offen, onToggle }, ref) {
  return (
    <button ref={ref} className="kd-navband" aria-label={offen ? "Menü schließen" : "Menü öffnen"} aria-expanded={offen} onClick={onToggle}>
      <i /><i /><i />
    </button>
  );
});
