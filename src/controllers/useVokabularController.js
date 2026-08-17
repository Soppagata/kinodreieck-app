import { useEffect } from "react";

import { setzeEigeneStimmungen } from "../lib/finder.js";
import { vokabularZuMap } from "../lib/vokabular.js";
import { K } from "../services/storage.js";
import { useConfirmedStorageState } from "./useConfirmedStorageState.js";

const normalisiereVokabular = (wert) => {
  if (!Array.isArray(wert)) throw new TypeError("Vokabular muss eine Liste sein.");
  return wert;
};

export function useVokabularController({ setErr }) {
  const {
    wert: vokabular,
    uebernehmeBestaetigt: setVokabular,
    schreibe: saveVokabular,
  } = useConfirmedStorageState({
    key: K.vokabular,
    initial: [],
    normalisiere: normalisiereVokabular,
    setErr,
    fehlermeldung: "Vokabular konnte nicht gespeichert werden. Die Änderung wurde nicht übernommen.",
  });

  useEffect(() => {
    setzeEigeneStimmungen(vokabularZuMap(vokabular));
  }, [vokabular]);

  return { vokabular, setVokabular, saveVokabular };
}
