import { useEffect, useRef, useState } from "react";

const LABELS = Object.freeze({
  start: "Alles", kino: "Kino", mediathek: "Mediathek", streaming: "Streaming",
  blog: "Blog", finder: "Alles", daten: "Settings",
});

export function GlobalSearchBar({
  bereich, onSuchen, antwort, onAntwortSchliessen, onTreffer, onAlleErgebnisse,
  menuOffen = false, onMenu,
}) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const formRef = useRef(null);
  const eingabeRef = useRef(null);
  const dialogRef = useRef(null);
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
    let basisHoehe = Math.max(window.innerHeight, viewport.height);
    const aktualisiere = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const fokus = document.activeElement === eingabe;
        if (!fokus) basisHoehe = Math.max(basisHoehe, window.innerHeight, viewport.height);
        const tastaturOffen = fokus && basisHoehe - viewport.height > 120;
        form.classList.toggle("tastatur-offen", tastaturOffen);
        if (tastaturOffen) {
          const hoehe = form.getBoundingClientRect().height;
          form.style.setProperty("--kd-suche-viewport-top", `${Math.max(8, viewport.offsetTop + viewport.height - hoehe - 8)}px`);
        } else form.style.removeProperty("--kd-suche-viewport-top");
      });
    };
    viewport.addEventListener("resize", aktualisiere);
    viewport.addEventListener("scroll", aktualisiere);
    window.addEventListener("resize", aktualisiere);
    eingabe.addEventListener("focus", aktualisiere);
    eingabe.addEventListener("blur", aktualisiere);
    aktualisiere();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", aktualisiere);
      viewport.removeEventListener("scroll", aktualisiere);
      window.removeEventListener("resize", aktualisiere);
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
              <button type="button" key={item.key} data-globaler-suchtreffer onClick={() => onTreffer?.(item)}>
                <span>{item.bereichLabel}</span>
                <strong>{item.titel}</strong>
                {item.meta ? <small>{item.meta}</small> : null}
              </button>
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
