import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

export const NAVIGATION = Object.freeze([
  { id: "start", label: "Start", mobil: true, icon: "⌂" },
  { id: "kino", label: "Kino", mobil: true, icon: "K" },
  { id: "mediathek", label: "Mediathek", mobil: true, icon: "M" },
  { id: "streaming", label: "Streaming", mobil: true, icon: "S" },
  { id: "finder", label: "Suche", desktopOnly: true, icon: "⌕" },
  { id: "blog", label: "Entdecken", mehr: true, icon: "E" },
  { id: "daten", label: "Settings", mehr: true, icon: "⚙" },
]);

export function MobileNavigation({ aktiv, mehrOffen, sicherungOffen = false, onMehr, onNavigate, onNachOben }) {
  return (
    <>
      {mehrOffen && <MenuPopup aktiv={aktiv} sicherungOffen={sicherungOffen}
        onClose={onMehr} onNavigate={onNavigate} onNachOben={onNachOben} />}
    </>
  );
}

function MenuPopup({ aktiv, sicherungOffen, onClose, onNavigate, onNachOben }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const vorher = document.activeElement;
    const entsperren = sperreDokumentScroll();
    dialogRef.current?.querySelector(".kd-mobile-menu button, .kd-mobile-menu a")?.focus();
    const taste = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const fokusziele = [...(dialogRef.current?.querySelectorAll(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (!fokusziele.length) { event.preventDefault(); dialogRef.current?.focus?.(); return; }
      const erstes = fokusziele[0];
      const letztes = fokusziele[fokusziele.length - 1];
      if (event.shiftKey && (document.activeElement === erstes || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); letztes.focus();
      } else if (!event.shiftKey && document.activeElement === letztes) {
        event.preventDefault(); erstes.focus();
      }
    };
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
      <div ref={dialogRef} className="kd-mobile-menu-dialog" role="dialog" aria-modal="true" aria-label="Menü">
        <section id="kd-mobile-menu" className="kd-mobile-menu">
          <nav className="kd-mobile-menu-liste" aria-label="App-Bereiche">
            {NAVIGATION.filter((eintrag) => !eintrag.desktopOnly).map((eintrag) => (
              <button key={eintrag.id}
                className={[
                  aktiv === eintrag.id ? "aktiv" : "",
                  sicherungOffen && eintrag.id === "daten" ? "kd-sicherung-offen" : "",
                ].filter(Boolean).join(" ")}
                aria-current={aktiv === eintrag.id ? "page" : undefined}
                aria-label={sicherungOffen && eintrag.id === "daten" ? eintrag.label : undefined}
                aria-description={sicherungOffen && eintrag.id === "daten" ? "Sicherung offen" : undefined}
                onClick={() => onNavigate(eintrag.id)}>
                {eintrag.label}
              </button>
            ))}
          </nav>
        </section>
        <button className="kd-mobile-menu-nachoben" type="button" onClick={onNachOben}
          aria-label="In diesem Bereich nach oben" title="Nach oben">↑</button>
      </div>
    </div>,
    document.body,
  );
}
