import {
  RICHTUNGEN, SIGNAL_ARTEN, SICHERHEITEN, hatEinwilligung, pruefeProfil,
} from "./profil.js";

export const PROGNOSE_TYPEN = Object.freeze(["film", "filmreihe", "serie"]);
export const MAX_PROGNOSE_SIGNALE = 20;

const VERBOTEN = /[\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);
const text = (wert, max) => {
  if (typeof wert !== "string") return null;
  const sauber = wert.trim();
  return sauber && sauber.length <= max && !VERBOTEN.test(sauber) ? sauber : null;
};
const optionText = (wert, max) => {
  if (wert == null || wert === "") return null;
  return text(wert, max);
};
const textListe = (wert, maxAnzahl = 20, maxLaenge = 40) => {
  if (wert == null) return [];
  const liste = Array.isArray(wert) ? wert : [wert];
  if (liste.length > maxAnzahl) return null;
  const sauber = liste.map((v) => text(v, maxLaenge));
  return sauber.every(Boolean) ? [...new Set(sauber)] : null;
};

function signalRang(signal) {
  const sicher = { hoch: 3, mittel: 2, niedrig: 1 }[signal.sicherheit] || 0;
  return (Number(signal.staerke) || 0) * 10 + sicher;
}

export function bauePrognoseAuftrag(film, profil) {
  const fehler = [];
  if (!istObjekt(film)) return { ok: false, payload: null, profilVersion: null, fehler: ["Film fehlt"] };
  if (!PROGNOSE_TYPEN.includes(film.typ || "film")) fehler.push("Dieser Eintragstyp unterstützt keine Prognose");
  if (film.bewertung != null) fehler.push("Der Eintrag ist bereits bewertet");

  const titel = text(film.titel, 160);
  const originaltitel = optionText(film.originaltitel, 160);
  const jahr = film.jahr;
  const genres = textListe(film.genre ?? film.genres, 20, 40);
  const tags = textListe(film.tags, 20, 40);
  if (!titel) fehler.push("Titel ist ungültig");
  if (film.originaltitel != null && film.originaltitel !== "" && !originaltitel) fehler.push("Originaltitel ist ungültig");
  if (!Number.isInteger(jahr) || jahr < 1870 || jahr > 2200) fehler.push("Jahr ist ungültig");
  if (!genres) fehler.push("Genres sind ungültig");
  if (!tags) fehler.push("Tags sind ungültig");

  if (!istObjekt(profil) || profil.beschaedigt) {
    fehler.push("Geschmacksprofil fehlt oder ist beschädigt");
  } else {
    const profilFehler = pruefeProfil(profil);
    if (profilFehler.length) fehler.push("Geschmacksprofil ist ungültig");
    if (!hatEinwilligung(profil)) fehler.push("Geschmacksprofil ist nicht freigegeben");
  }

  const bestaetigt = Array.isArray(profil?.signale) ? profil.signale : [];
  if (bestaetigt.length === 0) fehler.push("Für eine Prognose braucht es mindestens ein bestätigtes Profilsignal");
  if (fehler.length) return { ok: false, payload: null, profilVersion: profil?.version || null, fehler };

  /* Stärkere und sicherere bestätigte Angaben zuerst; danach stabil nach
     Art/Wert. So bleibt der Auftrag auch bei sehr großen Profilen begrenzt
     und bei identischer Eingabe bytegleich. Belege, Quellen und Zeitstempel
     werden bewusst nicht kopiert. */
  const signale = [...bestaetigt]
    .sort((a, b) => signalRang(b) - signalRang(a)
      || String(a.art).localeCompare(String(b.art), "de")
      || String(a.wert).localeCompare(String(b.wert), "de"))
    .slice(0, MAX_PROGNOSE_SIGNALE)
    .map((signal) => ({
      art: signal.art,
      wert: signal.wert,
      richtung: signal.richtung,
      staerke: signal.staerke,
      sicherheit: signal.sicherheit,
    }));

  /* Redundante letzte Grenze: Selbst ein Profil, das die Prüfung künftig
     additiv erweitert, darf keine freie Art/Richtung/Sicherheit übertragen. */
  if (signale.some((s) => !SIGNAL_ARTEN.includes(s.art)
      || !RICHTUNGEN.includes(s.richtung)
      || !SICHERHEITEN.includes(s.sicherheit)
      || !Number.isInteger(s.staerke) || s.staerke < 1 || s.staerke > 5
      || !text(s.wert, 60))) {
    return { ok: false, payload: null, profilVersion: profil.version, fehler: ["Profilsignale sind ungültig"] };
  }

  const achsen = {
    wie: Number.isInteger(profil.achsen?.wie) ? profil.achsen.wie : null,
    was: Number.isInteger(profil.achsen?.was) ? profil.achsen.was : null,
    warum: Number.isInteger(profil.achsen?.warum) ? profil.achsen.warum : null,
  };
  return {
    ok: true,
    profilVersion: profil.version,
    fehler: [],
    payload: {
      film: {
        titel,
        originaltitel,
        jahr,
        typ: film.typ || "film",
        genres,
        tags,
      },
      profil: { signale, achsen },
    },
  };
}
