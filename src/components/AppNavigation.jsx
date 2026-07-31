import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

export const NAVIGATION = Object.freeze([
  { id: "kino", label: "Kino", mobil: true, icon: "K" },
  { id: "streaming", label: "Streaming", mobil: true, icon: "S" },
  { id: "mediathek", label: "Mediathek", mobil: true, icon: "M" },
  { id: "finder", label: "Suche", mehr: true, icon: "⌕" },
  { id: "blog", label: "Blog", mehr: true, icon: "B" },
  { id: "start", label: "Start", mobil: true, icon: "⌂" },
  { id: "daten", label: "Einstellungen", mehr: true, icon: "⚙" },
]);
const MOBILE_NAVIGATION = Object.freeze([
  NAVIGATION.find((eintrag) => eintrag.id === "start"),
  ...NAVIGATION.filter((eintrag) => eintrag.id !== "start"),
]);

export function MobileNavigation({ aktiv, mehrOffen, onMehr, onNavigate }) {
  return (
    <>
      <button className={"kd-menuknopf" + (mehrOffen ? " offen" : "")} aria-label={mehrOffen ? "Menü schließen" : "Menü öffnen"}
        aria-expanded={mehrOffen} aria-controls="kd-mobile-menu" onClick={onMehr}>
        <span className="kd-menulinien" aria-hidden="true"><i /><i /><i /></span>
      </button>
      {mehrOffen && <MenuPopup aktiv={aktiv} onClose={onMehr} onNavigate={onNavigate} />}
    </>
  );
}

function MenuPopup({ aktiv, onClose, onNavigate }) {
  const sheetRef = useRef(null);
  useEffect(() => {
    const vorher = document.activeElement;
    const entsperren = sperreDokumentScroll();
    sheetRef.current?.querySelector("button, a")?.focus();
    const taste = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", taste);
    return () => {
      entsperren();
      document.removeEventListener("keydown", taste);
      vorher?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="kd-mobile-menu-layer">
      <button className="kd-sheet-scrim" aria-label="Menü schließen" onClick={onClose} />
      <section ref={sheetRef} id="kd-mobile-menu" className="kd-mobile-menu" role="dialog" aria-modal="true" aria-labelledby="kd-mobile-menu-titel">
        <div className="kd-mobile-menu-kopf">
          <h2 id="kd-mobile-menu-titel">Menü</h2>
          <button className="kd-mobile-menu-schliessen" aria-label="Menü schließen" onClick={onClose}>×</button>
        </div>
        <nav className="kd-mobile-menu-liste" aria-label="App-Bereiche">
          {MOBILE_NAVIGATION.map((eintrag) => (
            <button key={eintrag.id} className={aktiv === eintrag.id ? "aktiv" : ""} aria-current={aktiv === eintrag.id ? "page" : undefined}
              onClick={() => onNavigate(eintrag.id)}>
              <span className="kd-mobile-menu-icon" aria-hidden="true">{eintrag.icon}</span><strong>{eintrag.label}</strong>
            </button>
          ))}
        </nav>
      </section>
    </div>,
    document.body,
  );
}
