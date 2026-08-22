export const VIEWPORT_RAND = 8;
export const MIN_TASTATUR_HOEHENVERLUST = 120;
export const SCROLL_ABSICHT_SCHWELLE = 8;
export const SCROLL_PROVENIENZ = Object.freeze({
  NEUTRAL: "neutral",
  KEYBOARD_AUTO: "keyboard-auto",
  NUTZER: "nutzer",
});

const SCROLL_TASTEN = new Set([
  "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp",
  "End", "Home", "PageDown", "PageUp", " ", "Spacebar",
]);

const endlicheZahl = (wert, fallback = 0) => (
  Number.isFinite(Number(wert)) ? Number(wert) : fallback
);

export function istScrollTaste(taste) {
  return SCROLL_TASTEN.has(String(taste || ""));
}

/* Scroll-Events besitzen weder in Safari noch im VisualViewport eine belastbare
   Quelle. Diese kleine Zustandsmaschine wertet deshalb nur eine echte, vorher
   beobachtete Absicht als Nutzerscroll: Bewegung über der Schwelle, Wheel oder
   Scrolltaste. Ein Fokus-/Keyboard-Scroll ohne solche Absicht bleibt davon
   getrennt und darf die bereits sichtbare Suchleiste nicht weiterziehen. */
export function erstelleScrollProvenienz({
  bewegungsschwelle = SCROLL_ABSICHT_SCHWELLE,
} = {}) {
  const schwelle = Math.max(1, endlicheZahl(bewegungsschwelle, SCROLL_ABSICHT_SCHWELLE));
  const kontakte = new Map();
  let modus = SCROLL_PROVENIENZ.NEUTRAL;
  const kontaktKey = (typ, id) => `${String(typ || "pointer")}:${String(id ?? "0")}`;
  return Object.freeze({
    starteKontakt(typ, id, x, y) {
      kontakte.set(kontaktKey(typ, id), { x: endlicheZahl(x), y: endlicheZahl(y) });
      return modus;
    },
    bewegeKontakt(typ, id, x, y) {
      const start = kontakte.get(kontaktKey(typ, id));
      if (!start) return false;
      const deltaX = endlicheZahl(x) - start.x;
      const deltaY = endlicheZahl(y) - start.y;
      if (Math.hypot(deltaX, deltaY) < schwelle) return false;
      modus = SCROLL_PROVENIENZ.NUTZER;
      return true;
    },
    endeKontakt(typ, id) {
      kontakte.delete(kontaktKey(typ, id));
      return modus;
    },
    markiereNutzerabsicht() {
      modus = SCROLL_PROVENIENZ.NUTZER;
      return modus;
    },
    markiereKeyboardAuto() {
      if (modus !== SCROLL_PROVENIENZ.NUTZER) modus = SCROLL_PROVENIENZ.KEYBOARD_AUTO;
      return modus;
    },
    normalisiere() {
      kontakte.clear();
      modus = SCROLL_PROVENIENZ.NEUTRAL;
      return modus;
    },
    modus() { return modus; },
    istKeyboardAuto() { return modus === SCROLL_PROVENIENZ.KEYBOARD_AUTO; },
    istNutzerabsicht() { return modus === SCROLL_PROVENIENZ.NUTZER; },
  });
}

export function istNeutraleViewportSkalierung(scale, toleranz = 0.02) {
  const skalierung = Number(scale);
  return Number.isFinite(skalierung) && Math.abs(skalierung - 1) <= toleranz;
}

export function klassifiziereBildschirmtastatur({
  editierbarerFokus,
  scale,
  height,
  width,
  layoutHeight,
  basisHeight,
  basisWidth,
  mindestHoehenverlust = MIN_TASTATUR_HOEHENVERLUST,
}) {
  const viewportHoehe = endlicheZahl(height);
  const viewportBreite = endlicheZahl(width);
  const basisHoehe = endlicheZahl(basisHeight, viewportHoehe);
  const layoutHoehe = endlicheZahl(layoutHeight, viewportHoehe);
  const basisBreite = endlicheZahl(basisWidth, viewportBreite);
  const breiteToleranz = Math.max(2, basisBreite * 0.04);

  return Boolean(editierbarerFokus)
    && istNeutraleViewportSkalierung(scale)
    && basisHoehe - viewportHoehe > mindestHoehenverlust
    && layoutHoehe - viewportHoehe > mindestHoehenverlust
    && Math.abs(basisBreite - viewportBreite) <= breiteToleranz;
}

export function berechneSuchleistenGeometrie({
  height,
  width,
  offsetTop,
  offsetLeft,
  basisUnterkante,
  suchleistenHoehe,
  safeAreaInsets = {},
  rand = VIEWPORT_RAND,
}) {
  const viewportHoehe = Math.max(0, endlicheZahl(height));
  const viewportBreite = Math.max(0, endlicheZahl(width));
  const oben = endlicheZahl(offsetTop);
  const links = endlicheZahl(offsetLeft);
  const unterkante = endlicheZahl(basisUnterkante);
  const leistenHoehe = Math.max(0, endlicheZahl(suchleistenHoehe));
  const sichererRand = Math.max(0, endlicheZahl(rand, VIEWPORT_RAND));
  const raender = Object.freeze({
    oben: Math.max(sichererRand, Math.max(0, endlicheZahl(safeAreaInsets.top))),
    rechts: Math.max(sichererRand, Math.max(0, endlicheZahl(safeAreaInsets.right))),
    unten: Math.max(sichererRand, Math.max(0, endlicheZahl(safeAreaInsets.bottom))),
    links: Math.max(sichererRand, Math.max(0, endlicheZahl(safeAreaInsets.left))),
  });
  const zielUnterkante = oben + viewportHoehe - raender.unten;

  return Object.freeze({
    links: links + raender.links,
    breite: Math.max(0, viewportBreite - raender.links - raender.rechts),
    shiftY: zielUnterkante - unterkante,
    ergebnisMaxHoehe: Math.max(0,
      viewportHoehe - leistenHoehe - raender.oben - raender.unten - sichererRand),
    anker: zielUnterkante - oben - viewportHoehe,
    raender,
  });
}

export function berechneSuchleistenRectDrift({
  ankerUnterkante,
  aktuelleUnterkante,
  aktuellerShift = 0,
} = {}) {
  const shift = endlicheZahl(aktuellerShift);
  const anker = Number(ankerUnterkante);
  const aktuell = Number(aktuelleUnterkante);
  if (!Number.isFinite(anker) || !Number.isFinite(aktuell)) {
    return Object.freeze({ driftY: 0, shiftY: shift });
  }
  const driftY = anker - aktuell;
  return Object.freeze({ driftY, shiftY: shift + driftY });
}
