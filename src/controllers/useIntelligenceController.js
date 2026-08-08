/* Persönliche KI- und Filmwissen-Lebenszyklen.
   Der Hook bündelt Konto-Gates, Laufentwertung, bezahlte Einzelaufrufe und die
   sichere Speicherung. App.jsx verdrahtet nur noch die zurückgegebenen
   Fähigkeiten mit den Tabs. */

import { useState, useEffect, useCallback, useRef } from "react";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { erstelleVorbewertung } from "../services/vorbewertung.js";
import { filmwissenService } from "../services/filmwissen.js";
import { errorText } from "../services/errors.js";
import { kiAn } from "../lib/kiSchalter.js";
import { ladeProfil } from "../lib/profil.js";
import { setzePrognoseStatus } from "../lib/prognose.js";
import { ensureIds, slugId } from "../lib/match.js";
import { heileRotlinks } from "../lib/artikel.js";

export function useIntelligenceController({
  tab,
  session,
  master,
  masterRef,
  masterMeta,
  mustwatch,
  mitMustwatch,
  naechsteHerkunft,
  persistMaster,
  setMaster,
  setMasterHerkunft,
  schreibeArtikel,
  setErr,
}) {
  const prognoseLaufRef = useRef(null);
  const prognoseAbortRef = useRef(null);
  const [prognoseLaufId, setPrognoseLaufId] = useState(null);
  const [prognoseFehler, setPrognoseFehler] = useState({});
  const [aktuellesProfil, setAktuellesProfil] = useState(undefined);
  const [aktuelleProfilVersion, setAktuelleProfilVersion] = useState(null);

  useEffect(() => {
    if (!["mediathek", "kino", "streaming"].includes(tab)) return undefined;
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
  }, [tab, master]);

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
  const accountId = session.mode === "account" && session.state === "ready"
    ? session.account?.id || null
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
    const aktuell = masterRef.current || [];
    if (!aktuell.some((film) => film.id === id)) return false;
    const next = aktuell.map((film) => (film.id === id ? { ...film, ...changes } : film));
    const herkunft = naechsteHerkunft();
    if (!kontoIstAktuell(erwarteteKontoId)) return false;
    if (!await persistMaster(next, masterMeta, herkunft)) return false;
    if (!kontoIstAktuell(erwarteteKontoId)) return false;
    masterRef.current = next;
    setMasterHerkunft(herkunft);
    setMaster(next);
    return true;
  }, [
    accountId, kontoIstAktuell, masterMeta, masterRef, naechsteHerkunft,
    persistMaster, setMaster, setMasterHerkunft,
  ]);

  const starteVorbewertung = useCallback(async (film) => {
    if (!film?.id || !vorbewertungAktiv || prognoseLaufRef.current) return false;
    if (film.prognose && !window.confirm(
      "Die bestehende KI-Prognose durch eine neue kostenpflichtige Prognose ersetzen?",
    )) return false;

    const startKonto = accountId;
    const controller = new AbortController();
    const lauf = { accountId: startKonto, filmId: String(film.id), controller };
    prognoseLaufRef.current = lauf;
    prognoseAbortRef.current = controller;
    setPrognoseLaufId(film.id);
    setPrognoseFehler((alt) => ({ ...alt, [film.id]: null }));
    try {
      const prognose = await erstelleVorbewertung(film, { signal: controller.signal });
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      if (!await speichereFilmAenderungStrikt(film.id, { prognose }, startKonto)) {
        throw new Error("Die KI-Prognose konnte nicht im Eintrag gespeichert werden.");
      }
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      setAktuelleProfilVersion(prognose.profilVersion);
      return true;
    } catch (error) {
      if (prognoseLaufRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      const lokal = error?.source === "forecast" && error?.operation === "forecast.validate";
      const basis = lokal ? error.message : errorText(error);
      setPrognoseFehler((alt) => ({
        ...alt,
        [film.id]: lokal
          ? basis
          : `${basis} Der Eintrag bleibt erhalten. Bitte nicht automatisch wiederholen — ein neuer Versuch kann erneut Kosten verursachen.`,
      }));
      return false;
    } finally {
      if (prognoseLaufRef.current === lauf) {
        prognoseLaufRef.current = null;
        if (prognoseAbortRef.current === controller) prognoseAbortRef.current = null;
        setPrognoseLaufId(null);
      }
    }
  }, [accountId, kontoIstAktuell, speichereFilmAenderungStrikt, vorbewertungAktiv]);

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
        [film.id]: "Der Prognosestatus konnte nicht gespeichert werden.",
      }));
    }
    return gespeichert;
  }, [accountId, kontoIstAktuell, speichereFilmAenderungStrikt]);

  const addFilmMitPrognose = useCallback(async (film) => {
    if (!vorbewertungAktiv) return null;
    const startKonto = accountId;
    if (!startKonto || !kontoIstAktuell(startKonto)) return null;
    const kandidat = {
      ...film,
      bewertung: null,
      kategorie: null,
      bewertet_von: null,
      begruendung: "",
    };
    const id = kandidat.id || slugId(kandidat.titel, kandidat.jahr);
    const aktuell = masterRef.current || [];
    if (aktuell.some((eintrag) => eintrag.id === id)) {
      setErr("Eintrag existiert bereits: " + kandidat.titel
        + (kandidat.jahr ? ` (${kandidat.jahr})` : ""));
      return null;
    }
    const neu = ensureIds([{ ...kandidat, id }])[0];
    const next = [...aktuell, neu];
    const herkunft = naechsteHerkunft();
    if (!kontoIstAktuell(startKonto)) return null;
    if (!await persistMaster(next, masterMeta, herkunft)) return null;
    if (!kontoIstAktuell(startKonto)) return null;
    masterRef.current = next;
    setMasterHerkunft(herkunft);
    setMaster(next);
    schreibeArtikel((prev) => {
      const [geheilt, anzahl] = heileRotlinks(prev, mitMustwatch(next, mustwatch));
      if (anzahl > 0) return geheilt;
      return prev;
    });
    await starteVorbewertung(neu);
    return id;
  }, [
    accountId, kontoIstAktuell, masterMeta, masterRef, mitMustwatch, mustwatch,
    naechsteHerkunft, persistMaster, schreibeArtikel, setErr, setMaster,
    setMasterHerkunft, starteVorbewertung, vorbewertungAktiv,
  ]);

  const [filmwissenProFilm, setFilmwissenProFilm] = useState({});
  const filmwissenReadsRef = useRef(new Map());
  const filmwissenRechercheRef = useRef(null);
  const filmwissenLesenAktiv = !!accountId;
  const filmwissenRechercheAktiv = vorbewertungAktiv;

  useEffect(() => {
    filmwissenReadsRef.current.clear();
    filmwissenRechercheRef.current = null;
    setFilmwissenProFilm({});
    filmwissenService.invalidate();
  }, [accountId]);

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
      const daten = await filmwissenService.read(film);
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
  }, [accountId, filmwissenLesenAktiv, kontoIstAktuell]);

  const recherchiereFilmwissen = useCallback(async (film) => {
    if (!film?.id || !filmwissenRechercheAktiv || filmwissenRechercheRef.current) return false;
    if (!window.confirm(
      "Jetzt einen belegten Recherchebericht erstellen? Das startet genau einen Sonnet-Aufruf und kostet höchstens 5 US-Cent. Es gibt keine automatische Wiederholung.",
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
      const daten = await filmwissenService.recherchiere(film);
      if (filmwissenRechercheRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      setFilmwissenProFilm((alt) => ({
        ...alt,
        [key]: { phase: "fertig", daten, fehler: null },
      }));
      return true;
    } catch (error) {
      if (filmwissenRechercheRef.current !== lauf || !kontoIstAktuell(startKonto)) return false;
      setFilmwissenProFilm((alt) => ({
        ...alt,
        [key]: {
          ...(alt[key] || {}),
          phase: "fehler",
          fehler: `${errorText(error)} Bitte nicht automatisch wiederholen — ein neuer Versuch kann erneut Kosten verursachen.`,
        },
      }));
      return false;
    } finally {
      if (filmwissenRechercheRef.current === lauf) filmwissenRechercheRef.current = null;
    }
  }, [accountId, filmwissenRechercheAktiv, kontoIstAktuell]);

  return {
    accountId,
    vorbewertungAktiv,
    vorbewertungSperrgrund,
    prognoseLaufId,
    prognoseFehler,
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
