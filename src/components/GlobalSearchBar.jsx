import { useEffect, useRef, useState } from "react";
import {
  berechneSuchleistenGeometrie,
  istNeutraleViewportSkalierung,
  klassifiziereBildschirmtastatur,
  MIN_TASTATUR_HOEHENVERLUST,
} from "../lib/visualViewport.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

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
const VIEWPORT_STABILISIERUNGS_FRAMES = 45;

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
  const viewportEndRef = useRef(() => {});
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
      viewportEndRef.current();
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
    let stabilisierungFrame = 0;
    let fokusFrame = 0;
    let stabilisierungGeneration = 0;
    let phase = "idle";
    let entsperreScroll = null;
    let fokusIntent = false;
    let fokusBestaetigt = false;
    let fokusScrollY = 0;
    let aktiv = true;
    let basis = {
      height: Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height),
      width: viewport.width,
    };
    const aktualisiereBasis = () => {
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      basis = { height: Math.max(layoutHeight, viewport.height), width: viewport.width };
    };
    const loeseScrollsperre = () => {
      const entsperren = entsperreScroll;
      entsperreScroll = null;
      entsperren?.();
    };
    const beendePhase = ({ neueBasis = false } = {}) => {
      phase = "idle";
      cancelAnimationFrame(fokusFrame);
      fokusFrame = 0;
      fokusIntent = false;
      stabilisierungGeneration += 1;
      cancelAnimationFrame(stabilisierungFrame);
      raeumeViewportPosition(form);
      loeseScrollsperre();
      if (neueBasis) aktualisiereBasis();
    };
    const aktualisiere = () => {
      if (!aktiv) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!aktiv) return;
        const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
        const editierbarerFokus = document.activeElement === eingabe
          && !eingabe.disabled && !eingabe.readOnly;
        const suchfokus = editierbarerFokus || form.contains(document.activeElement);
        const neutraleSkalierung = istNeutraleViewportSkalierung(viewport.scale);
        let breiteGeaendert = Math.abs(viewport.width - basis.width) > Math.max(2, basis.width * 0.04);
        const volleGeometrie = Math.abs(layoutHeight - viewport.height) <= MIN_TASTATUR_HOEHENVERLUST;

        /* Rotation, Zoom und die echte Viewport-Erholung beenden den optischen
           Pin. Eine anlaufende Fokusphase darf volle Geometrie dagegen kurz
           sehen, weil WebKit die Tastaturmaße verzögert liefern kann. */
        if (phase !== "idle" && (!neutraleSkalierung
          || (phase === "keyboard-open" && volleGeometrie))) {
          beendePhase({ neueBasis: true });
          return;
        }
        if (phase !== "idle" && breiteGeaendert) {
          beendePhase({ neueBasis: true });
          if (editierbarerFokus && !volleGeometrie) {
            phase = "focus-pending";
            aktualisiere();
          }
          return;
        }

        if (phase === "idle" && neutraleSkalierung && (!suchfokus || breiteGeaendert || volleGeometrie)) {
          aktualisiereBasis();
          breiteGeaendert = Math.abs(viewport.width - basis.width) > Math.max(2, basis.width * 0.04);
        }

        const tastaturKandidat = !breiteGeaendert && klassifiziereBildschirmtastatur({
          /* Ein Fokuswechsel auf Suchen, Schließen oder einen Treffer beendet
             die OS-Tastatur nicht atomar. Solange der Visual Viewport noch
             verkleinert ist, bleibt deshalb eine einmal erkannte Phase aktiv.
             Erst die echte Viewport-Erholung (oder Rotation/Zoom) räumt sie. */
          editierbarerFokus: suchfokus || phase === "focus-pending" || phase === "keyboard-open",
          scale: viewport.scale,
          height: viewport.height,
          width: viewport.width,
          layoutHeight,
          basisHeight: basis.height,
          basisWidth: basis.width,
        });
        /* Manche Browser liefern den verkleinerten Viewport erst deutlich nach
           dem Fokusereignis. Ein weiterhin editierbares Feld darf die Phase
           deshalb anhand der echten Geometrie erneut eröffnen. */
        if (phase === "idle" && editierbarerFokus && tastaturKandidat) {
          phase = "focus-pending";
        }
        const tastaturOffen = phase !== "idle" && tastaturKandidat;
        if (!tastaturOffen) {
          raeumeViewportPosition(form);
          return;
        }
        if (fokusBestaetigt && !entsperreScroll) {
          entsperreScroll = sperreDokumentScroll({
            scrollY: fokusIntent ? fokusScrollY : window.scrollY || 0,
          });
          fokusIntent = false;
        }
        phase = "keyboard-open";

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
    const stabilisiereFokusphase = () => {
      if (!aktiv || phase === "idle") return;
      const generation = ++stabilisierungGeneration;
      cancelAnimationFrame(stabilisierungFrame);
      let verbleibend = VIEWPORT_STABILISIERUNGS_FRAMES;
      const sample = () => {
        if (!aktiv || generation !== stabilisierungGeneration) return;
        aktualisiere();
        verbleibend -= 1;
        if (verbleibend > 0) {
          stabilisierungFrame = requestAnimationFrame(sample);
          return;
        }
        stabilisierungFrame = requestAnimationFrame(() => {
          if (!aktiv || generation !== stabilisierungGeneration) return;
          if (phase === "focus-pending") beendePhase({ neueBasis: true });
        });
      };
      stabilisierungFrame = requestAnimationFrame(sample);
    };
    const merkeFokusIntent = () => {
      fokusIntent = true;
      fokusScrollY = window.scrollY || 0;
    };
    const starteFokusphase = () => {
      cancelAnimationFrame(fokusFrame);
      fokusFrame = requestAnimationFrame(() => {
        if (!aktiv || document.activeElement !== eingabe) return;
        fokusBestaetigt = true;
        if (phase === "idle") {
          aktualisiereBasis();
          phase = "focus-pending";
        }
        stabilisiereFokusphase();
        aktualisiere();
      });
    };
    const verarbeiteBlur = () => {
      requestAnimationFrame(() => {
        if (!aktiv) return;
        if (phase === "focus-pending" && !form.contains(document.activeElement)) {
          beendePhase({ neueBasis: true });
          return;
        }
        stabilisiereFokusphase();
        aktualisiere();
      });
    };
    const stoppeViewportPhase = () => {
      fokusBestaetigt = false;
      beendePhase({ neueBasis: true });
    };
    viewportUpdateRef.current = aktualisiere;
    viewportEndRef.current = stoppeViewportPhase;
    viewport.addEventListener("resize", aktualisiere);
    viewport.addEventListener("scroll", aktualisiere);
    window.addEventListener("resize", aktualisiere);
    window.addEventListener("scroll", aktualisiere, { passive: true });
    eingabe.addEventListener("pointerdown", merkeFokusIntent, { passive: true });
    eingabe.addEventListener("focus", starteFokusphase);
    eingabe.addEventListener("blur", verarbeiteBlur);
    aktualisiere();
    return () => {
      aktiv = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(fokusFrame);
      stabilisierungGeneration += 1;
      cancelAnimationFrame(stabilisierungFrame);
      viewport.removeEventListener("resize", aktualisiere);
      viewport.removeEventListener("scroll", aktualisiere);
      window.removeEventListener("resize", aktualisiere);
      window.removeEventListener("scroll", aktualisiere);
      eingabe.removeEventListener("pointerdown", merkeFokusIntent);
      eingabe.removeEventListener("focus", starteFokusphase);
      eingabe.removeEventListener("blur", verarbeiteBlur);
      beendePhase();
      if (viewportUpdateRef.current === aktualisiere) viewportUpdateRef.current = () => {};
      if (viewportEndRef.current === stoppeViewportPhase) viewportEndRef.current = () => {};
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
                <button type="button" className="kd-globalsuche-ziel" data-globaler-suchtreffer onClick={(event) => {
                  event.currentTarget.focus(); viewportEndRef.current(); onTreffer?.(item);
                }}>
                  <span>{item.bereichLabel}</span>
                  <strong>{item.titel}</strong>
                  {item.meta ? <small>{item.meta}</small> : null}
                </button>
                {item.searchActions?.watch || item.searchActions?.radar ? <div className="kd-globalsuche-aktionen" aria-label={`Aktionen für ${item.titel}`}>
                  {item.searchActions.watch ? <button type="button"
                    aria-pressed={beobachtet.has(String(item.searchActions.watch.watchmodeId))}
                    onClick={(event) => { event.currentTarget.focus(); viewportEndRef.current();
                      onSuchaktion?.(item, "watch"); }}>{beobachtet.has(String(item.searchActions.watch.watchmodeId)) ? "Beobachtet" : "Beobachten"}</button> : null}
                  {item.searchActions.radar ? <button type="button"
                    aria-pressed={imRadar.has(item.searchActions.radar.targetId)}
                    disabled={imRadar.has(item.searchActions.radar.targetId)}
                    onClick={(event) => { event.currentTarget.focus(); viewportEndRef.current();
                      onSuchaktion?.(item, "radar"); }}>{imRadar.has(item.searchActions.radar.targetId) ? "Im Radar" : "Ins Radar"}</button> : null}
                </div> : null}
              </div>
            )) : <p>Kein direkter Treffer. Probiere einen Titel, ein Genre oder eine Frage zur App.</p>}
          </div>
          <button type="button" className="kd-globalsuche-alle" onClick={(event) => {
            event.currentTarget.focus(); viewportEndRef.current(); onAlleErgebnisse?.();
          }}>Ausführliche Ergebnisse öffnen</button>
        </section>
      )}
      <input ref={eingabeRef} value={text} onChange={(event) => setText(event.target.value)}
        aria-label="Sucheingabe"
        placeholder={bereich === "daten" ? "Wo finde ich …?" : `${LABELS[bereich] || "Alles"} durchsuchen …`} />
      <button type="submit" className="kd-globalsuche-los" aria-label={laeuft ? "Suche läuft" : "Suchen"} disabled={laeuft}>⌕</button>
      <button type="button" className={"kd-globalsuche-menu" + (menuOffen ? " offen" : "")}
        aria-label={menuOffen ? "Menü schließen" : "Menü öffnen"} aria-expanded={menuOffen}
        aria-controls="kd-mobile-menu" onClick={(event) => {
          if (!document.activeElement?.closest?.('[aria-modal="true"]')) event.currentTarget.focus();
          viewportEndRef.current(); onMenu?.(); }}>
        <i /><i /><i />
      </button>
    </form>
  );
}
