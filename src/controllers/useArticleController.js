import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  K,
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../services/storage.js";
import { normalisiereArtikelTypen } from "../lib/artikel.js";
import { recoverInterruptedPublication } from "../lib/sharedPublication.js";

function gueltigeArtikelListe(liste) {
  return Array.isArray(liste) && liste.every((artikel) => (
    !!artikel && typeof artikel === "object"
    && typeof artikel.id === "string" && artikel.id.length > 0
    && typeof artikel.titel === "string"
    && Array.isArray(artikel.liste)
    && artikel.liste.every((zeile) => !!zeile && typeof zeile === "object")
    && (artikel.text == null || typeof artikel.text === "string")
  ));
}

export function parseArtikelSicher(rohText) {
  const wert = JSON.parse(rohText);
  const liste = Array.isArray(wert) ? wert : wert?.artikel;
  if (!gueltigeArtikelListe(liste)) throw new Error("Ungültiger Artikel-Datentopf.");
  return { liste, gespeichertAm: Array.isArray(wert) ? 0 : Number(wert.gespeichertAm) || 0 };
}

export function brauchtArtikelRevisionMigration(liste, gespeichertAm) {
  return Array.isArray(liste) && liste.length > 0
    && (!Number.isFinite(gespeichertAm) || gespeichertAm <= 0);
}

/* Artikel sind ein eigener persönlicher Topf, aber Teil des gemeinsamen
   Master-/Must-Watch-Referenzuniversums. Der Controller stellt deshalb drei
   Eigenschaften bereit, die der frühere fire-and-forget-Pfad nicht hatte:
   queue-zeitige funktionale Berechnung, bestätigte Writes und eine Barriere
   mit definierter Kompensation für Mehrtopf-Aktionen. */
export function useArticleController({ setErr }) {
  const [artikelListe, setArtikelListeState] = useState([]);
  const [artikelGeladen, setArtikelGeladen] = useState(false);
  const [artikelGespeichertAm, setArtikelGespeichertAm] = useState(0);
  const artikelListeRef = useRef([]);
  const zustandsVersionRef = useRef(0);
  const geladenRef = useRef(false);
  const geladenerKontextRef = useRef(null);
  const beobachteteGenerationRef = useRef(null);
  const mutationsketteRef = useRef(Promise.resolve(true));
  const setErrRef = useRef(setErr);
  setErrRef.current = setErr;
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );

  const uebernehmeState = useCallback((liste, gespeichertAm = null) => {
    const next = Array.isArray(liste) ? liste : [];
    zustandsVersionRef.current++;
    artikelListeRef.current = next;
    setArtikelListeState(next);
    if (gespeichertAm != null) setArtikelGespeichertAm(gespeichertAm);
  }, []);

  /* Nur für einen bereits außerhalb des Controllers bestätigten Seed-Stand
     (der Demo-Boot schreibt synchron in localStorage, bevor er diese Grenze
     aufruft). Normale Änderungen laufen ausschließlich über die Queue. */
  const setArtikelListe = useCallback((liste, gespeichertAm = Date.now()) => {
    const next = typeof liste === "function" ? liste(artikelListeRef.current) : liste;
    if (!gueltigeArtikelListe(next)) return false;
    uebernehmeState(normalisiereArtikelTypen(next), gespeichertAm);
    geladenerKontextRef.current = captureStorageContext();
    geladenRef.current = true;
    setArtikelGeladen(true);
    return true;
  }, [uebernehmeState]);

  useEffect(() => {
    let aktiv = true;
    const ladeKontext = captureStorageContext();
    const generationGewechselt = beobachteteGenerationRef.current !== null
      && beobachteteGenerationRef.current !== storageGeneration;
    beobachteteGenerationRef.current = storageGeneration;
    if (generationGewechselt) uebernehmeState([], 0);
    const startVersion = zustandsVersionRef.current;
    geladenRef.current = false;
    geladenerKontextRef.current = null;
    setArtikelGeladen(false);
    (async () => {
      try {
        const r = await ladeKontext.get(K.artikel);
        if (!aktiv) return;
        const gelesen = r == null
          ? { liste: [], gespeichertAm: 0 }
          : parseArtikelSicher(r.value);
        const erholt = gelesen.liste.map((artikel) => recoverInterruptedPublication(artikel));
        const normalisiert = normalisiereArtikelTypen(erholt);
        const mussZurueckschreiben = normalisiert.some((artikel, index) => artikel !== gelesen.liste[index])
          || brauchtArtikelRevisionMigration(normalisiert, gelesen.gespeichertAm);
        let gespeichertAm = gelesen.gespeichertAm;
        if (mussZurueckschreiben) {
          gespeichertAm = Date.now();
          await ladeKontext.set(K.artikel, JSON.stringify({ artikel: normalisiert, gespeichertAm }));
        }
        if (!aktiv || !ladeKontext.isCurrent()) return;
        /* Ein während des Loads bestätigter Demo-Seed gewinnt. */
        if (zustandsVersionRef.current === startVersion) {
          uebernehmeState(normalisiert, gespeichertAm);
        }
        geladenerKontextRef.current = ladeKontext;
        geladenRef.current = true;
        setArtikelGeladen(true);
      } catch {
        if (!aktiv || zustandsVersionRef.current !== startVersion) return;
        geladenRef.current = false;
        geladenerKontextRef.current = null;
        setArtikelGeladen(false);
        setErrRef.current("Artikel konnten nicht sicher geladen werden. Änderungen bleiben gesperrt, damit kein Blog überschrieben wird.");
      }
    })();
    return () => { aktiv = false; };
  }, [storageGeneration, uebernehmeState]);

  const persistArtikel = useCallback(async (liste, kontext) => {
    const gespeichertAm = Date.now();
    try {
      await kontext.set(K.artikel, JSON.stringify({ artikel: liste, gespeichertAm }));
      return { ok: true, gespeichertAm };
    } catch {
      if (geladenerKontextRef.current?.generation === kontext.generation) {
        setErrRef.current("Artikel-Speichern fehlgeschlagen. Die letzte Änderung wurde nicht übernommen.");
      }
      return { ok: false, gespeichertAm: 0 };
    }
  }, []);

  const pruefeAuftrag = useCallback((kontext) => (
    geladenRef.current
    && geladenerKontextRef.current?.generation === kontext.generation
    && geladenerKontextRef.current?.isCurrent()
    && kontext.isCurrent()
  ), []);

  const schreibeArtikel = useCallback((berechne, nachSpeichern) => {
    const auftragKontext = captureStorageContext();
    if (!pruefeAuftrag(auftragKontext)) {
      setErrRef.current("Artikel sind noch nicht sicher geladen. Es wurde nichts verändert.");
      return Promise.resolve(false);
    }
    const auftrag = mutationsketteRef.current.then(async () => {
      if (!pruefeAuftrag(auftragKontext)) return false;
      const vorher = artikelListeRef.current;
      const roh = typeof berechne === "function" ? berechne(vorher) : berechne;
      if (!gueltigeArtikelListe(roh)) return false;
      const next = normalisiereArtikelTypen(roh);
      if (next === vorher) return true;
      const gespeichert = await persistArtikel(next, auftragKontext);
      if (!gespeichert.ok || !pruefeAuftrag(auftragKontext)) return false;
      uebernehmeState(next, gespeichert.gespeichertAm);
      if (nachSpeichern) {
        try { nachSpeichern(next); }
        catch { setErrRef.current("Artikel wurden gespeichert, aber eine abhängige Anzeige konnte nicht aktualisiert werden."); }
      }
      return true;
    });
    mutationsketteRef.current = auftrag.catch(() => false);
    return auftrag;
  }, [persistArtikel, pruefeAuftrag, uebernehmeState]);

  /* Artikel-Lock für Mehrtopf-Änderungen. Der sichere Artikelstand wird vor
     MW/Master geschrieben. Liefert der Folgeschritt
     `{ ok:false, artikelRollback:false }`, ist eine frühere MW-Kompensation
     fehlgeschlagen; dann bleibt der vorwärts geschriebene Rotlink-Stand
     absichtlich sichtbar, weil das Zurückrollen truthy tote Refs erzeugen
     könnte. */
  const transaktionArtikel = useCallback((berechne, folgeschritt, optionen = {}) => {
    const auftragKontext = optionen.storageContext || captureStorageContext();
    const hatErwarteteBasis = Object.prototype.hasOwnProperty.call(optionen, "erwarteteBasis");
    const basisAktuell = () => !hatErwarteteBasis || artikelListeRef.current === optionen.erwarteteBasis;
    const vorWriteAktuell = () => {
      if (!basisAktuell()) return false;
      if (typeof optionen.pruefeVorWrite !== "function") return true;
      try { return optionen.pruefeVorWrite() === true; }
      catch { return false; }
    };
    if (!pruefeAuftrag(auftragKontext)) {
      setErrRef.current("Artikel sind noch nicht sicher geladen. Es wurde nichts verändert.");
      return Promise.resolve(false);
    }
    const auftrag = mutationsketteRef.current.then(async () => {
      if (!pruefeAuftrag(auftragKontext) || !basisAktuell() || typeof folgeschritt !== "function") return false;
      const vorher = artikelListeRef.current;
      const roh = typeof berechne === "function" ? berechne(vorher) : berechne;
      if (!gueltigeArtikelListe(roh)) return false;
      const next = normalisiereArtikelTypen(roh);
      const geaendert = next !== vorher;
      /* Dieser Gate liegt unmittelbar vor dem ersten möglichen Write. Damit
         kann ein gebundener Drei-Basis-Plan keine inzwischen geänderte Master-
         oder MW-Basis mit einem alten Artikelstand überschreiben. */
      if (!vorWriteAktuell()) return false;
      let vorwaerts = { ok: true, gespeichertAm: artikelGespeichertAm };
      if (geaendert) {
        vorwaerts = await persistArtikel(next, auftragKontext);
        if (!vorwaerts.ok || !pruefeAuftrag(auftragKontext)) return false;
      }
      let folge;
      try {
        folge = await folgeschritt({ vorher, next, storageContext: auftragKontext });
      } catch { folge = false; }
      if (!pruefeAuftrag(auftragKontext)) return false;
      const folgeOk = folge === true || (!!folge && typeof folge === "object" && folge.ok !== false);
      if (folgeOk) {
        if (geaendert) uebernehmeState(next, vorwaerts.gespeichertAm);
        return true;
      }
      const sollRollback = !(folge && typeof folge === "object" && folge.artikelRollback === false);
      if (geaendert && sollRollback) {
        const rollback = await persistArtikel(vorher, auftragKontext);
        if (rollback.ok && pruefeAuftrag(auftragKontext)) {
          uebernehmeState(vorher, rollback.gespeichertAm);
        } else if (pruefeAuftrag(auftragKontext)) {
          uebernehmeState(next, vorwaerts.gespeichertAm);
          setErrRef.current("Die gekoppelte Änderung wurde abgebrochen, aber Artikel konnten nicht zurückgesichert werden. Der sichere Rotlink-Stand bleibt sichtbar; bitte Sync-Status und Backup prüfen.");
        }
      } else if (geaendert && pruefeAuftrag(auftragKontext)) {
        uebernehmeState(next, vorwaerts.gespeichertAm);
      }
      return false;
    });
    mutationsketteRef.current = auftrag.catch(() => false);
    return auftrag;
  }, [artikelGespeichertAm, persistArtikel, pruefeAuftrag, uebernehmeState]);
  transaktionArtikel.basisRef = artikelListeRef;

  const sichtbarerKontextAktuell = geladenerKontextRef.current?.isCurrent() === true;
  return {
    artikelListe: sichtbarerKontextAktuell ? artikelListe : [],
    artikelListeRef,
    artikelGeladen: artikelGeladen && sichtbarerKontextAktuell,
    artikelGespeichertAm: sichtbarerKontextAktuell ? artikelGespeichertAm : 0,
    setArtikelListe,
    schreibeArtikel,
    transaktionArtikel,
  };
}

/* Der dritte und innerste Lock der festen Reihenfolge MW → Artikel → Master.
   Auch normale Masterwrites laufen durch diese Queue; Mehrtopf-Aufträge binden
   sie zusätzlich an exakt denselben Storage-Kontext wie die äußeren Locks. */
export function useMasterPersistenceController({ setErr, masterRef, commitMaster }) {
  const ketteRef = useRef(Promise.resolve(true));
  const setErrRef = useRef(setErr);
  setErrRef.current = setErr;
  const commitMasterRef = useRef(commitMaster);
  commitMasterRef.current = commitMaster;

  const fuehreAus = useCallback((operation, speicherKontext, fehlermeldung) => {
    const kontext = speicherKontext?.isCurrent ? speicherKontext : captureStorageContext();
    const auftrag = ketteRef.current.then(async () => {
      if (!kontext.isCurrent()) return false;
      try {
        const ergebnis = await operation(kontext);
        return ergebnis !== false && kontext.isCurrent();
      } catch {
        if (kontext.isCurrent()) setErrRef.current(fehlermeldung);
        return false;
      }
    });
    ketteRef.current = auftrag.catch(() => false);
    return auftrag;
  }, []);

  /* Ein Masterauftrag berechnet seine Liste erst, wenn er innerhalb der
     Masterqueue wirklich an der Reihe ist. `erwarteteBasis` bindet einen
     Mehrtopf-Plan zusätzlich an exakt die Array-Identität (oder null), auf der
     MW und Artikel zuvor projiziert wurden. Ein davor bestätigter normaler
     Edit lässt den alten Plan damit fail-closed zurückrollen. */
  const transaktionMaster = useCallback((berechne, optionen = {}) => {
    const hatErwarteteBasis = Object.prototype.hasOwnProperty.call(optionen, "erwarteteBasis");
    return fuehreAus(async (kontext) => {
      if (!masterRef || (hatErwarteteBasis && masterRef.current !== optionen.erwarteteBasis)) {
        if (hatErwarteteBasis) {
          setErrRef.current("Die gekoppelte Änderung wurde abgebrochen, weil die Mediathek parallel geändert wurde. Der neuere Stand bleibt erhalten; bitte versuche die Aktion erneut.");
        }
        return false;
      }
      const vorher = Array.isArray(masterRef.current) ? masterRef.current : [];
      const roh = typeof berechne === "function" ? berechne(vorher) : berechne;
      const plan = Array.isArray(roh) ? { master: roh } : roh;
      if (!plan || plan.abgebrochen || !Array.isArray(plan.master)) return false;
      if (plan.unveraendert === true) return true;
      const herkunft = plan.herkunft || { typ: "storage", zeit: Date.now() };
      if (plan.loeschen) await kontext.delete(K.master);
      else {
        await kontext.set(K.master, JSON.stringify({
          meta: plan.meta ?? null,
          filme: plan.master,
          herkunft,
          gespeichertAm: Date.now(),
        }));
      }
      if (!kontext.isCurrent()) return false;
      masterRef.current = plan.master;
      commitMasterRef.current?.({
        master: plan.master,
        meta: plan.loeschen ? null : (plan.meta ?? null),
        herkunft: plan.loeschen ? null : herkunft,
      });
      return true;
    }, optionen.storageContext, "Speichern der Masterliste fehlgeschlagen.");
  }, [fuehreAus, masterRef]);

  const mutiereMaster = useCallback((berechne, optionen = {}) => (
    transaktionMaster(berechne, optionen)
  ), [transaktionMaster]);

  const loescheMaster = useCallback((speicherKontext) => (
    fuehreAus(
      (kontext) => kontext.delete(K.master),
      speicherKontext,
      "Masterliste konnte nicht entfernt werden.",
    )
  ), [fuehreAus]);

  return { mutiereMaster, transaktionMaster, loescheMaster };
}
