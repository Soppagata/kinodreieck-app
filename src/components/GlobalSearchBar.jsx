import { useEffect, useRef, useState } from "react";
import {
  berechneSuchleistenGeometrie,
  berechneSuchleistenRectDrift,
  erstelleScrollProvenienz,
  istNeutraleViewportSkalierung,
  istScrollTaste,
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
  form.classList.remove("tastatur-offen", "tastatur-autoscroll");
  for (const name of VIEWPORT_STYLE_VARIABLEN) form.style.removeProperty(name);
};

const istEditierbaresOderInteraktivesZiel = (ziel) => Boolean(
  ziel instanceof Element
  && ziel.closest("input,textarea,select,button,a[href],[contenteditable]:not([contenteditable='false'])"),
);

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
    let stabilisierungFrame = 0;
    let stabilisierungGeneration = 0;
    let basis = {
      height: Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height),
      width: viewport.width,
    };
    let tastaturPhaseAktiv = false;
    let sichtbarerRectAnker = null;
    let suchleistenShiftY = 0;
    const scrollProvenienz = erstelleScrollProvenienz();
    const suchphaseRelevant = () => tastaturPhaseAktiv
      || document.activeElement === eingabe
      || form.contains(document.activeElement);
    const normalisiere = () => {
      scrollProvenienz.normalisiere();
      sichtbarerRectAnker = null;
      suchleistenShiftY = 0;
      raeumeViewportPosition(form);
    };
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

        const warTastaturPhaseAktiv = tastaturPhaseAktiv;
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
          sichtbarerRectAnker = null;
          suchleistenShiftY = 0;
          raeumeViewportPosition(form);
          const wartetAufKeyboard = suchfokus && !warTastaturPhaseAktiv
            && neutraleSkalierung && !breiteGeaendert && volleGeometrie;
          if (!wartetAufKeyboard) scrollProvenienz.normalisiere();
          return;
        }

        if (scrollProvenienz.istKeyboardAuto() && form.classList.contains("tastatur-offen")) {
          form.classList.add("tastatur-autoscroll");
          const rect = form.getBoundingClientRect();
          if (!sichtbarerRectAnker) sichtbarerRectAnker = { bottom: rect.bottom };
          const ausgleich = berechneSuchleistenRectDrift({
            ankerUnterkante: sichtbarerRectAnker.bottom,
            aktuelleUnterkante: rect.bottom,
            aktuellerShift: suchleistenShiftY,
          });
          if (Math.abs(ausgleich.driftY) >= 0.5) {
            suchleistenShiftY = ausgleich.shiftY;
            form.style.setProperty("--kd-suche-viewport-shift", `${suchleistenShiftY}px`);
          }
          return;
        }
        form.classList.remove("tastatur-autoscroll");

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
        suchleistenShiftY = 0;
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
        suchleistenShiftY = geometrie.shiftY;
        form.style.setProperty("--kd-suche-viewport-shift", `${suchleistenShiftY}px`);
        form.style.setProperty("--kd-suche-ergebnis-maxhoehe", `${geometrie.ergebnisMaxHoehe}px`);
        sichtbarerRectAnker = { bottom: form.getBoundingClientRect().bottom };
      });
    };
    const markiereNutzerabsicht = () => {
      scrollProvenienz.markiereNutzerabsicht();
      sichtbarerRectAnker = null;
      form.classList.remove("tastatur-autoscroll");
      aktualisiere();
    };
    const beobachteViewportBewegung = () => {
      if (suchphaseRelevant() && form.classList.contains("tastatur-offen")
        && !scrollProvenienz.istNutzerabsicht()) {
        scrollProvenienz.markiereKeyboardAuto();
      }
      aktualisiere();
    };
    const startePointer = (event) => {
      if (!suchphaseRelevant() && !form.contains(event.target)) return;
      scrollProvenienz.starteKontakt("pointer", event.pointerId, event.clientX, event.clientY);
    };
    const bewegePointer = (event) => {
      if (!suchphaseRelevant()) return;
      if (scrollProvenienz.bewegeKontakt("pointer", event.pointerId, event.clientX, event.clientY)) {
        markiereNutzerabsicht();
      }
    };
    const endePointer = (event) => scrollProvenienz.endeKontakt("pointer", event.pointerId);
    const starteTouch = (event) => {
      if (!suchphaseRelevant() && !form.contains(event.target)) return;
      for (const touch of Array.from(event.changedTouches || [])) {
        scrollProvenienz.starteKontakt("touch", touch.identifier, touch.clientX, touch.clientY);
      }
    };
    const bewegeTouch = (event) => {
      if (!suchphaseRelevant()) return;
      for (const touch of Array.from(event.changedTouches || [])) {
        if (scrollProvenienz.bewegeKontakt("touch", touch.identifier, touch.clientX, touch.clientY)) {
          markiereNutzerabsicht();
        }
      }
    };
    const endeTouch = (event) => {
      for (const touch of Array.from(event.changedTouches || [])) {
        scrollProvenienz.endeKontakt("touch", touch.identifier);
      }
    };
    const beobachteWheel = () => {
      if (suchphaseRelevant()) markiereNutzerabsicht();
    };
    const beobachteScrollTaste = (event) => {
      if (!event.defaultPrevented && suchphaseRelevant() && istScrollTaste(event.key)
        && !istEditierbaresOderInteraktivesZiel(event.target)) markiereNutzerabsicht();
    };
    const stabilisiereFokuswechsel = () => {
      const generation = ++stabilisierungGeneration;
      cancelAnimationFrame(stabilisierungFrame);
      let verbleibend = VIEWPORT_STABILISIERUNGS_FRAMES;
      const sample = () => {
        if (generation !== stabilisierungGeneration) return;
        aktualisiere();
        verbleibend -= 1;
        if (verbleibend > 0) stabilisierungFrame = requestAnimationFrame(sample);
      };
      stabilisierungFrame = requestAnimationFrame(sample);
    };
    viewportUpdateRef.current = aktualisiere;
    viewport.addEventListener("resize", beobachteViewportBewegung);
    viewport.addEventListener("scroll", beobachteViewportBewegung);
    window.addEventListener("resize", beobachteViewportBewegung);
    window.addEventListener("scroll", beobachteViewportBewegung, { passive: true });
    document.addEventListener("pointerdown", startePointer, { passive: true });
    document.addEventListener("pointermove", bewegePointer, { passive: true });
    document.addEventListener("pointerup", endePointer, { passive: true });
    document.addEventListener("pointercancel", endePointer, { passive: true });
    document.addEventListener("touchstart", starteTouch, { passive: true });
    document.addEventListener("touchmove", bewegeTouch, { passive: true });
    document.addEventListener("touchend", endeTouch, { passive: true });
    document.addEventListener("touchcancel", endeTouch, { passive: true });
    document.addEventListener("wheel", beobachteWheel, { passive: true });
    document.addEventListener("keydown", beobachteScrollTaste);
    /* WebKit liefert die Keyboard-Geometrie teils erst nach dem Focus-Frame,
       ohne sofort ein VisualViewport-Resize auszulösen. Eine kurze, begrenzte
       Samplingphase schließt dieses Loch; dauerhaftes Polling gibt es nicht. */
    eingabe.addEventListener("focus", stabilisiereFokuswechsel);
    eingabe.addEventListener("blur", stabilisiereFokuswechsel);
    aktualisiere();
    return () => {
      cancelAnimationFrame(frame);
      stabilisierungGeneration += 1;
      cancelAnimationFrame(stabilisierungFrame);
      viewport.removeEventListener("resize", beobachteViewportBewegung);
      viewport.removeEventListener("scroll", beobachteViewportBewegung);
      window.removeEventListener("resize", beobachteViewportBewegung);
      window.removeEventListener("scroll", beobachteViewportBewegung);
      document.removeEventListener("pointerdown", startePointer);
      document.removeEventListener("pointermove", bewegePointer);
      document.removeEventListener("pointerup", endePointer);
      document.removeEventListener("pointercancel", endePointer);
      document.removeEventListener("touchstart", starteTouch);
      document.removeEventListener("touchmove", bewegeTouch);
      document.removeEventListener("touchend", endeTouch);
      document.removeEventListener("touchcancel", endeTouch);
      document.removeEventListener("wheel", beobachteWheel);
      document.removeEventListener("keydown", beobachteScrollTaste);
      eingabe.removeEventListener("focus", stabilisiereFokuswechsel);
      eingabe.removeEventListener("blur", stabilisiereFokuswechsel);
      tastaturPhaseAktiv = false;
      normalisiere();
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
