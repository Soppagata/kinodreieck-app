import { useEffect, useRef, useState } from "react";
import {
  berechneSuchleistenGeometrie,
  istNeutraleViewportSkalierung,
  klassifiziereBildschirmtastatur,
  MIN_TASTATUR_HOEHENVERLUST,
} from "../lib/visualViewport.js";

const LABELS = Object.freeze({
  start: "Alles", kino: "Kino", mediathek: "Mediathek", streaming: "Streaming",
  blog: "Entdecken", finder: "Alles", daten: "Settings",
});

const VIEWPORT_STYLE_VARIABLEN = [
  "--kd-suche-viewport-shift",
  "--kd-suche-viewport-left",
  "--kd-suche-viewport-width",
  "--kd-suche-ergebnis-maxhoehe",
];
const SAFE_AREA_VARIABLEN = Object.freeze({
  top: "--kd-suche-safe-area-top",
  right: "--kd-suche-safe-area-right",
  bottom: "--kd-suche-safe-area-bottom",
  left: "--kd-suche-safe-area-left",
});

const liesSafeAreaInsets = (element) => {
  const style = getComputedStyle(element);
  return Object.fromEntries(Object.entries(SAFE_AREA_VARIABLEN).map(([seite, name]) => {
    const wert = Number.parseFloat(style.getPropertyValue(name));
    return [seite, Number.isFinite(wert) ? wert : 0];
  }));
};

const raeumeViewportPosition = (form) => {
  if (!form) return;
  form.classList.remove("tastatur-offen");
  for (const name of VIEWPORT_STYLE_VARIABLEN) form.style.removeProperty(name);
};

const fokussiereOhneBrowserScroll = (element) => {
  if (!element?.focus) return;
  try { element.focus({ preventScroll: true }); }
  catch { element.focus(); }
};

export function GlobalSearchBar({
  bereich, onSuchen, antwort, onAntwortSchliessen, onTreffer, onAlleErgebnisse,
  menuOffen = false, onMenu, onSuchaktion, beobachteteIds = [], radarTargetIds = [],
}) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const formRef = useRef(null);
  const eingabeRef = useRef(null);
  const dialogRef = useRef(null);
  const viewportUpdateRef = useRef(() => {});
  const beobachtet = new Set((beobachteteIds || []).map(String));
  const imRadar = new Set((radarTargetIds || []).map(String));
  const absenden = async (event) => {
    event.preventDefault();
    const frage = text.trim();
    if (!frage || laeuft) return;
    setLaeuft(true);
    try { await onSuchen?.({ text: frage, scope: bereich || "alles" }); }
    finally { setLaeuft(false); }
  };
  const schliesseAntwort = () => {
    onAntwortSchliessen?.();
    requestAnimationFrame(() => {
      fokussiereOhneBrowserScroll(eingabeRef.current);
      viewportUpdateRef.current();
    });
  };
  useEffect(() => {
    if (!antwort) return undefined;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === eingabeRef.current) return;
      const ersterTreffer = dialogRef.current?.querySelector("[data-globaler-suchtreffer], .kd-globalsuche-alle");
      fokussiereOhneBrowserScroll(ersterTreffer);
    });
    const taste = (event) => {
      if (event.key === "Escape") {
        schliesseAntwort();
      }
    };
    document.addEventListener("keydown", taste);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", taste); };
    // `antwort` ist die Ereigniskennung. Der Inline-Schließcallback aus App
    // darf nicht nach jedem Eltern-Render erneut den Ergebnisfokus stehlen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antwort]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const form = formRef.current;
    const eingabe = eingabeRef.current;
    if (!viewport || !form || !eingabe) return undefined;
    let frame = 0;
    let basis = {
      height: Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height),
      width: viewport.width,
    };
    let tastaturPhaseAktiv = false;
    const raeume = () => raeumeViewportPosition(form);
    const aktualisiere = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
        const editierbarerFokus = document.activeElement === eingabe
          && !eingabe.disabled && !eingabe.readOnly;
        const suchfokus = editierbarerFokus || form.contains(document.activeElement);
        const neutraleSkalierung = istNeutraleViewportSkalierung(viewport.scale);
        let breiteGeaendert = Math.abs(viewport.width - basis.width) > Math.max(2, basis.width * 0.04);
        const volleGeometrie = Math.abs(layoutHeight - viewport.height) <= MIN_TASTATUR_HOEHENVERLUST;

        if (neutraleSkalierung && (!suchfokus || breiteGeaendert || volleGeometrie)) {
          basis = {
            height: Math.max(layoutHeight, viewport.height),
            width: viewport.width,
          };
          breiteGeaendert = Math.abs(viewport.width - basis.width) > Math.max(2, basis.width * 0.04);
        }

        const tastaturOffen = !breiteGeaendert && klassifiziereBildschirmtastatur({
          /* Ein Fokuswechsel auf Suchen, Schließen oder einen Treffer beendet
             die OS-Tastatur nicht atomar. Solange der Visual Viewport noch
             verkleinert ist, bleibt deshalb eine einmal erkannte Phase aktiv.
             Erst die echte Viewport-Erholung (oder Rotation/Zoom) räumt sie. */
          editierbarerFokus: suchfokus || tastaturPhaseAktiv,
          scale: viewport.scale,
          height: viewport.height,
          width: viewport.width,
          layoutHeight,
          basisHeight: basis.height,
          basisWidth: basis.width,
        });
        tastaturPhaseAktiv = tastaturOffen;
        if (!tastaturOffen) {
          raeume();
          return;
        }

        const safeAreaInsets = liesSafeAreaInsets(form);
        const vorab = berechneSuchleistenGeometrie({
          height: viewport.height,
          width: viewport.width,
          offsetTop: viewport.offsetTop,
          offsetLeft: viewport.offsetLeft,
          basisUnterkante: 0,
          suchleistenHoehe: 0,
          safeAreaInsets,
        });
        form.style.setProperty("--kd-suche-viewport-left", `${vorab.links}px`);
        form.style.setProperty("--kd-suche-viewport-width", `${vorab.breite}px`);
        form.style.setProperty("--kd-suche-viewport-shift", "0px");
        form.classList.add("tastatur-offen");

        const rect = form.getBoundingClientRect();
        const geometrie = berechneSuchleistenGeometrie({
          height: viewport.height,
          width: viewport.width,
          offsetTop: viewport.offsetTop,
          offsetLeft: viewport.offsetLeft,
          basisUnterkante: rect.bottom,
          suchleistenHoehe: rect.height,
          safeAreaInsets,
        });
        form.style.setProperty("--kd-suche-viewport-shift", `${geometrie.shiftY}px`);
        form.style.setProperty("--kd-suche-ergebnis-maxhoehe", `${geometrie.ergebnisMaxHoehe}px`);
      });
    };
    viewportUpdateRef.current = aktualisiere;
    viewport.addEventListener("resize", aktualisiere);
    viewport.addEventListener("scroll", aktualisiere);
    window.addEventListener("resize", aktualisiere);
    window.addEventListener("scroll", aktualisiere, { passive: true });
    eingabe.addEventListener("focus", aktualisiere);
    eingabe.addEventListener("blur", aktualisiere);
    aktualisiere();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", aktualisiere);
      viewport.removeEventListener("scroll", aktualisiere);
      window.removeEventListener("resize", aktualisiere);
      window.removeEventListener("scroll", aktualisiere);
      eingabe.removeEventListener("focus", aktualisiere);
      eingabe.removeEventListener("blur", aktualisiere);
      tastaturPhaseAktiv = false;
      raeume();
      if (viewportUpdateRef.current === aktualisiere) viewportUpdateRef.current = () => {};
    };
  }, []);

  return (
    <form ref={formRef} className={`kd-globalsuche${menuOffen ? " menue-offen" : ""}`} onSubmit={absenden} role="search" aria-label="Globale Suche in allen Bereichen" aria-busy={laeuft}>
      <span className="kd-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {laeuft ? "Alle Bereiche werden durchsucht."
          : antwort ? `${antwort.gesamt} Suchergebnisse für ${antwort.frage}.` : ""}
      </span>
      {antwort && (
        <section ref={dialogRef} className="kd-globalsuche-antwort" role="dialog" aria-modal="false" aria-label={`Suchergebnisse für ${antwort.frage}`}>
          <div className="kd-globalsuche-antwortkopf">
            <div>
              <span>Suchergebnisse</span>
              <strong>{antwort.frage}</strong>
            </div>
            <button type="button" className="kd-globalsuche-schliessen" onClick={schliesseAntwort} aria-label="Suchergebnisse schließen">×</button>
          </div>
          <div className="kd-globalsuche-treffer" aria-live="polite">
            {antwort.items.length > 0 ? antwort.items.map((item) => (
              <div className="kd-globalsuche-trefferzeile" key={item.key}>
                <button type="button" className="kd-globalsuche-ziel" data-globaler-suchtreffer onClick={() => onTreffer?.(item)}>
                  <span>{item.bereichLabel}</span>
                  <strong>{item.titel}</strong>
                  {item.meta ? <small>{item.meta}</small> : null}
                </button>
                {item.searchActions?.watch || item.searchActions?.radar ? <div className="kd-globalsuche-aktionen" aria-label={`Aktionen für ${item.titel}`}>
                  {item.searchActions.watch ? <button type="button"
                    aria-pressed={beobachtet.has(String(item.searchActions.watch.watchmodeId))}
                    onClick={(event) => { event.currentTarget.focus(); onSuchaktion?.(item, "watch"); }}>{beobachtet.has(String(item.searchActions.watch.watchmodeId)) ? "Beobachtet" : "Beobachten"}</button> : null}
                  {item.searchActions.radar ? <button type="button"
                    aria-pressed={imRadar.has(item.searchActions.radar.targetId)}
                    disabled={imRadar.has(item.searchActions.radar.targetId)}
                    onClick={(event) => { event.currentTarget.focus(); onSuchaktion?.(item, "radar"); }}>{imRadar.has(item.searchActions.radar.targetId) ? "Im Radar" : "Ins Radar"}</button> : null}
                </div> : null}
              </div>
            )) : <p>Kein direkter Treffer. Probiere einen Titel, ein Genre oder eine Frage zur App.</p>}
          </div>
          <button type="button" className="kd-globalsuche-alle" onClick={onAlleErgebnisse}>Ausführliche Ergebnisse öffnen</button>
        </section>
      )}
      <input ref={eingabeRef} value={text} onChange={(event) => setText(event.target.value)}
        aria-label="Sucheingabe"
        placeholder={bereich === "daten" ? "Wo finde ich …?" : `${LABELS[bereich] || "Alles"} durchsuchen …`} />
      <button type="submit" className="kd-globalsuche-los" aria-label={laeuft ? "Suche läuft" : "Suchen"} disabled={laeuft}>⌕</button>
      <button type="button" className={"kd-globalsuche-menu" + (menuOffen ? " offen" : "")}
        aria-label={menuOffen ? "Menü schließen" : "Menü öffnen"} aria-expanded={menuOffen}
        aria-controls="kd-mobile-menu" onClick={onMenu}>
        <i /><i /><i />
      </button>
    </form>
  );
}
