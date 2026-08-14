import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { InstallationCard } from "./InstallationCard.jsx";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";
import { HILFE_BEREICHE } from "../lib/hilfeInhalte.js";

const FOKUSZIELE = [
  "button:not([disabled])", "a[href]", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])',
].join(",");

export function HilfeSheet({ onClose }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const ausloeser = document.activeElement;
    const entsperren = sperreDokumentScroll();
    const panel = panelRef.current;
    const fokusziele = () => [...(panel?.querySelectorAll(FOKUSZIELE) || [])]
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    (fokusziele()[0] || panel)?.focus();
    const taste = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const ziele = fokusziele();
      if (!ziele.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      const fokusImPanel = panel.contains(document.activeElement);
      if (event.shiftKey && (!fokusImPanel || document.activeElement === erstes)) {
        event.preventDefault();
        letztes.focus();
      } else if (!event.shiftKey && (!fokusImPanel || document.activeElement === letztes)) {
        event.preventDefault();
        erstes.focus();
      }
    };
    document.addEventListener("keydown", taste);
    return () => {
      entsperren();
      document.removeEventListener("keydown", taste);
      if (ausloeser?.isConnected) {
        try { ausloeser.focus({ preventScroll: true }); } catch { ausloeser.focus?.(); }
      }
    };
  }, [onClose]);

  return createPortal(
    <div className="kd-help-layer" role="dialog" aria-modal="true" aria-labelledby="kd-help-titel">
      <button className="kd-sheet-scrim" aria-label="Hilfe schließen" onClick={onClose} />
      <section ref={panelRef} className="kd-help-panel" tabIndex={-1}>
        <div className="kd-sheet-kopf"><h2 id="kd-help-titel">Anleitung &amp; Hilfe</h2><button className="kd-sheet-close" onClick={onClose} aria-label="Schließen">×</button></div>
        <p className="kd-help-lead">Diese Hilfe öffnet sich nur, wenn du sie bewusst aufrufst.</p>
        <div className="kd-help-grid">
          {HILFE_BEREICHE.map((bereich) => (
            <article key={bereich.id} data-hilfe-ziel={bereich.ziel}>
              <h3>{bereich.titel}</h3>
              <p>{bereich.kurztext}</p>
            </article>
          ))}
        </div>
        <InstallationCard kompakt />
      </section>
    </div>,
    document.body,
  );
}
