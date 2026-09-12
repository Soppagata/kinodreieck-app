/* Persönliche KI- und Filmwissen-Lebenszyklen.
   Der Hook bündelt Konto-Gates, Laufentwertung, bezahlte Einzelaufrufe und die
   sichere Speicherung. App.jsx verdrahtet nur noch die zurückgegebenen
   Fähigkeiten mit den Tabs. */

import { useState, useEffect, useCallback, useRef } from "react";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { erstelleVorbewertungsErgebnis } from "../services/vorbewertung.js";
import { filmwissenService } from "../services/filmwissen.js";
import { errorText } from "../services/errors.js";
import { kiAn } from "../lib/kiSchalter.js";
import { ladeProfil, pruefeProfil } from "../lib/profil.js";
import { K } from "../services/storage.js";
import { useRemoteStorageValue } from "./useRemoteStorageValue.js";
import { setzePrognoseStatus } from "../lib/prognose.js";
import { slugId } from "../lib/match.js";
import { mergePersonalMasterEntry } from "../lib/personalEntryChronology.js";
import {
  FILMWISSEN_STATUS, filmwissenRechercheKennung, filmwissenSonderstatus,
} from "../lib/filmwissen.js";
import { istSichererFilmwissenQuellenstopp } from "../lib/kiBewertungFlow.js";

export function istFilmwissenRechercheFreigegeben(session, filmwissenAn) {
  return session?.mode === "account"
    && session?.state === "ready"
    && typeof session?.account?.id === "string"
    && session.account.id.trim().length > 0
    && session?.capabilities?.personalAi === true
    && filmwissenAn === true;
}

export function useIntelligenceController({
  tab,
  session,
  master,
  masterMeta,
  mustwatch,
  mitMustwatch,
  naechsteHerkunft,
  mutiereMaster,
  schreibeArtikel,
  setErr,
  filmwissenDienst = filmwissenService,
  vorbewertungDienst = erstelleVorbewertungsErgebnis,
}) {
  const prognoseLaufRef = useRef(null);
  const prognoseAbortRef = useRef(null);
  const [prognoseLaufId, setPrognoseLaufId] = useState(null);
  const [prognoseFehler, setPrognoseFehler] = useState({});
  const [aktuellesProfil, setAktuellesProfil] = useState(undefined);
  const [aktuelleProfilVersion, setAktuelleProfilVersion] = useState(null);
  useRemoteStorageValue(K.geschmacksprofil, (value) => {
    const profil = value == null ? null : JSON.parse(value);
    if (profil && pruefeProfil(profil).length) throw new Error("Profil nicht lesbar");
    setAktuellesProfil(profil);
    setAktuelleProfilVersion(profil?.version || null);
  }, () => {
    setAktuellesProfil({ beschaedigt: true });
    setAktuelleProfilVersion(null);
  });

  const accountId = session.mode === "account" && session.state === "ready"
    ? session.account?.id || null
    : null;

  useEffect(() => {
    if (!["mediathek", "kino", "streaming", "finder"].includes(tab)) return undefined;
    let aktiv = true;
    ladeProfil().then((profil) => {
      if (!aktiv) return;
      setAktuellesProfil(profil);
      setAktuelleProfilVersion(profil && !profil.beschaedigt ? profil.version : null);
    }).catch(() => {
      if (!aktiv) return;
      setAktuellesProfil({ beschaedigt: true });
      setAktuelleProfilVersion(null);
    });
    return () => { aktiv = false; };
  }, [tab, master, accountId]);

  const vorbewertungAktiv = session.mode === "account"
    && session.state === "ready"
    && session.capabilities?.personalAi === true
    && kiAn("vorbewertung");
  const vorbewertungSperrgrund = aktuellesProfil === undefined
    ? "Geschmacksprofil wird geladen …"
    : !aktuellesProfil
      ? "Richte zuerst unter Settings dein Geschmacksprofil ein."
      : aktuellesProfil.beschaedigt
        ? "Das Geschmacksprofil ist beschädigt und muss zuerst repariert werden."
        : aktuellesProfil.einwilligung?.erteilt !== true
          ? "Gib zuerst dein Geschmacksprofil für persönliche KI-Aufgaben frei."
          : !Array.isArray(aktuellesProfil.signale) || aktuellesProfil.signale.length === 0
            ? "Bestätige zuerst mindestens ein Signal in deinem Geschmacksprofil."
            : null;
  useEffect(() => {
    prognoseAbortRef.current?.abort();
    prognoseAbortRef.current = null;
    prognoseLaufRef.current = null;
    setPrognoseLaufId(null);
  }, [accountId]);

  const kontoIstAktuell = useCallback((erwarteteKontoId) => {
    const jetzt = sessionCoordinator.getSnapshot();
    return jetzt.mode === "account"
      && jetzt.state === "ready"
      && jetzt.account?.id === erwarteteKontoId;
  }, []);

  const speichereFilmAenderungStrikt = useCallback(async (
    id,
    changes,
    erwarteteKontoId = accountId,
  ) => {
    if (!erwarteteKontoId || !kontoIstAktuell(erwarteteKontoId)) return false;
    const gespeichert = await mutiereMaster((aktuell) => {
      if (!kontoIstAktuell(erwarteteKontoId) || !aktuell.some((film) => film.id === id)) {
        return { abgebrochen: true };
      }
      return {
        master: aktuell.map((film) => film.id === id ? mergePersonalMasterEntry(film, changes) : film),
        meta: masterMeta, herkunft: naechsteHerkunft(),
      };
    });
    return gespeichert && kontoIstAktuell(erwarteteKontoId);
  }, [
    accountId, kontoIstAktuell, masterMeta, mutiereMaster, naechsteHerkunft,
  ]);

  const starteVorbewertung = useCallback(async (film) => {
    if (!film?.id || !vorbewertungAktiv || prognoseLaufRef.current
        || filmwissenRechercheRef.current) return false;
    if (film.prognose && !window.confirm(
      "Den bestehenden KI-Bewertungsvorschlag neu berechnen?",
    )) return false;

    const startKonto = accountId;
    const controller = new AbortController();
    const lauf = { accountId: startKonto, filmId: String(film.id), controller };
    prognoseLaufRef.current = lauf;
    prognoseAbortRef.current = controller;
    setPrognoseLaufId(film.id);
    setPrognoseFehler((alt) => ({ ...alt, [film.id]: null }));
    try {
      const ergebnis = await vorbewertungDienst(film, { signal: controller.signal });
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      if (!ergebnis.prognose) {
        setPrognoseFehler((alt) => ({
          ...alt,
          [film.id]: { art: "hinweis", text: ergebnis.displayText },
        }));
        return true;
      }
      const prognose = ergebnis.prognose;
      if (!await speichereFilmAenderungStrikt(film.id, { prognose }, startKonto)) {
        throw new Error("Der KI-Bewertungsvorschlag konnte nicht im Eintrag gespeichert werden.");
      }
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      setAktuelleProfilVersion(prognose.profilVersion);
      setPrognoseFehler((alt) => ({
        ...alt,
        [film.id]: ergebnis.responseMode === "partial"
          ? { art: "hinweis", text: ergebnis.displayText }
          : null,
      }));
      return true;
    } catch (error) {
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      const lokal = error?.source === "forecast" && error?.operation === "forecast.validate";
      const basis = lokal ? error.message : errorText(error);
      setPrognoseFehler((alt) => ({
        ...alt,
        [film.id]: lokal
          ? basis
          : `${basis} Der Eintrag bleibt erhalten. Bitte versuche es später erneut.`,
      }));
      return false;
    } finally {
      if (prognoseLaufRef.current === lauf) {
        prognoseLaufRef.current = null;
        if (prognoseAbortRef.current === controller) prognoseAbortRef.current = null;
        setPrognoseLaufId(null);
      }
    }
  }, [accountId, kontoIstAktuell, speichereFilmAenderungStrikt, vorbewertungAktiv, vorbewertungDienst]);

  const setzeFilmPrognoseStatus = useCallback(async (film, status) => {
    const startKonto = accountId;
    const wechsel = setzePrognoseStatus(film?.prognose, status);
    if (!wechsel.ok) {
      if (kontoIstAktuell(startKonto)) {
        setPrognoseFehler((alt) => ({ ...alt, [film?.id]: wechsel.fehler.join("; ") }));
      }
      return false;
    }
    const gespeichert = await speichereFilmAenderungStrikt(
      film.id,
      { prognose: wechsel.prognose },
      startKonto,
    );
    if (!gespeichert && kontoIstAktuell(startKonto)) {
      setPrognoseFehler((alt) => ({
        ...alt,
        [film.id]: "Der Status der KI-Bewertung konnte nicht gespeichert werden.",
      }));
    }
    return gespeichert;
  }, [accountId, kontoIstAktuell, speichereFilmAenderungStrikt]);

  const addFilmMitPrognose = useCallback(async (film) => {
    if (!vorbewertungAktiv) {
      return { status: "gesperrt", fehler: vorbewertungSperrgrund || "KI-Bewertung ist derzeit nicht verfügbar." };
    }
    const startKonto = accountId;
    if (!startKonto || !kontoIstAktuell(startKonto)) return { status: "veraltet" };
    const kandidat = {
      ...film,
      id: film.id || slugId(film.titel, film.jahr),
      bewertung: null,
      kategorie: null,
      bewertet_von: null,
      begruendung: "",
    };
    if (prognoseLaufRef.current || filmwissenRechercheRef.current) {
      return { status: "beschaeftigt", fehler: "Eine andere KI-Bewertung wird gerade erstellt." };
    }

    const controller = new AbortController();
    const lauf = { accountId: startKonto, filmId: String(kandidat.id), controller, entwurf: true };
    prognoseLaufRef.current = lauf;
    prognoseAbortRef.current = controller;
    setPrognoseLaufId(kandidat.id);
    try {
      let filmwissen = null;
      let filmwissenFehler = null;
      try {
        filmwissen = await filmwissenDienst.read(kandidat, { signal: controller.signal });
      } catch (error) {
        filmwissenFehler = errorText(error);
      }
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) {
        return { status: "veraltet" };
      }
      if (filmwissen?.status === FILMWISSEN_STATUS.VERALTET) {
        return { status: "veraltet" };
      }
      const brauchtQuellenlauf = [
        FILMWISSEN_STATUS.CACHE_MISS,
        FILMWISSEN_STATUS.NICHT_ZUORDENBAR,
      ].includes(filmwissen?.status)
        && istFilmwissenRechercheFreigegeben(session, kiAn("filmwissen"))
        && !!filmwissenRechercheKennung(kandidat);
      if (brauchtQuellenlauf) {
        try {
          filmwissen = await filmwissenDienst.recherchiere(kandidat, { signal: controller.signal });
          filmwissenFehler = null;
        } catch (error) {
          if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) {
            return { status: "veraltet" };
          }
          if (!istSichererFilmwissenQuellenstopp(error)) {
            return {
              status: "fehler",
              fehler: `${errorText(error)} Die Quellenprüfung wurde nicht sicher abgeschlossen; deshalb wurde keine persönliche Einschätzung gestartet.`,
              filmwissen: { phase: "fehler", daten: null, fehler: errorText(error) },
            };
          }
          filmwissen = filmwissenSonderstatus(FILMWISSEN_STATUS.GESPERRT);
          filmwissenFehler = `${errorText(error)} WARUM bleibt deshalb vorläufig.`;
        }
      }
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) {
        return { status: "veraltet" };
      }
      if (filmwissen?.status === FILMWISSEN_STATUS.VERALTET) {
        return { status: "veraltet" };
      }
      const ergebnis = await vorbewertungDienst(kandidat, { signal: controller.signal });
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) {
        return { status: "veraltet" };
      }
      if (!ergebnis.prognose) {
        return {
          status: "hinweis",
          id: kandidat.id,
          text: ergebnis.displayText || "Es konnten keine sicheren Werte für die KI-Bewertung übernommen werden.",
          filmwissen: {
            phase: filmwissenFehler ? "fehler" : "fertig",
            daten: filmwissen,
            fehler: filmwissenFehler,
          },
        };
      }
      setAktuelleProfilVersion(ergebnis.prognose.profilVersion);
      return {
        status: "bereit",
        id: kandidat.id,
        prognose: ergebnis.prognose,
        hinweis: ergebnis.responseMode === "partial" ? ergebnis.displayText : null,
        filmwissen: {
          phase: filmwissenFehler ? "fehler" : "fertig",
          daten: filmwissen,
          fehler: filmwissenFehler,
        },
      };
    } catch (error) {
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) {
        return { status: "veraltet" };
      }
      const lokal = error?.source === "forecast" && error?.operation === "forecast.validate";
      return {
        status: "fehler",
        fehler: lokal ? error.message : `${errorText(error)} Bitte versuche es später erneut.`,
      };
    } finally {
      if (prognoseLaufRef.current === lauf) {
        prognoseLaufRef.current = null;
        if (prognoseAbortRef.current === controller) prognoseAbortRef.current = null;
        setPrognoseLaufId(null);
      }
    }
  }, [
    accountId, filmwissenDienst, kontoIstAktuell, session, vorbewertungAktiv,
    vorbewertungDienst, vorbewertungSperrgrund,
  ]);

  const [filmwissenProFilm, setFilmwissenProFilm] = useState({});
  const filmwissenReadsRef = useRef(new Map());
  const filmwissenRechercheRef = useRef(null);
  const filmwissenLesenAktiv = !!accountId;
  const filmwissenRechercheAktiv = istFilmwissenRechercheFreigegeben(
    session,
    kiAn("filmwissen"),
  );

  useEffect(() => {
    filmwissenReadsRef.current.clear();
    filmwissenRechercheRef.current = null;
    setFilmwissenProFilm({});
    filmwissenDienst.invalidate();
  }, [accountId, filmwissenDienst]);

  const ladeFilmwissen = useCallback(async (film) => {
    if (!film?.id || !filmwissenLesenAktiv) return null;
    const key = String(film.id);
    if (filmwissenReadsRef.current.has(key)) return null;
    const startKonto = accountId;
    const lauf = { accountId: startKonto, filmId: key };
    filmwissenReadsRef.current.set(key, lauf);
    setFilmwissenProFilm((alt) => ({
      ...alt,
      [key]: { ...(alt[key] || {}), phase: "laedt", fehler: null },
    }));
    try {
      const daten = await filmwissenDienst.read(film);
      if (filmwissenReadsRef.current.get(key) !== lauf || !kontoIstAktuell(startKonto)) return null;
      setFilmwissenProFilm((alt) => ({
        ...alt,
        [key]: { phase: "fertig", daten, fehler: null },
      }));
      return daten;
    } catch (error) {
      if (filmwissenReadsRef.current.get(key) !== lauf || !kontoIstAktuell(startKonto)) return null;
      setFilmwissenProFilm((alt) => ({
        ...alt,
        [key]: { phase: "fehler", daten: null, fehler: errorText(error) },
      }));
      return null;
    } finally {
      if (filmwissenReadsRef.current.get(key) === lauf) filmwissenReadsRef.current.delete(key);
    }
  }, [accountId, filmwissenDienst, filmwissenLesenAktiv, kontoIstAktuell]);

  const recherchiereFilmwissen = useCallback(async (film, optionen = {}) => {
    if (!film?.id || !filmwissenRechercheAktiv || filmwissenRechercheRef.current
        || prognoseLaufRef.current) return false;
    if (!optionen?.bereitsAusgeloest && !window.confirm(
      "Jetzt Filmwissen mit KI recherchieren? Nur einzeln belegte Bausteine dürfen veröffentlicht werden; unsichere Teile bleiben höchstens ein unverbindlicher Entwurf.",
    )) return false;
    const key = String(film.id);
    const startKonto = accountId;
    const lauf = { accountId: startKonto, filmId: key };
    filmwissenRechercheRef.current = lauf;
    setFilmwissenProFilm((alt) => ({
      ...alt,
      [key]: { ...(alt[key] || {}), phase: "laedt", fehler: null },
    }));
    try {
      const daten = await filmwissenDienst.recherchiere(film);
      if (filmwissenRechercheRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      setFilmwissenProFilm((alt) => ({
        ...alt,
        [key]: { phase: "fertig", daten, fehler: null },
      }));
      return true;
    } catch (error) {
      if (filmwissenRechercheRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      const vorlaeufig = istSichererFilmwissenQuellenstopp(error);
      setFilmwissenProFilm((alt) => ({
        ...alt,
        [key]: {
          ...(alt[key] || {}),
          phase: "fehler",
          daten: vorlaeufig ? filmwissenSonderstatus(FILMWISSEN_STATUS.GESPERRT) : null,
          fehler: vorlaeufig
            ? `${errorText(error)} Die persönliche Einschätzung kann fortfahren; WARUM bleibt vorläufig.`
            : `${errorText(error)} Die Quellenprüfung wurde nicht sicher abgeschlossen; deshalb wurde keine persönliche Einschätzung gestartet.`,
        },
      }));
      return vorlaeufig ? { status: "vorlaeufig", vorlaeufig: true } : false;
    } finally {
      if (filmwissenRechercheRef.current === lauf) filmwissenRechercheRef.current = null;
    }
  }, [accountId, filmwissenDienst, filmwissenRechercheAktiv, kontoIstAktuell]);

  return {
    accountId,
    vorbewertungAktiv,
    vorbewertungSperrgrund,
    prognoseLaufId,
    prognoseFehler,
    aktuellesProfil,
    aktuelleProfilVersion,
    starteVorbewertung,
    setzeFilmPrognoseStatus,
    addFilmMitPrognose,
    filmwissenLesenAktiv,
    filmwissenRechercheAktiv,
    filmwissenProFilm,
    filmwissenRechercheLaufId: filmwissenRechercheRef.current?.filmId || null,
    ladeFilmwissen,
    recherchiereFilmwissen,
  };
}
