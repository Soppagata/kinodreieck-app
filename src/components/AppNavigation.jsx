import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

export const NAVIGATION = Object.freeze([
  { id: "start", label: "Start", mobil: true, icon: "⌂" },
  { id: "kino", label: "Kino", mobil: true, icon: "K" },
  { id: "mediathek", label: "Mediathek", mobil: true, icon: "M" },
  { id: "streaming", label: "Streaming", mobil: true, icon: "S" },
  { id: "finder", label: "Suche", desktopOnly: true, icon: "search" },
  { id: "blog", label: "Entdecken", mehr: true, icon: "E" },
  { id: "daten", label: "Settings", mehr: true, icon: "⚙" },
]);

function NavigationSymbol({ id }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" };
  switch (id) {
    case "start": return <svg {...common}><path d="M4 10.6 12 4l8 6.6v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 18.8v-8.2Z" /><path d="M9.2 20v-5.7h5.6V20" /></svg>;
    case "kino": return <svg {...common}><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m10.2 9 5.1 3-5.1 3V9Z" /></svg>;
    case "mediathek": return <svg {...common}><path d="M4 7h16v12H4zM8 4h8M7 4l-2 3m12-3 2 3" /><path d="m10.2 10 4.6 2-4.6 2v-4Z" /></svg>;
    case "streaming": return <svg {...common}><rect x="3.5" y="5" width="17" height="11.5" rx="2" /><path d="M8 20h8m-4-3.5V20M10.2 8.5l4.6 2.3-4.6 2.3V8.5Z" /></svg>;
    case "blog": return <svg {...common}><circle cx="12" cy="12" r="7.5" /><path d="m14.7 9.3-1.8 4.4-4.4 1.8 1.8-4.4 4.4-1.8Z" /></svg>;
    case "daten": return <svg {...common}><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="11" cy="17" r="1.5" /></svg>;
    default: return null;
  }
}

function ArrowUpSymbol() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V6m0 0-5 5m5-5 5 5" /></svg>;
}

function CloseSymbol() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}

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
                <span className="kd-mobile-menu-symbol"><NavigationSymbol id={eintrag.id} /></span>
                <span>{eintrag.label}</span>
              </button>
            ))}
          </nav>
          <footer className="kd-mobile-menu-fusszeile">
            <button className="kd-mobile-menu-schliessen" type="button" onClick={onClose}
              aria-label="Navigation schließen" title="Navigation schließen">
              <CloseSymbol /><span>Schließen</span>
            </button>
            <button className="kd-mobile-menu-nachoben" type="button" onClick={onNachOben}
              aria-label="In diesem Bereich nach oben" title="Nach oben">
              <ArrowUpSymbol /><span>Nach oben</span>
            </button>
          </footer>
        </section>
      </div>
    </div>,
    document.body,
  );
}
