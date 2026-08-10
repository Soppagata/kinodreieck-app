import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";
import { RADAR_NORMAL_ACTIVE_LIMIT } from "../lib/radarContracts.js";

function focusableElements(root) {
  return [...(root?.querySelectorAll(
    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
  ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

/* Bestätigungsgrenze für „Ins Radar“: Bis zum Klick auf „Bestätigen“ wird
   weder der persönliche Radar-Topf verändert noch ein Outbox-Eintrag erzeugt. */
export function RadarSubscriptionPreview({
  target, radarState, accountMode = false, accountActive = false, onConfirm, onClose,
}) {
  const dialogRef = useRef(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");
  const activeCount = (radarState?.subscriptions || []).filter((entry) => entry.status === "active").length;
  const serverSubscriptionActive = accountMode && (radarState?.subscriptions || []).some((entry) => (
    entry.targetId === target?.targetId && entry.status === "active" && entry.authority === "server"
  ));
  const shareAllowed = accountActive && serverSubscriptionActive;
  const alreadyActive = (radarState?.subscriptions || []).some((entry) => (
    entry.targetId === target?.targetId && entry.status === "active"
  ));
  const targetType = target?.targetType === "series" ? "Serie" : "Film oder Werk";
  const quotaText = accountMode
    ? `${activeCount} serverbestätigte Ziele im Kontocache`
    : `${activeCount} von ${RADAR_NORMAL_ACTIVE_LIMIT} lokalen Zielen aktiv`;
  const headingId = useMemo(() => `kd-radar-preview-${String(target?.targetId || "ziel").replace(/[^a-z0-9_-]/gi, "-")}`, [target]);

  useEffect(() => {
    if (!target) return undefined;
    const vorher = document.activeElement;
    const entsperren = sperreDokumentScroll();
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector("button")?.focus());
    const taste = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose?.(); return; }
      if (event.key !== "Tab") return;
      const ziele = focusableElements(dialogRef.current);
      if (!ziele.length) { event.preventDefault(); dialogRef.current?.focus?.(); return; }
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      if (event.shiftKey && (document.activeElement === erstes || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); letztes.focus();
      } else if (!event.shiftKey && document.activeElement === letztes) {
        event.preventDefault(); erstes.focus();
      }
    };
    document.addEventListener("keydown", taste);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", taste);
      entsperren();
      requestAnimationFrame(() => {
        if (vorher?.isConnected) vorher.focus?.({ preventScroll: true });
      });
    };
  }, [onClose, target]);

  if (!target || typeof document === "undefined") return null;
  const bestaetigen = async () => {
    if (speichert) return;
    setSpeichert(true); setFehler("");
    try {
      const ok = await onConfirm?.(target, { shareEnabled: shareAllowed && shareEnabled });
      if (ok) onClose?.();
      else setFehler("Die Radar-Änderung wurde nicht bestätigt gespeichert.");
    } catch (error) {
      setFehler(error?.message || "Die Radar-Änderung konnte nicht gespeichert werden.");
    } finally { setSpeichert(false); }
  };

  return createPortal(
    <div className="kd-entdecken-layer" data-testid="radar-preview-layer">
      <button type="button" className="kd-sheet-scrim" aria-label="Radar-Vorschau schließen" onClick={onClose} />
      <section ref={dialogRef} className="kd-entdecken-dialog kd-radar-preview" role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}>
        <header className="kd-entdecken-dialog-kopf">
          <div>
            <span>Vorschau · noch nicht gespeichert</span>
            <h2 id={headingId}>Ins Radar</h2>
          </div>
          <button type="button" className="kd-entdecken-schliessen" aria-label="Radar-Vorschau schließen" onClick={onClose}>×</button>
        </header>
        <div className="kd-entdecken-preview-ziel">
          <strong>{target.title}</strong>
          <span>{targetType} · Österreich · alle bestätigten Ereignistypen</span>
        </div>
        <dl className="kd-entdecken-fakten">
          <div><dt>Status</dt><dd>{alreadyActive ? "Bereits aktiv; Bestätigung aktualisiert den Eintrag" : "Wird erst nach deiner Bestätigung aktiv"}</dd></div>
          <div><dt>Kapazität</dt><dd>{quotaText}</dd></div>
          <div><dt>Kosten</dt><dd>Diese lokale Phase startet keinen Provider-Aufruf und keine Routine.</dd></div>
          <div><dt>Privatsphäre</dt><dd>Standardmäßig bleibt das Ziel privat. Geteilt werden nie Bewertungen oder Profilsignale.</dd></div>
        </dl>
        <label className={`kd-entdecken-share${shareAllowed ? "" : " gesperrt"}`}>
          <input type="checkbox" checked={shareEnabled} disabled={!shareAllowed}
            onChange={(event) => setShareEnabled(event.target.checked)} />
          <span><strong>Ohne meinen Namen für „Von anderen entdeckt“ teilen</strong>
            <small>{shareAllowed
              ? "Explizites Opt-in für dieses bereits serverbestätigte Radarziel."
              : accountMode
                ? "Erst nach einer serverbestätigten aktiven Beobachtung verfügbar."
                : "Nur mit aktivem Konto und serverbestätigtem Radarziel verfügbar."}</small></span>
        </label>
        {fehler ? <p className="kd-entdecken-fehler" role="alert">{fehler}</p> : null}
        <div className="kd-entdecken-dialog-aktionen">
          <button type="button" className="kd-entdecken-sekundaer" disabled={speichert} onClick={onClose}>Abbrechen</button>
          <button type="button" className="kd-entdecken-primaer" disabled={speichert || (!accountMode && !alreadyActive && activeCount >= RADAR_NORMAL_ACTIVE_LIMIT)}
            onClick={() => void bestaetigen()}>{speichert ? "Speichert …" : alreadyActive ? "Aktiv lassen" : "Ins Radar bestätigen"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
