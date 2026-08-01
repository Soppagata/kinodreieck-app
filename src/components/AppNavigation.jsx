import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

export const NAVIGATION = Object.freeze([
  { id: "start", label: "Start", mobil: true, icon: "⌂" },
  { id: "kino", label: "Kino", mobil: true, icon: "K" },
  { id: "mediathek", label: "Mediathek", mobil: true, icon: "M" },
  { id: "streaming", label: "Streaming", mobil: true, icon: "S" },
  { id: "blog", label: "Blog", mehr: true, icon: "B" },
  { id: "daten", label: "Settings", mehr: true, icon: "⚙" },
]);

export function MobileNavigation({ aktiv, mehrOffen, onMehr, onNavigate, onNachOben }) {
  return (
    <>
      {mehrOffen && <MenuPopup aktiv={aktiv} onClose={onMehr} onNavigate={onNavigate} onNachOben={onNachOben} />}
    </>
  );
}

function MenuPopup({ aktiv, onClose, onNavigate, onNachOben }) {
  const sheetRef = useRef(null);
  useEffect(() => {
    const vorher = document.activeElement;
    const entsperren = sperreDokumentScroll();
    sheetRef.current?.querySelector("button, a")?.focus();
    const taste = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const fokusziele = [...(sheetRef.current?.querySelectorAll(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (!fokusziele.length) { event.preventDefault(); sheetRef.current?.focus?.(); return; }
      const erstes = fokusziele[0];
      const letztes = fokusziele[fokusziele.length - 1];
      if (event.shiftKey && (document.activeElement === erstes || !sheetRef.current?.contains(document.activeElement))) {
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
      <section ref={sheetRef} id="kd-mobile-menu" className="kd-mobile-menu" role="dialog" aria-modal="true" aria-label="Menü">
        <nav className="kd-mobile-menu-liste" aria-label="App-Bereiche">
          {NAVIGATION.map((eintrag) => (
            <button key={eintrag.id} className={aktiv === eintrag.id ? "aktiv" : ""} aria-current={aktiv === eintrag.id ? "page" : undefined}
              onClick={() => onNavigate(eintrag.id)}>
              {eintrag.label}
            </button>
          ))}
        </nav>
        <button className="kd-mobile-menu-nachoben" type="button" onClick={onNachOben}
          aria-label="In diesem Bereich nach oben" title="Nach oben">↑</button>
      </section>
    </div>,
    document.body,
  );
}
