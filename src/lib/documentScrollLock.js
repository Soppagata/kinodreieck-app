/* Gemeinsame Scrollsperre für mobile Overlays.
   Mehrere direkt aufeinanderfolgende Dialoge dürfen sich beim Auf-/Abbau nicht
   gegenseitig den gespeicherten Body-Zustand überschreiben. */

let sperren = 0;
let vorher = null;

function restauriere() {
  if (!vorher || typeof document === "undefined") return;
  const stand = vorher;
  vorher = null;
  const body = document.body;
  body.style.overflow = stand.overflow;
  body.style.position = stand.position;
  body.style.top = stand.top;
  body.style.left = stand.left;
  body.style.right = stand.right;
  body.style.width = stand.width;
  document.documentElement.classList.remove("kd-scroll-gesperrt");
  body.classList.remove("kd-scroll-gesperrt");
  try { window.scrollTo(0, stand.scrollY); } catch { /* jsdom oder alter Browser */ }
}

export function sperreDokumentScroll() {
  if (typeof document === "undefined" || !document.body) return () => {};
  if (sperren === 0) {
    const body = document.body;
    vorher = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      scrollY: typeof window !== "undefined" ? window.scrollY || 0 : 0,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${vorher.scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    document.documentElement.classList.add("kd-scroll-gesperrt");
    body.classList.add("kd-scroll-gesperrt");
  }
  sperren += 1;
  let offen = true;
  return () => {
    if (!offen) return;
    offen = false;
    sperren = Math.max(0, sperren - 1);
    if (sperren === 0) restauriere();
  };
}

/* Sicherheitsnetz für einen bereits entfernten Overlay-Baum. Aktive Sperren
   werden nie gewaltsam geöffnet. */
export function bereinigeDokumentScroll() {
  if (sperren === 0) restauriere();
}

export function dokumentScrollGesperrt() { return sperren > 0; }
