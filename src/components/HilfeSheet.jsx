import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { InstallationCard } from "./InstallationCard.jsx";

export function HilfeSheet({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const vorher = document.activeElement;
    const alt = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button")?.focus();
    const taste = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", taste);
    return () => { document.body.style.overflow = alt; document.removeEventListener("keydown", taste); vorher?.focus?.(); };
  }, [onClose]);

  return createPortal(
    <div className="kd-help-layer" role="dialog" aria-modal="true" aria-labelledby="kd-help-titel">
      <button className="kd-sheet-scrim" aria-label="Hilfe schließen" onClick={onClose} />
      <section ref={ref} className="kd-help-panel">
        <div className="kd-sheet-kopf"><h2 id="kd-help-titel">Anleitung &amp; Hilfe</h2><button className="kd-sheet-close" onClick={onClose} aria-label="Schließen">×</button></div>
        <p className="kd-help-lead">Diese Hilfe öffnet sich nur, wenn du sie bewusst aufrufst.</p>
        <div className="kd-help-grid">
          <article><strong>Start</strong><p>Dein Überblick mit Kinopins, Merkliste und Empfehlungen.</p></article>
          <article><strong>Kino &amp; Streaming</strong><p>Aktuelle Angebote filtern und Filme in die eigene Mediathek übernehmen.</p></article>
          <article><strong>Mediathek</strong><p>Filme bewerten, Listen pflegen und den persönlichen Bestand sichern.</p></article>
          <article><strong>Einstellungen</strong><p>Konto, Backup, Datenquellen, Darstellung und KI-Wahl verwalten.</p></article>
        </div>
        <InstallationCard kompakt />
      </section>
    </div>,
    document.body,
  );
}
