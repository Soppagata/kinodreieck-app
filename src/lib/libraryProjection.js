/* Datenfreie Projektionen für Bibliothek, Kinoprogramm und Artikel.
   Die Funktionen kennen weder React noch die mitgelieferten JSON-Beilagen und
   lassen sich deshalb unabhängig vom Browser testen und wiederverwenden. */

import { matchFilm, score } from "./match.js";
import { hatPhysischeQuelle } from "./quellen.js";
import { heileRotlinks } from "./artikel.js";
import { kanonischeStabileId } from "./mediathekSelection.js";

export function gueltigerArtikel(a) {
  return !!a && typeof a === "object"
    && typeof a.id === "string" && a.id.length > 0
    && typeof a.titel === "string"
    && Array.isArray(a.liste)
    && a.liste.every((eintrag) => !!eintrag && typeof eintrag === "object")
    && (a.text === undefined || a.text === null || typeof a.text === "string");
}

export function baueRefUniversum(master, mustwatch) {
  return [
    ...(master || []),
    ...(mustwatch || []).map((eintrag) => ({
      id: eintrag.id,
      titel: eintrag.titel,
      jahr: null,
      typ: "film",
    })),
  ];
}

export function baueKinoMatches(programm, master) {
  if (!programm?.filme || !master) {
    return { matched: [], rest: programm?.filme || [] };
  }
  const nachFilmAtId = new Map(
    master.filter((film) => film.film_at_id).map((film) => [film.film_at_id, film]),
  );
  const matched = [];
  const rest = [];
  for (const programmFilm of programm.filme) {
    const film = (programmFilm.film_at_id && nachFilmAtId.get(programmFilm.film_at_id))
      || matchFilm(programmFilm.t, programmFilm.j, master)
      || (programmFilm.ot && programmFilm.ot !== programmFilm.t
        ? matchFilm(programmFilm.ot, programmFilm.j, master)
        : null);
    if (film) matched.push({ prog: programmFilm, film });
    else rest.push(programmFilm);
  }
  const besitzRang = (film) => (hatPhysischeQuelle(film.quelle) ? 0 : 1);
  matched.sort((a, b) => (
    besitzRang(a.film) - besitzRang(b.film)
    || score(b.film) - score(a.film)
  ));
  return { matched, rest };
}

export function filtereAktiveKinoPins(pins, programm) {
  const liste = Array.isArray(pins) ? [...pins] : [];
  if (!Array.isArray(programm?.filme)) return liste;
  const slots = new Set(programm.filme.flatMap((film) => (film.z || []).map((termin) => `${film.t}\n${termin}`)));
  return liste.filter((pin) => slots.has(`${pin.t}\n${pin.z}`));
}

/* Reiner Sprungplan fuer explizite Must-Watch-Verknuepfungen. Die App setzt
   danach nur noch den passenden Tab/Fokus. So bleiben insbesondere die zwei
   Kino-Faelle (bekannter Masterfilm vs. reiner Programmeintrag) ausserhalb
   von React regressionspruefbar. */
export function planeMustwatchSprung(verknuepfung, eintrag, master) {
  const ziel = verknuepfung?.ziel;
  const ref = verknuepfung?.id;
  if (ziel === "master") return { bereich: "mediathek", fokus: ref };
  if (ziel === "programm") {
    const film = (master || []).find((f) =>
      f.film_at_id != null && String(f.film_at_id) === String(ref));
    return {
      bereich: "kino",
      zeigeAlles: true,
      fokus: film
        ? { art: "film", ref: film.id, titel: eintrag?.titel || film.titel || "" }
        : { art: "programm", ref, titel: eintrag?.titel || "" },
    };
  }
  if (ziel === "streaming") {
    return {
      bereich: "streaming",
      fokus: { art: "entdecken", ref, titel: eintrag?.titel || "" },
    };
  }
  return null;
}

function kanonischePrimitiveId(wert) {
  if (typeof wert !== "string" && typeof wert !== "number") return null;
  return kanonischeStabileId(wert);
}

export function kanonisiereFilmLoeschIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, fehlercode: "ZIELE_LEER", zielIds: [] };
  }
  const zielIds = [];
  const gesehen = new Set();
  for (const rohId of ids) {
    const id = kanonischePrimitiveId(rohId);
    if (!id) return { ok: false, fehlercode: "ZIEL_ID_UNGUELTIG", zielIds: [] };
    if (gesehen.has(id)) {
      return { ok: false, fehlercode: "ZIEL_ID_KOLLISION", zielIds: [] };
    }
    gesehen.add(id);
    zielIds.push(id);
  }
  return { ok: true, zielIds };
}

function abgebrocheneFilmLoeschung(fehlercode, zielIds = []) {
  return {
    ok: false,
    abgebrochen: true,
    fehlercode,
    zielIds,
    folgen: { masterEintraege: 0, artikelRefs: 0, mustwatchRefs: 0 },
  };
}

/* Reine Mengenprojektion für die drei referenztragenden persönlichen Töpfe.
   Jeder Topf wird genau einmal durchlaufen. Ziele werden ausschließlich über
   ihre kanonische stabile ID gebunden; Index-, Titel- und Aliasfallbacks gibt
   es nicht. Die Funktion schreibt nichts und liefert bei jeder Mehrdeutigkeit
   einen fail-closed Abbruchplan. */
export function planeFilmBatchLoeschung(master, artikel, mustwatch, ids) {
  if (!Array.isArray(master) || !Array.isArray(artikel) || !Array.isArray(mustwatch)) {
    return abgebrocheneFilmLoeschung("BASIS_UNGUELTIG");
  }
  const ziele = kanonisiereFilmLoeschIds(ids);
  if (!ziele.ok) return abgebrocheneFilmLoeschung(ziele.fehlercode);
  const { zielIds } = ziele;
  const zielMenge = new Set(zielIds);
  const vorkommen = new Map(zielIds.map((id) => [id, 0]));

  const nextMaster = [];
  for (const film of master) {
    const id = kanonischePrimitiveId(film?.id);
    if (!id || !zielMenge.has(id)) {
      nextMaster.push(film);
      continue;
    }
    vorkommen.set(id, vorkommen.get(id) + 1);
  }
  if (zielIds.some((id) => vorkommen.get(id) !== 1)) {
    return abgebrocheneFilmLoeschung("ZIEL_NICHT_EINDEUTIG_IM_MASTER", zielIds);
  }

  let mustwatchRefs = 0;
  const mustwatchRoh = [];
  for (const eintrag of mustwatch) {
    const eigeneId = kanonischePrimitiveId(eintrag?.id);
    if (eigeneId && zielMenge.has(eigeneId)) {
      return abgebrocheneFilmLoeschung("MUSTWATCH_ID_KOLLISION", zielIds);
    }
    const link = eintrag?.verknuepfung;
    const linkId = kanonischePrimitiveId(link?.id);
    if (link?.ziel === "master" && linkId && zielMenge.has(linkId)) {
      mustwatchRefs++;
      mustwatchRoh.push({ ...eintrag, verknuepfung: null });
    } else {
      mustwatchRoh.push(eintrag);
    }
  }

  let artikelRefs = 0;
  const artikelRoh = artikel.map((eintrag) => {
    let geaendert = false;
    const liste = (eintrag.liste || []).map((zeile) => {
      const ref = kanonischePrimitiveId(zeile?.ref);
      if (!ref || !zielMenge.has(ref)) return zeile;
      artikelRefs++;
      geaendert = true;
      const { abgleich: _abgleich, ...ohneAbgleich } = zeile;
      return { ...ohneAbgleich, ref: null };
    });
    if (!geaendert) return eintrag;
    const { abgleichStat: _abgleichStat, ...ohneAbgleichStat } = eintrag;
    return { ...ohneAbgleichStat, liste };
  });

  return {
    ok: true,
    abgebrochen: false,
    zielIds,
    master: nextMaster,
    artikel: artikelRefs ? artikelRoh : artikel,
    mustwatch: mustwatchRefs ? mustwatchRoh : mustwatch,
    folgen: {
      masterEintraege: zielIds.length,
      artikelRefs,
      mustwatchRefs,
    },
  };
}

/* Die bestehende Einzelprojektion bleibt bis zur UI-Umstellung kompatibel,
   besitzt aber keine zweite Semantik: Sie delegiert auf denselben Batchplan. */
export function planeFilmLoeschung(master, artikel, mustwatch, id) {
  return planeFilmBatchLoeschung(master, artikel, mustwatch, [id]);
}

/* Ein Must-Watch-Eintrag ist Teil desselben Referenzuniversums wie die
   Mediathek. Beim Löschen müssen seine Blog-Backlinks deshalb im selben
   bestätigten Vorgang zu sichtbaren Rotlinks werden. Alle übrigen Artikel- und
   Must-Watch-Felder (Besitz, Beschreibung, Notiz, Publikationszustand …)
   bleiben unverändert. */
export function planeMustwatchLoeschung(artikel, mustwatch, id) {
  const mustwatchListe = Array.isArray(mustwatch) ? mustwatch : [];
  const artikelListe = Array.isArray(artikel) ? artikel : [];
  const vorhanden = mustwatchListe.some((eintrag) => eintrag.id === id);
  if (!vorhanden) {
    return { artikel: artikelListe, mustwatch: mustwatchListe, folgen: { artikelRefs: 0 } };
  }
  let artikelRefs = 0;
  const nextArtikel = artikelListe.map((eintrag) => {
    let geaendert = false;
    const liste = (eintrag.liste || []).map((zeile) => {
      if (zeile.ref !== id) return zeile;
      artikelRefs++;
      geaendert = true;
      return { ...zeile, ref: null, abgleich: undefined };
    });
    return geaendert ? { ...eintrag, liste, abgleichStat: undefined } : eintrag;
  });
  return {
    artikel: artikelRefs ? nextArtikel : artikelListe,
    mustwatch: mustwatchListe.filter((eintrag) => eintrag.id !== id),
    folgen: { artikelRefs },
  };
}

/* Vollständiger Master-Ersatz (Import oder Startmoduswechsel):
   - MW-Einträge bleiben samt persönlichen Feldern erhalten; lediglich Links
     auf nicht mehr vorhandene Master-IDs werden gelöst.
   - weiterhin gültige Blogrefs bleiben stabil,
   - ungültige truthy Refs werden zuerst zu Rotlinks,
   - danach darf die bestehende eindeutige Rotlink-Heilung gegen das NEUE
     Universum aus Master und Must-Watch laufen.
   Damit können IDs aus dem alten Master nie still als tote Links überleben. */
export function planeMasterErsetzung(neuerMaster, artikel, mustwatch) {
  const filme = Array.isArray(neuerMaster) ? neuerMaster : [];
  const artikelListe = Array.isArray(artikel) ? artikel : [];
  const mustwatchListe = Array.isArray(mustwatch) ? mustwatch : [];
  const masterIds = new Set(filme.map((film) => film.id));
  let mustwatchRefs = 0;
  const nextMustwatchRoh = mustwatchListe.map((eintrag) => {
    const link = eintrag.verknuepfung;
    if (link?.ziel !== "master" || masterIds.has(link.id)) return eintrag;
    mustwatchRefs++;
    return { ...eintrag, verknuepfung: null };
  });
  const nextMustwatch = mustwatchRefs ? nextMustwatchRoh : mustwatchListe;
  const gueltigeRefs = new Set([
    ...masterIds,
    ...nextMustwatch.map((eintrag) => eintrag.id),
  ]);
  let artikelRefs = 0;
  const bereinigtRoh = artikelListe.map((eintrag) => {
    let geaendert = false;
    const liste = (eintrag.liste || []).map((zeile) => {
      if (!zeile.ref || gueltigeRefs.has(zeile.ref)) return zeile;
      artikelRefs++;
      geaendert = true;
      return { ...zeile, ref: null, abgleich: undefined };
    });
    return geaendert ? { ...eintrag, liste, abgleichStat: undefined } : eintrag;
  });
  const bereinigt = artikelRefs ? bereinigtRoh : artikelListe;
  const universum = [
    ...filme,
    ...nextMustwatch.map((eintrag) => ({
      id: eintrag.id, titel: eintrag.titel, jahr: null, typ: "film",
    })),
  ];
  const [geheilt, geheilteRefs] = heileRotlinks(bereinigt, universum);
  return {
    master: filme,
    artikel: geheilteRefs ? geheilt : bereinigt,
    mustwatch: nextMustwatch,
    folgen: { artikelRefs, mustwatchRefs, geheilteRefs },
  };
}
