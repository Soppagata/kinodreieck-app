import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  K,
  captureStorageContext,
  storageContextGenerationSnapshot,
  subscribeStorageContext,
} from "../services/storage.js";
import { migriereFlags, neueMustwatchId, offeneFlagAnzahl } from "../lib/mustwatch.js";

/* Serialisiert Schreibvorgänge auch dann weiter, wenn ein einzelner Auftrag
   scheitert. Das ist separat exportiert, damit Reihenfolge und Fehlerpfad ohne
   React und ohne echten Storage deterministisch testbar bleiben. */
export function erstelleMustwatchSchreibkette(speichere, meldeFehler = () => {}) {
  let kette = Promise.resolve();
  return (payload) => {
    const auftrag = kette.then(async () => {
      try {
        await speichere(payload);
        return true;
      } catch (fehler) {
        try { meldeFehler(fehler); } catch { /* Fehlermeldung darf die Kette nie blockieren */ }
        return false;
      }
    });
    kette = auftrag;
    return auftrag;
  };
}

export function parseMustwatchSicher(rohText) {
  const wert = JSON.parse(rohText);
  if (Array.isArray(wert)) return wert;
  if (wert && typeof wert === "object" && Array.isArray(wert.eintraege)) return wert.eintraege;
  throw new Error("Ungültiger Must-Watch-Datentopf.");
}

/* Ein fokussierter Controller für den vorhandenen kd:mustwatch-Topf. Er führt
   keinen zweiten Schlüssel und keine Merkliste-Migration ein. Änderungen
   werden seriell berechnet und erst nach bestätigtem lokalem Speichern in die
   Anzeige übernommen. Im Kontomodus bleibt die nachgelagerte Remote-Bestätigung
   Aufgabe des Sync-Status. */
export function useMustwatchController({ master, masterRef: externerMasterRef, setErr }) {
  const [mustwatch, setMustwatchState] = useState([]);
  const [mustwatchGeladen, setMustwatchGeladen] = useState(false);
  const [migrationsBericht, setMigrationsBericht] = useState(null);
  const mustwatchRef = useRef([]);
  const zustandsVersionRef = useRef(0);
  const geladenRef = useRef(false);
  const geladenerKontextRef = useRef(null);
  const beobachteteStorageGenerationRef = useRef(null);
  const setErrRef = useRef(setErr);
  setErrRef.current = setErr;
  const storageGeneration = useSyncExternalStore(
    subscribeStorageContext,
    storageContextGenerationSnapshot,
    storageContextGenerationSnapshot,
  );

  const mutationsketteRef = useRef(Promise.resolve(true));

  const uebernehmeState = useCallback((liste) => {
    const next = Array.isArray(liste) ? liste : [];
    const version = ++zustandsVersionRef.current;
    mustwatchRef.current = next;
    setMustwatchState(next);
    return version;
  }, []);

  /* Nur für bereits anderweitig gesicherte Stände (Boot/Demo). Normale UI-
     Änderungen müssen über schreibeMustwatch laufen. */
  const setMustwatch = useCallback((liste) => {
    const next = typeof liste === "function" ? liste(mustwatchRef.current) : liste;
    uebernehmeState(next);
    geladenerKontextRef.current = captureStorageContext();
    geladenRef.current = true;
    setMustwatchGeladen(true);
  }, [uebernehmeState]);

  useEffect(() => {
    let aktiv = true;
    const ladeKontext = captureStorageContext();
    const generationGewechselt = beobachteteStorageGenerationRef.current !== null
      && beobachteteStorageGenerationRef.current !== storageGeneration;
    beobachteteStorageGenerationRef.current = storageGeneration;
    /* Ein alter Kontostand darf während eines langsamen neuen get() weder
       sichtbar bleiben noch als Ref-Universum/Finder-Signal weiterwirken. Der
       Clear gehört vor startVersion: Dann darf der neue Load seinen Stand
       übernehmen, während ein später ausdrücklich gesetzter Demo-Stand weiter
       über die Versionsprüfung gegen ein veraltetes Lesen gewinnt. */
    if (generationGewechselt) {
      uebernehmeState([]);
      setMigrationsBericht(null);
    }
    const startVersion = zustandsVersionRef.current;
    geladenRef.current = false;
    geladenerKontextRef.current = null;
    setMustwatchGeladen(false);
    ladeKontext.get(K.mustwatch).then((r) => {
      if (!aktiv) return;
      const liste = r == null ? [] : parseMustwatchSicher(r.value);
      /* Ein parallel geladener Demo-Stand gewinnt gegen das ältere Lesen. */
      if (zustandsVersionRef.current === startVersion) {
        uebernehmeState(liste);
      }
      geladenerKontextRef.current = ladeKontext;
      geladenRef.current = true;
      setMustwatchGeladen(true);
    }).catch(() => {
      if (!aktiv) return;
      /* Ein inzwischen ausdrücklich gesicherter Boot-/Demo-Stand gewinnt auch
         gegen den Fehler des davor gestarteten Lesens. Nur der weiterhin
         aktuelle Leseversuch darf Schreibzugriffe sperren. */
      if (zustandsVersionRef.current !== startVersion) return;
      geladenRef.current = false;
      geladenerKontextRef.current = null;
      setErrRef.current("Must-Watch konnte nicht sicher geladen werden. Änderungen bleiben gesperrt, damit keine Liste überschrieben wird.");
      setMustwatchGeladen(false);
    });
    return () => { aktiv = false; };
  }, [storageGeneration, uebernehmeState]);

  const persistMustwatch = useCallback(async (liste, kontext) => {
    const next = Array.isArray(liste) ? liste : [];
    const payload = JSON.stringify({ eintraege: next, gespeichertAm: Date.now() });
    try {
      await kontext.set(K.mustwatch, payload);
      return true;
    } catch {
      /* Ist inzwischen bereits ein neuer Kontext geladen, darf ein alter
         Auftrag weder dessen Ladezustand noch dessen Fehlermeldung verändern. */
      if (geladenerKontextRef.current?.generation === kontext.generation) {
        setErrRef.current("Must-Watch-Speichern fehlgeschlagen. Die letzte Änderung wurde nicht übernommen.");
      }
      return false;
    }
  }, []);

  const schreibeMustwatch = useCallback((berechne, nachSpeichern) => {
    const auftragKontext = captureStorageContext();
    if (!geladenRef.current || !geladenerKontextRef.current?.isCurrent()) {
      setErrRef.current("Must-Watch ist noch nicht sicher geladen. Es wurde nichts verändert.");
      return Promise.resolve(false);
    }
    const auftrag = mutationsketteRef.current.then(async () => {
      if (!auftragKontext.isCurrent()) return false;
      const vorher = mustwatchRef.current;
      const next = typeof berechne === "function" ? berechne(vorher) : berechne;
      if (!Array.isArray(next)) return false;
      if (next === vorher) return true;
      if (!await persistMustwatch(next, auftragKontext)) return false;
      if (!auftragKontext.isCurrent()) return false;
      uebernehmeState(next);
      if (nachSpeichern) {
        try { nachSpeichern(next); }
        catch { setErrRef.current("Must-Watch wurde gespeichert, aber eine abhängige Anzeige konnte nicht aktualisiert werden."); }
      }
      return true;
    });
    mutationsketteRef.current = auftrag.catch(() => false);
    return auftrag;
  }, [persistMustwatch, uebernehmeState]);

  /* Barriere für eine fachlich zusammenhängende Änderung an Must-Watch und
     genau einem externen Datentopf. Spätere MW-Aktionen warten, die Berechnung
     sieht den dann wirklich aktuellen Stand. Schlägt der Folgeschritt fehl,
     wird der lokal bereits gesicherte MW-Stand innerhalb derselben Kette
     zurückgeschrieben. Eine echte Remote-Transaktion über zwei Schlüssel kann
     der Browser nicht bieten; Konflikte bleiben zusätzlich im Sync-Status. */
  const transaktionMustwatch = useCallback((berechne, folgeschritt) => {
    const auftragKontext = captureStorageContext();
    if (!geladenRef.current || !geladenerKontextRef.current?.isCurrent()) {
      setErrRef.current("Must-Watch ist noch nicht sicher geladen. Es wurde nichts verändert.");
      return Promise.resolve(false);
    }
    const auftrag = mutationsketteRef.current.then(async () => {
      if (!auftragKontext.isCurrent()) return false;
      const vorher = mustwatchRef.current;
      const next = typeof berechne === "function" ? berechne(vorher) : berechne;
      if (!Array.isArray(next) || typeof folgeschritt !== "function") return false;
      const geaendert = next !== vorher;
      if (geaendert && !await persistMustwatch(next, auftragKontext)) return false;
      if (!auftragKontext.isCurrent()) return false;

      let folgeOk = false;
      try { folgeOk = await folgeschritt({ vorher, next, storageContext: auftragKontext }) !== false; }
      catch { folgeOk = false; }
      if (!auftragKontext.isCurrent()) return false;
      if (!folgeOk) {
        if (geaendert && !await persistMustwatch(vorher, auftragKontext)) {
          /* Der erste lokale Write war bestätigt. Scheitert ausnahmsweise die
             Rücksicherung, muss die Anzeige den tatsächlich verbliebenen
             lokalen Stand zeigen statt eine erfolgreiche Rücknahme zu spielen. */
          if (auftragKontext.isCurrent()) {
            uebernehmeState(next);
            setErrRef.current("Die gekoppelte Änderung wurde abgebrochen, aber Must-Watch konnte nicht zurückgesichert werden. Bitte Sync-Status und Backup prüfen.");
          }
        }
        return false;
      }
      if (geaendert && auftragKontext.isCurrent()) uebernehmeState(next);
      return true;
    });
    mutationsketteRef.current = auftrag.catch(() => false);
    return auftrag;
  }, [persistMustwatch, uebernehmeState]);

  /* Vorbereitete Mehrtopf-Barriere für die feste Sperrreihenfolge
     Must-Watch → Artikel → Master. Anders als transaktionMustwatch schreibt
     sie den MW-Stand nicht schon vor dem Folgeschritt. Der innere Koordinator
     kann dadurch zuerst Blogrefs sicher zu Rotlinks machen, dann MW bestätigen
     und zuletzt Master schreiben. Bei einem Masterfehler wird MW noch bei
     gehaltenem Lock vor dem möglichen Artikel-Rollback kompensiert. */
  const transaktionMustwatchVorbereitet = useCallback((berechne, folgeschritt) => {
    const auftragKontext = captureStorageContext();
    if (!geladenRef.current || !geladenerKontextRef.current?.isCurrent()) {
      setErrRef.current("Must-Watch ist noch nicht sicher geladen. Es wurde nichts verändert.");
      return Promise.resolve(false);
    }
    const auftrag = mutationsketteRef.current.then(async () => {
      if (!auftragKontext.isCurrent() || typeof folgeschritt !== "function") return false;
      const vorher = mustwatchRef.current;
      const next = typeof berechne === "function" ? berechne(vorher) : berechne;
      if (!Array.isArray(next)) return false;
      const geaendert = next !== vorher;
      let vorwaertsBestaetigt = !geaendert;
      let rollbackVersucht = false;
      let rollbackOk = !geaendert;

      const persistiere = async () => {
        if (vorwaertsBestaetigt) return true;
        if (!auftragKontext.isCurrent()) return false;
        vorwaertsBestaetigt = await persistMustwatch(next, auftragKontext);
        return vorwaertsBestaetigt && auftragKontext.isCurrent();
      };
      const rolleZurueck = async () => {
        rollbackVersucht = true;
        if (!geaendert || !vorwaertsBestaetigt) { rollbackOk = true; return true; }
        rollbackOk = await persistMustwatch(vorher, auftragKontext);
        if (!rollbackOk && auftragKontext.isCurrent()) {
          uebernehmeState(next);
          setErrRef.current("Die gekoppelte Änderung wurde abgebrochen, aber Must-Watch konnte nicht zurückgesichert werden. Abhängige Blogrefs bleiben vorsichtshalber als Rotlinks sichtbar; bitte Sync-Status und Backup prüfen.");
        }
        return rollbackOk && auftragKontext.isCurrent();
      };

      let folgeOk = false;
      try {
        folgeOk = await folgeschritt({
          vorher, next, storageContext: auftragKontext, persistiere, rolleZurueck,
        }) !== false;
      } catch { folgeOk = false; }
      if (!auftragKontext.isCurrent()) return false;
      if (folgeOk && vorwaertsBestaetigt) {
        if (geaendert) uebernehmeState(next);
        return true;
      }
      /* Defensive Kompensation für Aufrufer, die nach einem bestätigten
         Vorwärtswrite abbrechen, ohne selbst zurückzurollen. Der eigentliche
         Mehrtopf-Koordinator rollt vor dem Artikel-Rollback explizit zurück. */
      if (vorwaertsBestaetigt && geaendert && !rollbackVersucht) await rolleZurueck();
      if (rollbackVersucht && !rollbackOk && auftragKontext.isCurrent()) uebernehmeState(next);
      return false;
    });
    mutationsketteRef.current = auftrag.catch(() => false);
    return auftrag;
  }, [persistMustwatch, uebernehmeState]);

  const sichereVerknuepfung = useCallback((verknuepfung) => {
    if (!verknuepfung) return null;
    const aktuellerMaster = externerMasterRef?.current || master || [];
    if (verknuepfung.ziel !== "master"
      || aktuellerMaster.some((film) => film.id === verknuepfung.id)) return verknuepfung;
    setErrRef.current("Das gewählte Verknüpfungsziel existiert nicht mehr. Der Must-Watch-Eintrag wurde ohne diese Verknüpfung gespeichert.");
    return null;
  }, [externerMasterRef, master]);

  const addMustwatch = useCallback((daten, nachSpeichern) => schreibeMustwatch((vorher) => [...vorher, {
    id: neueMustwatchId(daten.titel, vorher), titel: daten.titel,
    im_besitz: !!daten.im_besitz, beschreibung: daten.beschreibung || "",
    notiz: daten.notiz || "", verknuepfung: sichereVerknuepfung(daten.verknuepfung),
    erstellt_am: new Date().toISOString(),
  }], nachSpeichern), [schreibeMustwatch, sichereVerknuepfung]);

  const updateMustwatch = useCallback((id, changes) => schreibeMustwatch(
    (vorher) => {
      const aktuell = vorher.find((e) => e.id === id);
      if (!aktuell) return vorher;
      const berechnet = typeof changes === "function" ? changes(aktuell) : changes;
      if (!berechnet || typeof berechnet !== "object") return vorher;
      const sichereChanges = Object.prototype.hasOwnProperty.call(berechnet, "verknuepfung")
        ? { ...berechnet, verknuepfung: sichereVerknuepfung(berechnet.verknuepfung) }
        : berechnet;
      return vorher.map((e) => (e.id === id ? { ...e, ...sichereChanges } : e));
    },
  ), [schreibeMustwatch, sichereVerknuepfung]);

  const deleteMustwatch = useCallback((id) => schreibeMustwatch(
    (vorher) => vorher.filter((e) => e.id !== id),
  ), [schreibeMustwatch]);

  const ersetzeMustwatch = useCallback((liste) => schreibeMustwatch(() => liste), [schreibeMustwatch]);

  const mustwatchMasterIds = useMemo(() => new Set(
    mustwatch.filter((e) => e.verknuepfung?.ziel === "master").map((e) => e.verknuepfung.id),
  ), [mustwatch]);
  const offeneFlags = useMemo(() => offeneFlagAnzahl(master, mustwatch), [master, mustwatch]);

  const migriereMustwatch = useCallback(() => {
    let bericht = null;
    /* Auch die Ermittlung gehört IN die Mutationskette. Zwei schnelle Klicks
       dürfen nicht beide gegen denselben alten Ref-Stand dieselben IDs bauen. */
    return schreibeMustwatch((vorher) => {
      const { neue, uebersprungen } = migriereFlags(
        externerMasterRef?.current || master || [], vorher, new Date().toISOString(),
      );
      bericht = { angelegt: neue.length, uebersprungen };
      return neue.length ? [...vorher, ...neue] : vorher;
    }, () => {
      if (bericht) setMigrationsBericht(bericht);
    }).then((ok) => {
      /* Bei einem idempotenten zweiten Lauf gibt es absichtlich keinen
         Storage-Write und damit keinen nachSpeichern-Callback. */
      if (ok && bericht?.angelegt === 0) setMigrationsBericht(bericht);
      return ok;
    });
  }, [externerMasterRef, master, schreibeMustwatch]);

  /* useSyncExternalStore rendert bereits auf die neue Generation, bevor der
     passive Ladeeffekt seinen Clear-State committed. In genau diesem Render
     wird der alte Stand daher zusätzlich an der öffentlichen Grenze isoliert. */
  const sichtbarerKontextAktuell = geladenerKontextRef.current?.isCurrent() === true;
  const sichtbareMustwatch = sichtbarerKontextAktuell ? mustwatch : [];
  const sichtbareMustwatchMasterIds = sichtbarerKontextAktuell ? mustwatchMasterIds : new Set();
  const sichtbareOffeneFlags = sichtbarerKontextAktuell ? offeneFlags : 0;

  return {
    mustwatch: sichtbareMustwatch, setMustwatch,
    mustwatchRef,
    mustwatchGeladen: mustwatchGeladen && sichtbarerKontextAktuell,
    schreibeMustwatch, transaktionMustwatch, transaktionMustwatchVorbereitet,
    addMustwatch, updateMustwatch, deleteMustwatch, ersetzeMustwatch,
    mustwatchMasterIds: sichtbareMustwatchMasterIds, offeneFlags: sichtbareOffeneFlags,
    migriereMustwatch, migrationsBericht,
  };
}
