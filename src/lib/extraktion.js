/* ---------- KI-Weg: Serverantwort → Profil-Vorschlag (Etappe 7, Phase 3) ----------

   Die Gegenseite zu `profile-extract` in der Edge Function. Sie nimmt die
   geprüfte Serverantwort und macht daraus das, was `profil.js` versteht:
   Signale für `sammle` und einen Rahmen für `vorschlagRahmen`.

   WARUM HIER NOCHMAL GEPRÜFT WIRD, OBWOHL DER SERVER SCHON PRÜFT
   Nicht aus Misstrauen gegen den eigenen Endpunkt, sondern weil die beiden
   Prüfungen verschiedene Fragen beantworten. Der Server prüft, was er
   allein prüfen KANN: ob der Beleg wirklich im Antworttext steht — dafür
   braucht er die Antworten, und die bekommt `profil.js` nie zu sehen.
   Dieses Modul prüft, ob das Ergebnis in das Datenmodell passt: Arten,
   Richtungen, Quellen, Längen, verbotene Zeichen. Beide Prüfungen sind
   nötig, und keine ersetzt die andere.

   Dazu kommt: Zwischen Endpunkt und diesem Modul liegt das Netz. Eine
   Antwort, die unterwegs verändert wird oder aus einem älteren Build des
   Endpunkts stammt, ist kein theoretischer Fall — der Endpunkt wird
   unabhängig von der App deployt, und ein Client von gestern spricht
   regelmäßig mit einem Server von heute.

   WAS DIESES MODUL NICHT TUT
   Es schreibt nichts und bestätigt nichts. Die Extraktion geht durch
   dieselbe Zwei-Bühnen-Mechanik wie der deterministische Weg — nur ist die
   Bestätigung hier ECHT und nicht bloß die letzte Seite eines Formulars:
   Der Nutzer hat diese Vorschläge nicht selbst gemacht, er muss sie also
   wirklich einzeln ansehen können. Das ist der Abnahme-Punkt
   „Extraktionsergebnis wird vor Übernahme angezeigt". */

import {
  SIGNAL_ARTEN, RICHTUNGEN, SICHERHEITEN, QUELLEN, pruefeSignal,
} from "./profil.js";

/* Muss mit `EXTRAKT_QUELLEN` in der Edge Function übereinstimmen. Die drei
   Fragen sind einzeln geführt, nicht als Sammelwert „onboarding": Der Eval
   in Phase 4 stellt SOLL und IST je Frage gegenüber und braucht die
   Zuordnung Frage → Signal. Ein Sammelwert hätte sie unwiederbringlich
   eingeebnet. */
export const FRAGEN = Object.freeze([
  {
    id: "K1",
    kurz: "Der Frame",
    frage: "Welcher einzelne Moment aus einem Film ist für dich der beste der Kinogeschichte?",
    hilfe: "Eine Szene, eine Einstellung, ein Bild. Beschreib sie so, wie sie dir im Kopf ist — es muss nichts Berühmtes sein.",
  },
  {
    id: "K2",
    kurz: "Der Wiedergänger",
    frage: "Welchen Film hast du am häufigsten gesehen, und was zieht dich immer wieder rein?",
    hilfe: "Auch mehrere sind in Ordnung. Interessant ist vor allem der zweite Teil der Frage.",
  },
  {
    id: "K4",
    kurz: "Der Pflichtfilm",
    frage: "Welchen Film müsste jemand gesehen haben, den du gerade erst kennenlernst?",
    hilfe: "Und warum ausgerechnet den? Der Grund sagt mehr als der Titel.",
  },
]);

/* Muss mit `ANTWORT_MAX_ZEICHEN` in der Edge Function übereinstimmen. Hier
   ist sie die Anzeige-Grenze (Zähler unter dem Feld), dort die harte —
   der Server kürzt, was länger ist, und die Belegprüfung liefe danach gegen
   einen anderen Text als den eingegebenen. Ein Nutzer, der über die Grenze
   schreibt, verlöre also genau die Signale aus dem abgeschnittenen Teil,
   ohne zu erfahren warum. Deshalb steht die Grenze schon im Formular. */
export const ANTWORT_MAX_ZEICHEN = 2000;

/* Der Server verlangt mindestens eine Antwort. Ein Aufruf ohne Text wäre
   bezahlt und könnte nichts liefern. */
export function antwortenBrauchbar(antworten) {
  return FRAGEN.some((f) => typeof antworten?.[f.id] === "string" && antworten[f.id].trim().length > 0);
}

/* Der Payload für `aiService.runTask`. `listen.genres` ist Pflicht — ohne
   Wertelisten weist der Endpunkt ab, bevor er zahlt, weil jedes Genre-Signal
   sonst zwangsläufig erfunden wäre. */
export function bauePayload(antworten, { genres = [] } = {}) {
  const aus = {};
  for (const f of FRAGEN) {
    const t = typeof antworten?.[f.id] === "string" ? antworten[f.id].trim() : "";
    if (t) aus[f.id] = t.slice(0, ANTWORT_MAX_ZEICHEN);
  }
  return {
    antworten: aus,
    listen: { genres: [...new Set(genres.filter((g) => typeof g === "string" && g.trim()))].slice(0, 120) },
  };
}

/* ---------- Antwort → Vorschlag ---------- */

const istText = (x) => typeof x === "string" && x.trim().length > 0;

const ERGEBNIS_MODI = new Set(["structured", "partial", "degraded"]);
const HINWEIS_MAX_ZEICHEN = 320;
const HINWEIS_UNSICHER = /(?:https:\/\/|sk-ant-[a-z0-9_-]{12,}|sbp_[a-z0-9_-]{12,}|(?:bearer\s+)[a-z0-9._~+\/-]{16,}|(?:authorization|x-api-key|api[_ -]?key|password|passwort|service[_ -]?role|secret|token)\s*[=:]|<\/?(?:thinking|system|developer|prompt)\b|chain[ -]of[ -]thought|system(?:-| )prompt|developer(?:-| )message)/i;
const PROFIL_PARTIAL_HINWEIS =
  "Die KI-Antwort war teilweise unvollständig. Nur sichere Profilvorschläge werden angezeigt.";
const PROFIL_DEGRADED_HINWEIS =
  "Die KI-Antwort konnte nicht sicher in Profilvorschläge umgewandelt werden.";

/* `displayText` bleibt reine Darstellung. Er wird weder Teil von `rahmen`
   noch eines Signals und kann deshalb selbst bei einer späteren Bestätigung
   nicht in den Profiltopf geraten. Die Servicegrenze prüft denselben Vertrag;
   diese kleine zweite Wache schützt auch injizierte Test-/Demo-Dienste. */
function liesDarstellung(darstellung) {
  const mode = ERGEBNIS_MODI.has(darstellung?.responseMode)
    ? darstellung.responseMode : null;
  if (mode !== "partial" && mode !== "degraded") {
    return { responseMode: mode, hinweis: null };
  }
  const text = darstellung?.displayText;
  const sicher = typeof text === "string" && text === text.trim() && !!text
    && text.length <= HINWEIS_MAX_ZEICHEN
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)
    && !/[*_>#`~]/.test(text) && !HINWEIS_UNSICHER.test(text);
  return {
    responseMode: mode,
    hinweis: sicher
      ? text
      : mode === "degraded" ? PROFIL_DEGRADED_HINWEIS : PROFIL_PARTIAL_HINWEIS,
  };
}

/* NUR die drei Fragenkennungen, nicht die ganze `QUELLEN`-Liste.

   Der Unterschied ist kein Formalismus. `QUELLEN` enthält auch `schlagwort`,
   `bewertung` und `korrektur` — Herkünfte, die eine EIGENE Aussage tragen:
   „das hast du selbst angekreuzt", „das hast du selbst korrigiert". Die
   Profil-Ansicht zeigt sie genau so an. Ließe man sie über die Extraktion
   herein, könnte ein Modell einem erfundenen Zug die Herkunft „von dir
   angekreuzt" verpassen — und der Nutzer sähe eine Zustimmung, die er nie
   gegeben hat. Aus diesem Weg dürfen nur die drei Fragen kommen, aus denen
   dieser Weg besteht.

   `QUELLEN` bleibt trotzdem geprüft: Die drei Werte müssen dort stehen,
   sonst verwirft `pruefeSignal` sie später. Zwei Listen an zwei Orten. */
const EXTRAKT_QUELLEN = FRAGEN.map((f) => f.id).filter((id) => QUELLEN.includes(id));

function quelleGueltig(q) {
  return typeof q === "string" && EXTRAKT_QUELLEN.includes(q);
}

/* Aus der geprüften Serverantwort ein Bündel, das `profil.js` annimmt.

   Rückgabe:
     signale       gültige Signale, bereit für `sammle`
     rahmen        { achsen?, filme?, nichtDeutbar? } für `vorschlagRahmen`
     verworfen     was hier durchgefallen ist, MIT Grund — nie still
     ohneBeleg     was der SERVER wegen fehlendem Beleg verworfen hat

   `verworfen` und `ohneBeleg` sind getrennt, weil sie Verschiedenes
   bedeuten. `ohneBeleg` heißt: Das Modell hat etwas behauptet und konnte es
   nicht belegen — eine Aussage über die Qualität des Laufs. `verworfen`
   heißt: Server und Client sind sich über das Datenmodell nicht einig — eine
   Aussage über den Bauzustand. Zusammengeworfen sähen beide gleich aus, und
   der zweite Fall verschwände hinter dem ersten. */
export function ausExtraktion(antwort, darstellung = null) {
  const a = antwort && typeof antwort === "object" ? antwort : {};
  const signale = [];
  const verworfen = [];

  for (const roh of Array.isArray(a.signale) ? a.signale : []) {
    const s = roh && typeof roh === "object" ? roh : {};
    if (!SIGNAL_ARTEN.includes(s.art)) { verworfen.push({ roh: s, grund: "Art unbekannt: " + String(s.art) }); continue; }
    if (!RICHTUNGEN.includes(s.richtung)) { verworfen.push({ roh: s, grund: "Richtung unbekannt" }); continue; }
    if (!SICHERHEITEN.includes(s.sicherheit)) { verworfen.push({ roh: s, grund: "Sicherheit unbekannt" }); continue; }
    if (!quelleGueltig(s.quelle)) { verworfen.push({ roh: s, grund: "Quelle unbekannt: " + String(s.quelle) }); continue; }
    if (!istText(s.wert) || !istText(s.beleg)) { verworfen.push({ roh: s, grund: "Wert oder Beleg fehlt" }); continue; }

    /* KEIN Vorgabewert fuer `staerke`. Vorher stand hier `: 3` -- und damit
       erfand dieses Modul eine Angabe, die das Modell nie gemacht hat, und
       zwar an der einzigen Stelle, die in `promptFassung` die Sortierung
       bestimmt. Ein Modul, dessen Kernzusage "nie erfundene" lautet, darf
       eine fehlende Zahl nicht durch eine plausible ersetzen. Fehlt sie oder
       liegt sie ausserhalb 1..5, ist das Signal unvollstaendig und wird MIT
       Grund verworfen -- sichtbar, nicht still geheilt. */
    if (!Number.isInteger(s.staerke) || s.staerke < 1 || s.staerke > 5) {
      verworfen.push({ roh: s, grund: "staerke fehlt oder liegt ausserhalb 1..5" });
      continue;
    }
    const kandidat = {
      art: s.art,
      wert: String(s.wert).trim(),
      richtung: s.richtung,
      staerke: s.staerke,
      sicherheit: s.sicherheit,
      quelle: s.quelle,
      beleg: String(s.beleg).trim(),
    };
    /* Die Modulprüfung als letzte Instanz — sie kennt Längengrenzen und
       verbotene Zeichen, die hier niemand doppelt pflegen soll. Ein Signal,
       das `pruefeSignal` nicht besteht, würde `sammle` ohnehin verwerfen,
       aber dann OHNE nachvollziehbaren Grund für die Oberfläche. */
    const fehler = pruefeSignal(kandidat);
    if (fehler.length) { verworfen.push({ roh: s, grund: fehler.join("; ") }); continue; }
    signale.push(kandidat);
  }

  const rahmen = {};

  const filme = [];
  for (const roh of Array.isArray(a.filme) ? a.filme : []) {
    const f = roh && typeof roh === "object" ? roh : {};
    /* Auch hier MIT Grund, nicht still. Ein Filmeintrag ohne Titel ist kein
       harmloser Leerlauf: Er bedeutet, dass Server und Client sich ueber die
       Form nicht einig sind, und genau das soll die Oberflaeche zeigen
       koennen. Vorher verschwand er spurlos, und die Zahl in der Vorschau
       stimmte nicht mit dem ueberein, was zurueckkam. */
    if (!istText(f.titel)) { verworfen.push({ roh: f, grund: "Filmeintrag ohne Titel" }); continue; }
    const eintrag = {
      titel: String(f.titel).trim(),
      jahr: Number.isInteger(f.jahr) ? f.jahr : null,
      masterId: null,
      /* `sicher: false`. Der Server hat geprüft, dass der Titel in den
         Antworten VORKOMMT — nicht, dass es den Film gibt oder dass er im
         Bestand steht. `promptFassung` lässt unsichere Filme weg; sie
         wandern also erst dann in einen Prompt, wenn der Nutzer sie in der
         Profil-Ansicht bestätigt hat. Beim deterministischen Weg ist das
         anders, dort kommt der Titel aus dem eigenen Bestand. */
      sicher: false,
    };
    if (RICHTUNGEN.includes(f.richtung)) eintrag.richtung = f.richtung;
    filme.push(eintrag);
  }
  if (filme.length) rahmen.filme = filme;

  const achsen = {};
  const roh = a.achsen_tendenz && typeof a.achsen_tendenz === "object" ? a.achsen_tendenz : {};
  for (const k of ["wie", "was", "warum"]) {
    /* Nur gesetzte Achsen. `null` heißt beim Endpunkt ausdrücklich „geben
       die Antworten nicht her" — und `pickRahmen` liest eine fehlende Achse
       als „unbekannt, nicht ändern". Eine `null` durchzureichen hieße
       dagegen löschen. */
    if (Number.isInteger(roh[k]) && roh[k] >= 0 && roh[k] <= 5) achsen[k] = roh[k];
  }
  if (Object.keys(achsen).length) rahmen.achsen = achsen;

  const nichtDeutbar = (Array.isArray(a.nicht_deutbar) ? a.nicht_deutbar : [])
    .map((x) => (istText(x) ? String(x).trim() : null))
    .filter(Boolean);
  if (nichtDeutbar.length) rahmen.nichtDeutbar = nichtDeutbar;

  return {
    signale,
    rahmen: Object.keys(rahmen).length ? rahmen : null,
    verworfen,
    ohneBeleg: Number.isInteger(a.verworfen_ohne_beleg) ? a.verworfen_ohne_beleg : 0,
    ...liesDarstellung(darstellung),
  };
}

/* Für die Vorschau: Welche Frage steckt hinter einem Signal? */
export function frageZu(quelle) {
  return FRAGEN.find((f) => f.id === quelle) || null;
}
