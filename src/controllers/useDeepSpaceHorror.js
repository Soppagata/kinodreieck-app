/* Flüchtiger Deep-Space-Horror-Effekt: Der gespeicherte Darstellungsmodus bleibt
   immer Neon Noir. Gewürfelt wird ausschließlich bei einem echten Eintritt —
   App-Start mit gespeichertem Neon oder bewusstes Einschalten. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEEP_SPACE_HORROR_ID,
  pruefeDeepSpaceEintritt,
} from "../lib/deepSpaceHorror.js";

const aktuelleZeit = () => new Date();
const browserZufall = () => Math.random();

export function deepSpaceOwnerKey(session) {
  const kontoId = session?.mode === "account" ? String(session.account?.id || "").trim() : "";
  return kontoId ? `konto:${kontoId}` : "gast";
}

function browserStorage() {
  try { return window.localStorage; }
  catch { return null; }
}

export function useDeepSpaceHorror({
  achievements,
  bootDone,
  neonNoirAktiv,
  manuellerEintritt,
  ownerKey,
  jetzt = aktuelleZeit,
  zufall = browserZufall,
  storage = null,
}) {
  const [deepSpaceAktiv, setDeepSpaceAktiv] = useState(false);
  const bootGeprueftRef = useRef(false);
  const manuellerEintrittRef = useRef(manuellerEintritt);
  const ownerRef = useRef(ownerKey);

  const versucheEintritt = useCallback(() => {
    if (!achievements?.has?.(DEEP_SPACE_HORROR_ID)) return null;
    const rhythmusStorage = storage || browserStorage();
    const ergebnis = pruefeDeepSpaceEintritt({
      jetzt: jetzt(),
      zufall,
      storage: rhythmusStorage,
      ownerKey,
    });
    if (ergebnis.treffer) setDeepSpaceAktiv(true);
    return ergebnis;
  }, [achievements, jetzt, ownerKey, storage, zufall]);

  /* Ein gespeicherter Neon-Modus zählt genau einmal pro App-Lauf als Eintritt.
     Wird ein Altbestand erst während dieses Boots still freigeschaltet, ist
     dieser Eintritt bereits vorbei; der erste Wurf folgt beim nächsten Start. */
  useEffect(() => {
    if (bootGeprueftRef.current || !bootDone || achievements == null) return;
    bootGeprueftRef.current = true;
    if (neonNoirAktiv && achievements.has(DEEP_SPACE_HORROR_ID)) versucheEintritt();
  }, [achievements, bootDone, neonNoirAktiv, versucheEintritt]);

  /* Das Serial ändert sich nur beim bewussten Wechsel von Saal/Foyer/Showa zu
     Neon Noir. Achievement-Änderungen oder Re-Renders erzeugen keinen Eintritt. */
  useEffect(() => {
    if (manuellerEintrittRef.current === manuellerEintritt) return;
    if (!bootDone || achievements == null) return;
    manuellerEintrittRef.current = manuellerEintritt;
    if (neonNoirAktiv && achievements.has(DEEP_SPACE_HORROR_ID)) versucheEintritt();
  }, [achievements, bootDone, manuellerEintritt, neonNoirAktiv, versucheEintritt]);

  /* Profilwechsel erzeugen keinen zusätzlichen Wurf und übernehmen niemals den
     flüchtigen Effekt eines anderen Owners. */
  useEffect(() => {
    if (ownerRef.current === ownerKey) return;
    ownerRef.current = ownerKey;
    setDeepSpaceAktiv(false);
  }, [ownerKey]);

  useEffect(() => {
    if (!neonNoirAktiv) setDeepSpaceAktiv(false);
  }, [neonNoirAktiv]);

  return { deepSpaceAktiv };
}
