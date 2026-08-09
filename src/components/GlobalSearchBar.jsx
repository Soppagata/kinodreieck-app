import { useEffect, useRef, useState } from "react";

const LABELS = Object.freeze({
  start: "Alles", kino: "Kino", mediathek: "Mediathek", streaming: "Streaming",
  blog: "Entdecken", finder: "Alles", daten: "Settings",
});

export function GlobalSearchBar({
  bereich, onSuchen, antwort, onAntwortSchliessen, onTreffer, onAlleErgebnisse,
  menuOffen = false, onMenu, onSuchaktion, beobachteteIds = [], radarTargetIds = [],
}) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const formRef = useRef(null);
  const eingabeRef = useRef(null);
  const dialogRef = useRef(null);
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
    requestAnimationFrame(() => eingabeRef.current?.focus());
  };
  useEffect(() => {
    if (!antwort) return undefined;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === eingabeRef.current) return;
      const ersterTreffer = dialogRef.current?.querySelector("[data-globaler-suchtreffer], .kd-globalsuche-alle");
      ersterTreffer?.focus?.();
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
    let basisHoehe = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height);
    const aktualisiere = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const fokus = document.activeElement === eingabe;
        if (!fokus) basisHoehe = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height);
        const tastaturOffen = fokus && basisHoehe - viewport.height > 120;
        form.classList.toggle("tastatur-offen", tastaturOffen);
        if (tastaturOffen) {
          /* iOS lässt `position:fixed; bottom:…` bei offener Tastatur teils am
             Layout-Viewport hängen. Die Verschiebung wird deshalb aus der
             tatsächlich gerenderten Unterkante berechnet und an die absolute
             Unterkante des Visual Viewports gebunden. Das bleibt auch beim
             Panning/Scrollen stabil und funktioniert ebenso in Browsern, die
             Fixed-Elemente bereits selbst über der Tastatur halten. */
          form.style.setProperty("--kd-suche-viewport-shift", "0px");
          const basisUnterkante = form.getBoundingClientRect().bottom;
          const zielUnterkante = viewport.offsetTop + viewport.height - 8;
          form.style.setProperty("--kd-suche-viewport-shift", `${zielUnterkante - basisUnterkante}px`);
        } else form.style.removeProperty("--kd-suche-viewport-shift");
      });
    };
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
