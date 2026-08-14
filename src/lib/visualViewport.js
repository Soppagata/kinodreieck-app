export const VIEWPORT_RAND = 8;
export const MIN_TASTATUR_HOEHENVERLUST = 120;

const endlicheZahl = (wert, fallback = 0) => (
  Number.isFinite(Number(wert)) ? Number(wert) : fallback
);

export function istNeutraleViewportSkalierung(scale, toleranz = 0.02) {
  return Math.abs(endlicheZahl(scale, 1) - 1) <= toleranz;
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
  rand = VIEWPORT_RAND,
}) {
  const viewportHoehe = Math.max(0, endlicheZahl(height));
  const viewportBreite = Math.max(0, endlicheZahl(width));
  const oben = endlicheZahl(offsetTop);
  const links = endlicheZahl(offsetLeft);
  const unterkante = endlicheZahl(basisUnterkante);
  const leistenHoehe = Math.max(0, endlicheZahl(suchleistenHoehe));
  const sichererRand = Math.max(0, endlicheZahl(rand, VIEWPORT_RAND));
  const zielUnterkante = oben + viewportHoehe - sichererRand;

  return Object.freeze({
    links: links + sichererRand,
    breite: Math.max(0, viewportBreite - (2 * sichererRand)),
    shiftY: zielUnterkante - unterkante,
    ergebnisMaxHoehe: Math.max(0, viewportHoehe - leistenHoehe - (3 * sichererRand)),
    anker: zielUnterkante - oben - viewportHoehe,
  });
}
