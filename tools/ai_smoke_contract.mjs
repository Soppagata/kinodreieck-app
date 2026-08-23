/* Reiner Zustandsvertrag fuer die serielle Live-Pfadfolge.
   Keine Netzwerk-, Provider- oder Persistenzwirkung. */

function normalisiereErwartetePfade(erwartetePfade) {
  if (!Array.isArray(erwartetePfade) || erwartetePfade.length < 1
      || erwartetePfade.some((pfad) => typeof pfad !== "string" || !pfad)
      || new Set(erwartetePfade).size !== erwartetePfade.length) {
    throw new Error("Erwartete Anbieterpfade sind nicht eindeutig festgelegt.");
  }
  return Object.freeze([...erwartetePfade]);
}

export function erstelleAnbieterPfadBelege(erwartetePfade) {
  const erwartet = normalisiereErwartetePfade(erwartetePfade);
  const ausgefuehrt = [];
  const unbelegt = [];

  return Object.freeze({
    registriere(pfad) {
      const soll = erwartet[ausgefuehrt.length];
      if (pfad !== soll) {
        throw new Error(
          `Live-Pfadfolge driftet: erwartet ${soll || "Laufende"}, erhalten ${pfad}.`,
        );
      }
      ausgefuehrt.push(pfad);
    },

    erfasseProviderCapture(pfad, capture) {
      const istUnbelegt = capture?.proofState === "unproven"
        && capture.captureState === "pending-no-raw"
        && capture.providerRequests === 0;
      if (!istUnbelegt) return;
      if (ausgefuehrt.at(-1) !== pfad || unbelegt.includes(pfad)) {
        throw new Error("Unbelegter Providerpfad ist nicht eindeutig an den laufenden Pfad gebunden.");
      }
      unbelegt.push(pfad);
    },

    abschluss() {
      const pfadeVollstaendig = JSON.stringify(ausgefuehrt) === JSON.stringify(erwartet);
      const providerBelegeVollstaendig = unbelegt.length === 0;
      return Object.freeze({
        ok: pfadeVollstaendig && providerBelegeVollstaendig,
        pfadeVollstaendig,
        providerBelegeVollstaendig,
        ausgefuehrt: Object.freeze([...ausgefuehrt]),
        erwartet,
        unbelegt: Object.freeze([...unbelegt]),
      });
    },
  });
}
