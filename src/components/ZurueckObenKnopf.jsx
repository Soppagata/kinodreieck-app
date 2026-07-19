import { useState, useEffect } from "react";
import { T } from "../lib/tokens.js";

/* „Zurück nach oben" (Block 3 Polish, Max 2026-07-19): schwebender Knopf unten
   rechts, erscheint ab ~600px Scrolltiefe. Lange Bereiche (Kino/Mediathek)
   sind sonst mühsam zurückzuscrollen. z unter dem Menü-Popup (60) → wird beim
   Öffnen des Drawers verdeckt, blockiert nichts. prefers-reduced-motion: harter
   Sprung statt smooth. */
export function ZurueckObenKnopf() {
  const [zeig, setZeig] = useState(false);
  useEffect(() => {
    const onScroll = () => setZeig((window.scrollY || document.documentElement.scrollTop || 0) > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!zeig) return null;
  const reduziert = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hoch = () => {
    try { window.scrollTo({ top: 0, behavior: reduziert ? "auto" : "smooth" }); }
    catch { window.scrollTo(0, 0); }
  };
  return (
    <button className="kd-nachoben" aria-label="Zurück nach oben" title="Zurück nach oben" onClick={hoch}
      style={{ background: T.saalHoch, color: T.wolfram, border: "1px solid " + T.rauch }}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 5.6l7.1 7.1-1.43 1.43L13 9.06V19h-2V9.06l-4.67 5.07L4.9 12.7 12 5.6z" />
      </svg>
    </button>
  );
}
