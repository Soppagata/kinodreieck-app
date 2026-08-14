export const VIEWPORT_RAND = 8;
export const MIN_TASTATUR_HOEHENVERLUST = 120;

const endlicheZahl = (wert, fallback = 0) => (
  Number.isFinite(Number(wert)) ? Number(wert) : fallback
);

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
