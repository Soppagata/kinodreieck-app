import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useInstallationsStatus } from "../lib/installation.js";

export const NAVIGATION = Object.freeze([
  { id: "kino", label: "Kino", mobil: true, icon: "K" },
  { id: "streaming", label: "Streaming", mobil: true, icon: "S" },
  { id: "mediathek", label: "Mediathek", mobil: true, icon: "M" },
  { id: "finder", label: "Suche", mehr: true, icon: "⌕" },
  { id: "blog", label: "Blog", mehr: true, icon: "B" },
  { id: "start", label: "Start", mobil: true, icon: "⌂" },
  { id: "daten", label: "Einstellungen", mehr: true, icon: "⚙" },
]);

export function MobileNavigation({ aktiv, mehrOffen, onMehr, onNavigate, onHilfe, ungesichert }) {
  return (
    <>
      <button className={"kd-menuknopf" + (mehrOffen ? " offen" : "")} aria-label={mehrOffen ? "Menü schließen" : "Menü öffnen"}
        aria-expanded={mehrOffen} aria-controls="kd-mobile-menu" onClick={onMehr}>
        <span className="kd-menulinien" aria-hidden="true"><i /><i /><i /></span>
        {ungesichert && <i className="kd-nav-punkt" aria-label="Ungesicherte Änderungen" />}
      </button>
      {mehrOffen && <MenuPopup aktiv={aktiv} onClose={onMehr} onNavigate={onNavigate} onHilfe={onHilfe} ungesichert={ungesichert} />}
    </>
  );
}

function MenuPopup({ aktiv, onClose, onNavigate, onHilfe, ungesichert }) {
  const sheetRef = useRef(null);
  const installation = useInstallationsStatus();
  useEffect(() => {
    const vorher = document.activeElement;
    const altesOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector("button, a")?.focus();
    const taste = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", taste);
    return () => {
      document.body.style.overflow = altesOverflow;
      document.removeEventListener("keydown", taste);
      vorher?.focus?.();
    };
  }, [onClose]);

  const nachOben = () => {
    onClose();
    const reduziert = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    try { window.scrollTo({ top: 0, behavior: reduziert ? "auto" : "smooth" }); }
    catch { window.scrollTo(0, 0); }
  };

  return createPortal(
    <div className="kd-mobile-menu-layer">
      <button className="kd-sheet-scrim" aria-label="Menü schließen" onClick={onClose} />
      <section ref={sheetRef} id="kd-mobile-menu" className="kd-mobile-menu" role="dialog" aria-modal="true" aria-labelledby="kd-mobile-menu-titel">
        <div className="kd-mobile-menu-kopf">
          <h2 id="kd-mobile-menu-titel">Menü</h2>
          <button className="kd-mobile-menu-schliessen" aria-label="Menü schließen" onClick={onClose}>×</button>
        </div>
        <nav className="kd-mobile-menu-liste" aria-label="App-Bereiche">
          {NAVIGATION.map((eintrag) => (
            <button key={eintrag.id} className={aktiv === eintrag.id ? "aktiv" : ""} aria-current={aktiv === eintrag.id ? "page" : undefined}
              onClick={() => onNavigate(eintrag.id)}>
              <span className="kd-mobile-menu-icon" aria-hidden="true">{eintrag.icon}</span><strong>{eintrag.label}</strong>
              {eintrag.id === "daten" && ungesichert && <i className="kd-nav-punkt" />}
            </button>
          ))}
        </nav>
        <button className="kd-mobile-nachoben" onClick={nachOben}><span aria-hidden="true">↑</span><strong>Nach oben</strong></button>
        <div className="kd-mobile-menu-meta">
          <button onClick={onHilfe}><span aria-hidden="true">?</span>Anleitung &amp; Hilfe</button>
          {!installation.datei && <a href={import.meta.env.BASE_URL + "download/"}><span aria-hidden="true">↓</span>Installation &amp; Download</a>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
