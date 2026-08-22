import { strict as assert } from "node:assert";
import {
  VIEWPORT_RAND,
  MIN_TASTATUR_HOEHENVERLUST,
  SCROLL_PROVENIENZ,
  erstelleScrollProvenienz,
  istNeutraleViewportSkalierung,
  istScrollTaste,
  klassifiziereBildschirmtastatur,
  berechneSuchleistenGeometrie,
} from "./src/lib/visualViewport.js";

const pruefe = (beschreibung, fn) => {
  try {
    fn();
    console.log(`ok: ${beschreibung}`);
  } catch (error) {
    console.error(`fail: ${beschreibung}`);
    console.error(error);
    process.exitCode = 1;
  }
};

pruefe("neutrale Skalierung akzeptiert scale rund um 1", () => {
  assert.equal(istNeutraleViewportSkalierung(1.001), true);
  assert.equal(istNeutraleViewportSkalierung(1.019), true);
  assert.equal(istNeutraleViewportSkalierung(0.981), true);
});

pruefe("Keyboard-Autoscroll bleibt ohne echte Bewegungsabsicht getrennt", () => {
  const provenienz = erstelleScrollProvenienz();
  provenienz.starteKontakt("touch", 4, 120, 540);
  assert.equal(provenienz.bewegeKontakt("touch", 4, 124, 545), false);
  assert.equal(provenienz.markiereKeyboardAuto(), SCROLL_PROVENIENZ.KEYBOARD_AUTO);
  assert.equal(provenienz.istKeyboardAuto(), true);
  assert.equal(provenienz.istNutzerabsicht(), false);
});

pruefe("Touch-/Pointer-Bewegung über der Schwelle gewinnt gegen Keyboard-Autoscroll", () => {
  const provenienz = erstelleScrollProvenienz({ bewegungsschwelle: 8 });
  provenienz.markiereKeyboardAuto();
  provenienz.starteKontakt("pointer", 7, 20, 20);
  assert.equal(provenienz.bewegeKontakt("pointer", 7, 20, 27), false);
  assert.equal(provenienz.bewegeKontakt("pointer", 7, 20, 28), true);
  assert.equal(provenienz.istNutzerabsicht(), true);
  provenienz.markiereKeyboardAuto();
  assert.equal(provenienz.modus(), SCROLL_PROVENIENZ.NUTZER);
  provenienz.endeKontakt("pointer", 7);
  assert.equal(provenienz.bewegeKontakt("pointer", 7, 20, 40), false);
});

pruefe("Wheel/Scrolltaste können Nutzerabsicht markieren und Recovery normalisiert", () => {
  const provenienz = erstelleScrollProvenienz();
  for (const taste of ["ArrowDown", "PageUp", "Home", "End", " "]) {
    assert.equal(istScrollTaste(taste), true, taste);
  }
  assert.equal(istScrollTaste("a"), false);
  provenienz.markiereNutzerabsicht();
  assert.equal(provenienz.modus(), SCROLL_PROVENIENZ.NUTZER);
  provenienz.normalisiere();
  assert.equal(provenienz.modus(), SCROLL_PROVENIENZ.NEUTRAL);
});

pruefe("klassifizierte Tastatur bleibt aktiv bei Fokus, scale ~1 und ausreichend großem Höhenverlust", () => {
  const istTastatur = klassifiziereBildschirmtastatur({
    editierbarerFokus: true,
    scale: 1.01,
    height: 600,
    width: 390,
    layoutHeight: 900,
    basisHeight: 900,
    basisWidth: 402,
    mindestHoehenverlust: MIN_TASTATUR_HOEHENVERLUST,
  });
  assert.equal(istTastatur, true);
});

pruefe("klassifizierte Tastatur bleibt aus ohne editierbaren Fokus", () => {
  const istTastatur = klassifiziereBildschirmtastatur({
    editierbarerFokus: false,
    scale: 1.01,
    height: 600,
    width: 390,
    layoutHeight: 900,
    basisHeight: 900,
    basisWidth: 402,
  });
  assert.equal(istTastatur, false);
});

pruefe("fokussierter Pinch mit scale>1, kleinerer Breite/Height und offsetLeft>0 bleibt aus", () => {
  const istTastatur = klassifiziereBildschirmtastatur({
    editierbarerFokus: true,
    scale: 1.4,
    height: 500,
    width: 340,
    layoutHeight: 600,
    basisHeight: 600,
    basisWidth: 402,
  });
  assert.equal(istTastatur, false);
});

pruefe("Breiten-/Rotationswechsel gegenüber neutraler Basis bleibt aus", () => {
  const istTastatur = klassifiziereBildschirmtastatur({
    editierbarerFokus: true,
    scale: 1,
    height: 600,
    width: 300,
    layoutHeight: 780,
    basisHeight: 780,
    basisWidth: 410,
  });
  assert.equal(istTastatur, false);
});

pruefe("Suchleisten-Geometrie nutzt rand- und sichtbare viewportbezugene Kanten korrekt", () => {
  const geometrie = berechneSuchleistenGeometrie({
    height: 568,
    width: 320,
    offsetTop: 24,
    offsetLeft: 8,
    basisUnterkante: 820,
    suchleistenHoehe: 62,
    safeAreaInsets: { top: 2, right: 3, bottom: 7, left: 4 },
  });
  assert.equal(geometrie.links, 16);
  assert.equal(geometrie.breite, 304);
  assert.equal(geometrie.shiftY, 24 + 568 - Math.max(VIEWPORT_RAND, 7) - 820);
  assert.equal(geometrie.anker, -Math.max(VIEWPORT_RAND, 7));
  assert.equal(geometrie.raender.links, VIEWPORT_RAND);
  assert.equal(geometrie.raender.rechts, VIEWPORT_RAND);
  assert.equal(geometrie.raender.oben, VIEWPORT_RAND);
  assert.equal(geometrie.raender.unten, Math.max(VIEWPORT_RAND, 7));
});

pruefe("rect.bottom - offsetTop - viewportHeight folgt dem stabilen Anker", () => {
  const basisUnterkante = 810;
  const geometrie = berechneSuchleistenGeometrie({
    height: 560,
    width: 360,
    offsetTop: 40,
    offsetLeft: 0,
    basisUnterkante,
    suchleistenHoehe: 58,
    safeAreaInsets: { top: 0, right: 0, bottom: 18, left: 0 },
  });
  const positionierteBottom = basisUnterkante + geometrie.shiftY;
  const erwarteterAnker = 40 + 560 - 18 - 810;
  assert.equal(positionierteBottom - 40 - 560, -18);
  assert.equal(geometrie.shiftY, erwarteterAnker);
  assert.equal(positionierteBottom, 810 + erwarteterAnker);
});

pruefe("offsetTop +80 verändert Shift unverändert nur um +80", () => {
  const base = berechneSuchleistenGeometrie({
    height: 560,
    width: 360,
    offsetTop: 0,
    offsetLeft: 0,
    basisUnterkante: 810,
    suchleistenHoehe: 58,
    safeAreaInsets: { top: 0, right: 0, bottom: 12, left: 0 },
  });
  const verschoben = berechneSuchleistenGeometrie({
    height: 560,
    width: 360,
    offsetTop: 80,
    offsetLeft: 0,
    basisUnterkante: 810,
    suchleistenHoehe: 58,
    safeAreaInsets: { top: 0, right: 0, bottom: 12, left: 0 },
  });
  assert.equal(verschoben.shiftY - base.shiftY, 80);
});

pruefe("ergebnisMaxHoehe ist nicht-negativ und folgt der sichtbaren Höhe + Rändern", () => {
  const geometrie = berechneSuchleistenGeometrie({
    height: 500,
    width: 360,
    offsetTop: 12,
    offsetLeft: 6,
    basisUnterkante: 810,
    suchleistenHoehe: 82,
    safeAreaInsets: { top: 7, right: 0, bottom: 30, left: 3 },
  });
  const erwarteteMaxHoehe = Math.max(0, 500 - 82 - Math.max(7, 8) - Math.max(30, 8) - VIEWPORT_RAND);
  assert.equal(geometrie.ergebnisMaxHoehe, erwarteteMaxHoehe);
  assert.ok(geometrie.ergebnisMaxHoehe >= 0);
});

pruefe("Safe-Area-Ränder nutzen exakt max(8, inset), kein +8 auf kleine Insets", () => {
  const kleine = berechneSuchleistenGeometrie({
    height: 812,
    width: 390,
    offsetTop: 0,
    offsetLeft: 0,
    basisUnterkante: 900,
    suchleistenHoehe: 88,
    safeAreaInsets: { top: 1, right: 3, bottom: 4, left: 6 },
  });
  assert.equal(kleine.raender.oben, 8);
  assert.equal(kleine.raender.rechts, 8);
  assert.equal(kleine.raender.unten, 8);
  assert.equal(kleine.raender.links, 8);

  const grosse = berechneSuchleistenGeometrie({
    height: 812,
    width: 390,
    offsetTop: 0,
    offsetLeft: 0,
    basisUnterkante: 900,
    suchleistenHoehe: 88,
    safeAreaInsets: { top: 20, right: 23, bottom: 29, left: 31 },
  });
  assert.equal(grosse.raender.oben, 20);
  assert.equal(grosse.raender.rechts, 23);
  assert.equal(grosse.raender.unten, 29);
  assert.equal(grosse.raender.links, 31);
});

pruefe("nicht-finite Skalen sind fail-closed", () => {
  assert.equal(istNeutraleViewportSkalierung(NaN), false);
  assert.equal(istNeutraleViewportSkalierung(Infinity), false);
  const pinched = klassifiziereBildschirmtastatur({
    editierbarerFokus: true,
    scale: Infinity,
    height: 600,
    width: 390,
    layoutHeight: 900,
    basisHeight: 900,
    basisWidth: 390,
  });
  assert.equal(pinched, false);
});

if (process.exitCode) {
  process.exit(1);
}
