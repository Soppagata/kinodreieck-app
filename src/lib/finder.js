/* ============================================================
   Finder — deterministischer Film-Chat (KEIN LLM)
   ------------------------------------------------------------
   parseAnfrage: Freitext -> Signale (Genres, Achsen, Kategorien,
   Jahrzehnte, Quellen, Zeit, Entdecken) über das Vokabular-Datenmodul.
   sucheFinder: Signale -> gerankte Treffer aus Mediathek + Kino +
   Streaming. Ranking = Dreieck-Score + transparente Boosts.
   Entdecken-Titel (ungeprüft) NUR bei explizitem Entdecken-Signal.
   ============================================================ */
import { norm, schlagseite, score } from "./match.js";
/* Import-Attribut ist unter Node ab 22 Pflicht (ERR_IMPORT_ATTRIBUTE_MISSING).
   Ohne es lässt sich dieses Modul nur über den Vite-Bundler laden — genau der
   Grund, warum der Finder bis Etappe 6 ohne einen einzigen Modultest lief.
   Vite/esbuild verstehen das Attribut ebenfalls; der Bundle-Weg bleibt gleich. */
import vokabular from "../data/finder_vokabular.json" with { type: "json" };

/* Eigenes Vokabular (Einstellungen → Vokabular-Editor): eigene Stimmungs-
   wörter ergänzen die eingebauten — bei Namensgleichheit gewinnt das eigene.
   Wird beim Boot und nach jeder Änderung von der App gesetzt. */
const eigeneStimmungen = {};
export function setzeEigeneStimmungen(map) {
  for (const k of Object.keys(eigeneStimmungen)) delete eigeneStimmungen[k];
  Object.assign(eigeneStimmungen, map || {});
}
export function alleStimmungen() {
  return { ...(vokabular.stimmungen || {}), ...eigeneStimmungen };
}

/* Wort-Match mit Flexions-Toleranz: exaktes Wort immer; ab 5 Zeichen reicht
   der Wortanfang ("stylisch" -> "stylischer"). Kurze Wörter ("kult") bleiben
   exakt — sonst matcht "kultur". Mehrwort-Phrasen als Substring. */
const hatWort = (text, phrase) => {
  if (phrase.includes(" ")) return text.includes(phrase);
  if ((" " + text + " ").includes(" " + phrase + " ")) return true;
  return phrase.length >= 5 && text.split(" ").some((tok) => tok.startsWith(phrase));
};

/* ---------- Etappe 6: Genre-Vergleich, Negation, Jahresgrenzen ---------- */

/* Vergleichsschlüssel für Genres. norm() macht aus "Science-Fiction"
   "science fiction", aus "Komödie" aber "komodie" — während Vokabular-Ziele
   deutsch transliteriert geschrieben sind ("komoedie"). Beides traf sich
   vorher nie: "lustig" fand keine Komödie, "kein Sci-Fi" schloss nichts aus.
   Im positiven Fall fällt das als leere Suche auf, im Ausschlussfall STILL —
   der Nutzer bekommt genau das, was er ausgeschlossen hat. Deshalb ein
   Schlüssel, der Trennzeichen und oe/ue/ae einzieht.
   Bewusst NICHT geheilt: echte Wortunterschiede ("scifi" vs.
   "sciencefiction") — dafür zeigen die Synonyme im Vokabular auf die
   Schreibweise der Masterliste. */
export const genreKey = (g) => norm(g)
  .replace(/[\s-]+/g, "")
  .replace(/oe/g, "o").replace(/ue/g, "u").replace(/ae/g, "a");

const tokenListe = (nt) => String(nt || "").split(" ").filter(Boolean);

/* Token-Index einer Zeichenposition — für Regex-Treffer (Jahrzehnte, Jahre),
   die keine Vokabelphrase sind. */
const tokenIndexAt = (nt, pos) => {
  let idx = 0;
  for (let i = 0; i < pos && i < nt.length; i++) if (nt[i] === " ") idx++;
  return idx;
};

/* Welche Tokens stehen unter einer Negation? Ein Marker ("kein", "ohne",
   "nicht") negiert die bis zu drei folgenden Tokens und endet früher an einem
   Grenzwort ("aber", "und") oder am nächsten Marker. Ohne dieses Fenster
   verschluckt "kein Horror aber spannend" auch das Positive. */
function negierteIndizes(tokens) {
  const marker = new Set((vokabular.negation || []).map(norm));
  const grenze = new Set((vokabular.grenzwoerter || []).map(norm));
  const negiert = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (!marker.has(tokens[i])) continue;
    for (let j = i + 1; j <= i + 3 && j < tokens.length; j++) {
      if (grenze.has(tokens[j]) || marker.has(tokens[j])) break;
      negiert.add(j);
    }
  }
  return negiert;
}

/* Wo trifft eine Vokabelphrase? Spiegelt die Regeln von hatWort auf
   Token-Ebene (exaktes Wort; ab 5 Zeichen Wortanfang; Mehrwort als Folge).
   Leeres Ergebnis heißt: hatWort hat über einen Substring getroffen, der
   keinem Token entspricht — dann ist keine Aussage über Negation möglich. */
function trefferIndizes(tokens, phrase) {
  const teile = String(phrase || "").split(" ").filter(Boolean);
  const treffer = [];
  if (!teile.length) return treffer;
  if (teile.length > 1) {
    for (let i = 0; i + teile.length <= tokens.length; i++) {
      if (teile.every((t, k) => tokens[i + k] === t)) treffer.push(i);
    }
    return treffer;
  }
  const w = teile[0];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === w || (w.length >= 5 && tokens[i].startsWith(w))) treffer.push(i);
  }
  return treffer;
}

/* Wirksame Jahresgrenzen aus zwei Quellen. Eine ausdrücklich genannte Grenze
   schlägt die aus einer Stimmung abgeleitete — JE SEITE getrennt: "oldschool
   ab 1975" heißt 1975 bis 1989. Wird zentral gehalten, weil ohneStimmung
   dieselbe Regel nach dem Abwählen erneut anwenden muss; vorher rechnete es
   nur aus den Stimmungen und löschte einen genannten Bereich still weg. */
export function jahrGrenzen(sig) {
  let min = null, max = null;
  for (const st of sig.stimmungen || []) {
    const def = alleStimmungen()[st] || {};
    if (def.jahr_max && (!max || def.jahr_max < max)) max = def.jahr_max;
    if (def.jahr_min && (!min || def.jahr_min > min)) min = def.jahr_min;
  }
  /* Abgewählte Stimmungsgrenze (E-2). Eine ausdrücklich genannte Grenze bleibt
     davon unberührt — die wird durch Leeren von jahrExplizit* entfernt. */
  const unterdrueckt = sig.jahrUnterdrueckt || {};
  if (unterdrueckt.min) min = null;
  if (unterdrueckt.max) max = null;
  return {
    jahrMin: sig.jahrExplizitMin == null ? min : sig.jahrExplizitMin,
    jahrMax: sig.jahrExplizitMax == null ? max : sig.jahrExplizitMax,
  };
}

export function parseAnfrage(text, master, zusatzGenres = []) {
  const nt = norm(text);
  const sig = {
    genres: [], achsen: [], kategorien: [], dekaden: [], quellen: [], zeit: [],
    stimmungen: [], reihen: [], jahrMin: null, jahrMax: null, entdecken: false,
    /* Etappe 6 — Ausschlüsse. jahrMin/jahrMax bleiben die WIRKSAMEN Werte, die
       alle Sucher lesen; jahrExplizit* hält nur fest, was ausdrücklich genannt
       wurde, damit das Abwählen einer Stimmung eine genannte Grenze nicht
       mitlöscht. Negierte Stimmungen/Achsen werden nicht hart ausgeschlossen,
       sondern abgewertet: eine Stimmung ist ein Bündel aus Genres und Tags —
       "nicht traurig" würde sonst gleich alle Dramen wegwerfen. */
    genresAusschluss: [], dekadenAusschluss: [], kategorienAusschluss: [],
    stimmungenAbschlag: [], achsenAbschlag: [],
    jahrExplizitMin: null, jahrExplizitMax: null,
    /* E-2: Eine aus einer Stimmung abgeleitete Jahresgrenze („oldschool" → bis
       1989) wird als eigener Chip angezeigt und muss EINZELN abwählbar sein —
       ohne die Stimmung selbst zu verlieren. Ohne dieses Flag würde
       jahrGrenzen() die Grenze sofort wieder aus der Stimmung herleiten. */
    jahrUnterdrueckt: { min: false, max: false },
    /* Verneintes, für das es keinen Filter gibt ("nicht im Kino"): ehrlich
       benennen statt still schlucken. */
    negiertIgnoriert: [],
    frage: text,
  };
  const erkannt = new Set(); // Wörter, die einem Signal zugeordnet wurden
  const merke = (phrase) => { for (const w of norm(phrase).split(" ")) erkannt.add(w); };

  const tokens = tokenListe(nt);
  const negiert = negierteIndizes(tokens);
  /* Steht dieser Treffer unter einer Negation? Ein Wort, das auch unverneint
     vorkommt, gilt als positiv gemeint. */
  const istNegiert = (phrase) => {
    const idx = trefferIndizes(tokens, norm(phrase));
    return idx.length > 0 && idx.every((i) => negiert.has(i));
  };
  /* Ein Treffer landet in der positiven oder in der Gegenliste. */
  const einsortieren = (positiv, gegen, wert, phrase) => {
    const liste = istNegiert(phrase) ? gegen : positiv;
    if (!liste.includes(wert)) liste.push(wert);
    merke(phrase);
  };
  /* Marker und Grenzwörter sind Satzbau, keine Vokabellücke — sie dürfen nicht
     als "nicht zugeordnet" erscheinen. Unerkannte Wörter IM Fenster bleiben
     dagegen sichtbar: genau daran zeigt sich, welche Vokabel fehlt. */
  for (const w of vokabular.negation || []) if (tokens.includes(norm(w))) merke(w);
  for (const w of vokabular.grenzwoerter || []) if (tokens.includes(norm(w))) merke(w);

  // Genres: dynamisch aus der Masterliste + film.at-Kino-Genres (zusatzGenres) + Synonyme
  const masterGenres = new Set();
  for (const f of master || []) for (const g of f.genre || []) masterGenres.add(norm(g));
  for (const g of zusatzGenres || []) { const ng = norm(g); if (ng) masterGenres.add(ng); } // Vokabular: film.at-Genres kennen
  for (const g of masterGenres) if (g && hatWort(nt, g)) einsortieren(sig.genres, sig.genresAusschluss, g, g);
  for (const [syn, ziel] of Object.entries(vokabular.genre_synonyme)) {
    if (hatWort(nt, norm(syn))) einsortieren(sig.genres, sig.genresAusschluss, norm(ziel), syn);
  }
  for (const [achse, woerter] of Object.entries(vokabular.achsen)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) einsortieren(sig.achsen, sig.achsenAbschlag, achse, w);
  }
  for (const [kat, woerter] of Object.entries(vokabular.kategorien)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) einsortieren(sig.kategorien, sig.kategorienAusschluss, kat, w);
  }
  /* Quelle und Zeit verneint ("nicht im Kino") ergeben keinen sinnvollen
     Filter — ein Film liegt oft in mehreren Quellen. Statt die Verneinung
     stillschweigend als Zustimmung zu lesen (das tat der alte Stand), wird sie
     als nicht filterbar vermerkt. */
  for (const [q, woerter] of Object.entries(vokabular.quellen)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) einsortieren(sig.quellen, sig.negiertIgnoriert, q, w);
  }
  for (const [z, woerter] of Object.entries(vokabular.zeit)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) einsortieren(sig.zeit, sig.negiertIgnoriert, z, w);
  }
  /* "nichts Neues" darf kein Entdecken-Signal setzen. */
  for (const w of vokabular.entdecken) if (hatWort(nt, norm(w))) {
    if (!istNegiert(w)) sig.entdecken = true;
    merke(w);
  }
  /* Stimmungen: mappen auf Genres+Tags (weicher Boost) bzw. Jahr-Bereiche.
     "traurige Komödie" = traurig + komoedie, beides zählt. Verneint gibt es
     einen Abschlag; die Jahresgrenzen einer verneinten Stimmung gelten NICHT —
     ihre Umkehrung ("nicht oldschool" = ab 1990?) wäre geraten. Die wirksamen
     Grenzen setzt jahrGrenzen() am Ende. */
  for (const [name] of Object.entries(alleStimmungen())) {
    if (hatWort(nt, norm(name))) einsortieren(sig.stimmungen, sig.stimmungenAbschlag, name, name);
  }
  /* Reihe/Franchise/Regie (aus dem Wikidata-Sidecar, an den Master gemergt):
     ganzer Name ODER ein markantes Wort (>=5 Zeichen) im Text -> Signal.
     "Marvel", "Tarantino", "Nightmare" finden so ihre Filme. */
  const reiheGesehen = new Set();
  for (const f of master || []) {
    for (const [typ, feld] of [["reihe", f.reihe], ["franchise", f.franchise], ["regie", f.regie]]) {
      for (const name of feld || []) {
        const nn = norm(name);
        if (!nn || reiheGesehen.has(typ + "|" + nn)) continue;
        reiheGesehen.add(typ + "|" + nn);
        const voll = hatWort(nt, nn) || (nn.includes(" ") && nt.includes(nn));
        const wort = !voll && nn.split(" ").some((w) => w.length >= 5 && hatWort(nt, w));
        if (voll || wort) { sig.reihen.push({ typ, name }); merke(name); }
      }
    }
  }
  if (sig.reihen.length > 20) sig.reihen = []; // zu unspezifisch

  // Jahrzehnte: "80er", "1990er", "aus den 70ern" — verneint als Ausschluss
  for (const m of nt.matchAll(/\b(19|20)?(\d)0er/g)) {
    const dek = m[1] ? Number(m[1] + m[2] + "0") : Number(m[2]) >= 3 ? 1900 + Number(m[2] + "0") : 2000 + Number(m[2] + "0");
    const liste = negiert.has(tokenIndexAt(nt, m.index)) ? sig.dekadenAusschluss : sig.dekaden;
    if (!liste.includes(dek)) liste.push(dek);
    merke(m[0]);
  }

  /* Ausdrücklich genannte Jahresgrenzen. Bereichsformen zuerst, sonst würde
     "1970 bis 1985" als bloße Obergrenze gelesen. Nur vierstellige Jahre
     1900–2099; "80er" bleibt Jahrzehnt. Steht die Angabe unter einer Negation
     ("nicht ab 1990"), bleibt sie ungedeutet — die Umkehrung wäre geraten, und
     die Wörter erscheinen dann ehrlich als nicht zugeordnet.
     Widersprüchliches ("ab 1990 bis 1980") wird übernommen wie genannt statt
     still korrigiert: der Nutzer sieht zwei Chips und kann einen abwählen. */
  const JAHR = "((?:19|20)\\d\\d)";
  const bereich = nt.match(new RegExp("(?:von|zwischen)\\s+" + JAHR + "\\s+(?:bis|und)\\s+" + JAHR))
    || nt.match(new RegExp(JAHR + "\\s+bis\\s+" + JAHR));
  if (bereich) {
    if (!negiert.has(tokenIndexAt(nt, bereich.index))) {
      sig.jahrExplizitMin = Number(bereich[1]);
      sig.jahrExplizitMax = Number(bereich[2]);
      merke(bereich[0]);
    }
    /* Ein verneinter BEREICH bleibt ungedeutet: „nicht von 1970 bis 1985" sagt
       nicht, was stattdessen gelten soll. Die Wörter erscheinen ehrlich als
       nicht zugeordnet, statt geraten zu werden. */
  } else {
    /* Einzelgrenzen. Mehrfachnennung: die engste gewinnt — dieselbe Regel, die
       bei Stimmungsgrenzen schon gilt. */
    for (const m of nt.matchAll(new RegExp("\\b(ab|seit|nach|bis|vor)\\s+" + JAHR, "g"))) {
      const jahr = Number(m[2]);
      let istMin = m[1] === "ab" || m[1] === "seit" || m[1] === "nach";
      /* Eine verneinte OFFENE Grenze kehrt sich um — und ist dabei eindeutig:
         „nichts nach 1985" heißt bis 1985, „nichts vor 1990" heißt ab 1990.
         Die Grenze selbst bleibt eingeschlossen. Anders als beim Bereich muss
         hier nichts geraten werden, deshalb wird sie gedeutet. */
      if (negiert.has(tokenIndexAt(nt, m.index))) istMin = !istMin;
      if (istMin) {
        sig.jahrExplizitMin = sig.jahrExplizitMin == null ? jahr : Math.max(sig.jahrExplizitMin, jahr);
      } else {
        sig.jahrExplizitMax = sig.jahrExplizitMax == null ? jahr : Math.min(sig.jahrExplizitMax, jahr);
      }
      merke(m[0]);
    }
  }
  /* Direkte Titel-Erkennung — schlägt alle Filter: "Wo spielt es Crank?"
     liefert den Crank-Eintrag mit voller Herkunft (Kino/DVD/Streaming),
     "Star Wars" liefert alle Star-Wars-Einträge. */
  sig.titel = [];
  for (const f of master || []) {
    const t = norm(f.titel), o = norm(f.originaltitel || "");
    const passt = (t.length >= 4 && nt.includes(t)) || (o.length >= 4 && nt.includes(o)) ||
      (nt.length >= 4 && ((t && t.includes(nt)) || (o && o.includes(nt))));
    if (passt) {
      sig.titel.push({ id: f.id, label: f.titel });
      merke(t); if (o) merke(o);
    }
  }
  if (sig.titel.length > 12) sig.titel = []; // zu generisch ("man", "der") -> kein Titel-Signal

  /* Positiv genannt schlägt verneint genannt — sonst blockiert ein einmal
     verneintes Wort die ausdrückliche Nennung ("Horror, aber kein Slasher"). */
  /* Dubletten nach Vergleichsschlüssel entfernen: "komödie" trifft sowohl das
     Master-Genre ("komodie") als auch das Synonym-Ziel ("komoedie"). Beide
     meinen dasselbe — ohne diese Zusammenlegung stünden zwei Chips für ein
     Genre da UND der Treffer bekäme den Boost doppelt. */
  const nachSchluessel = (liste) => {
    const gesehen = new Set(), raus = [];
    for (const g of liste) { const k = genreKey(g); if (!gesehen.has(k)) { gesehen.add(k); raus.push(g); } }
    return raus;
  };
  sig.genres = nachSchluessel(sig.genres);
  sig.genresAusschluss = nachSchluessel(sig.genresAusschluss);
  sig.genresAusschluss = sig.genresAusschluss.filter((g) => !sig.genres.some((p) => genreKey(p) === genreKey(g)));
  sig.kategorienAusschluss = sig.kategorienAusschluss.filter((k) => !sig.kategorien.includes(k));
  sig.dekadenAusschluss = sig.dekadenAusschluss.filter((d) => !sig.dekaden.includes(d));
  sig.stimmungenAbschlag = sig.stimmungenAbschlag.filter((s) => !sig.stimmungen.includes(s));
  sig.achsenAbschlag = sig.achsenAbschlag.filter((a) => !sig.achsen.includes(a));
  sig.negiertIgnoriert = sig.negiertIgnoriert.filter((x) => !sig.quellen.includes(x) && !sig.zeit.includes(x));
  Object.assign(sig, jahrGrenzen(sig));

  /* Nicht zugeordnete Wörter sichtbar machen — zeigt Vokabular-Lücken. */
  const FUELL = new Set(["film", "filme", "was", "zeig", "zeige", "mir", "ich", "auf", "aus", "den", "dem", "im", "in", "mit", "und", "oder", "der", "die", "das", "ein", "eine", "einen", "etwas", "gerne", "bitte", "heut", "will", "mag", "lust", "irgendwas", "so", "richtig", "mal", "er", "es", "wo", "wann", "denn", "gibt", "gibts", "grad", "gerade", "von", "bis", "ab", "seit", "vor", "nach", "zwischen"]);
  sig.nichtZugeordnet = nt.split(" ").filter((w) => {
    if (!w || w.length < 3 || FUELL.has(w) || erkannt.has(w)) return false;
    return ![...erkannt].some((e) => w.startsWith(e) || e.startsWith(w));
  });
  return sig;
}

const tagKey = (d) => d.getDate() + "." + (d.getMonth() + 1) + ".";

export function sucheFinder(sig, { master, kinoMatches, streamingBekannt }) {
  const kinoProId = new Map((kinoMatches?.matched || []).map((m) => [m.film.id, m.prog]));
  const streamProId = new Map(((streamingBekannt && streamingBekannt.titel) || []).map((t) => [t.id, t]));
  const heute = tagKey(new Date());
  const morgen = tagKey(new Date(Date.now() + 86400000));

  const titelIds = new Set((sig.titel || []).map((t) => t.id));
  /* Ohne jedes Signal (Freitext, der nichts im Master trifft — z.B. "One Piece",
     das nicht in der Liste ist) KEINE Master-Vorschläge. Sonst käme die Top-Score-
     Liste unabhängig von der Frage. Der Treffer kommt dann aus Kino/Streaming. */
  /* Ein Ausschluss ZÄHLT als Signal (Entscheidung E11): "zeig was Gutes, nur
     kein Horror" ist eine sinnvolle Anfrage — sie liefert die Liste ohne Horror,
     sortiert nach Dreieck-Score. Bliebe sie stumm, wäre die neue Funktion beim
     einfachsten Ausschluss wirkungslos. Alle Zugriffe optional, weil die KI
     später ein Signalobjekt zusammensetzt, dem Felder fehlen können. */
  const hatSignal = titelIds.size > 0 || sig.genres.length || (sig.reihen && sig.reihen.length) ||
    sig.stimmungen.length || sig.achsen.length || sig.kategorien.length || sig.dekaden.length ||
    sig.quellen.length || sig.zeit.length || sig.jahrMin || sig.jahrMax ||
    (sig.genresAusschluss && sig.genresAusschluss.length) ||
    (sig.dekadenAusschluss && sig.dekadenAusschluss.length) ||
    (sig.kategorienAusschluss && sig.kategorienAusschluss.length) ||
    (sig.stimmungenAbschlag && sig.stimmungenAbschlag.length) ||
    (sig.achsenAbschlag && sig.achsenAbschlag.length);
  if (!hatSignal) return [];
  const treffer = [];
  for (const f of master || []) {
    const istTitelTreffer = titelIds.has(f.id); // umgeht ALLE Filter — der Eintrag selbst ist die Antwort
    const kino = kinoProId.get(f.id) || null;
    const stream = streamProId.get(f.id) || null;
    const dvd = /dvd/.test(f.quelle || "");

    // Quellen-Signal = harter Filter (außer bei direktem Titel-Treffer)
    if (!istTitelTreffer && sig.quellen.length) {
      const ok = (sig.quellen.includes("kino") && kino) || (sig.quellen.includes("streaming") && stream) || (sig.quellen.includes("dvd") && dvd);
      if (!ok) continue;
    }
    // Zeit-Signal (nur Kino): Termin am gewünschten Tag nötig
    let kinoZeiten = kino ? kino.z || [] : [];
    if (sig.zeit.length && kino) {
      const tage = sig.zeit.map((z) => (z === "heute" ? heute : morgen));
      const gefiltert = kinoZeiten.filter((s) => tage.some((t) => s.includes(t)));
      if (gefiltert.length || !istTitelTreffer) kinoZeiten = gefiltert;
      if (!istTitelTreffer && sig.quellen.includes("kino") && !kinoZeiten.length) continue;
    }

    /* Jahr-Bereich aus Stimmungen ("oldschool" = bis 1989): harter Filter */
    if (!istTitelTreffer && sig.jahrMax && (!f.jahr || f.jahr > sig.jahrMax)) continue;
    if (!istTitelTreffer && sig.jahrMin && (!f.jahr || f.jahr < sig.jahrMin)) continue;

    /* Genre-/Tag-Schlüssel zuerst: die Ausschlüsse brauchen sie, und sie
       greifen VOR der Bewertung — was herausfällt, muss nicht bewertet werden.
       Wie alle harten Filter überstimmt ein direkter Titeltreffer sie. */
    const fGenres = (f.genre || []).map((g) => norm(g));
    const fTags = (f.tags || []).map((g) => norm(g));
    const fGenreKeys = fGenres.map(genreKey);
    /* Tags über denselben Schlüssel: die Vokabeln sind deutsch transliteriert
       ("duester", "wohlfuehl", "verstoerend"), die Tags der Masterliste tragen
       echte Umlaute ("düster") — norm() macht daraus "duster", was die Vokabel
       nie traf. Der Boost verpuffte still. */
    const fTagKeys = fTags.map(genreKey);
    if (!istTitelTreffer) {
      if ((sig.genresAusschluss || []).some((g) => fGenreKeys.includes(genreKey(g)))) continue;
      if ((sig.kategorienAusschluss || []).includes(f.kategorie)) continue;
      if ((sig.dekadenAusschluss || []).length) {
        /* Ein Ausschluss braucht positive Evidenz: ohne Jahresangabe bleibt der
           Film drin — bewusst asymmetrisch zu jahrMin/jahrMax, die Filme ohne
           Jahr aussieben. Ein fehlendes Jahr ist kein Beweis für das verbotene
           Jahrzehnt. */
        const dekAus = f.jahr ? Math.floor(f.jahr / 10) * 10 : null;
        if (dekAus !== null && sig.dekadenAusschluss.includes(dekAus)) continue;
      }
    }

    const basis = score(f);   // Dreieck-Score (Grundgüte); wert = basis + Query-Boni
    let wert = basis;
    const gruende = [];
    if (istTitelTreffer) { wert += 100; gruende.push("titel-treffer"); }
    for (const g of sig.genres) if (fGenreKeys.includes(genreKey(g))) { wert += 2; gruende.push("genre:" + g); }
    if (!istTitelTreffer && sig.genres.length && !gruende.some((x) => x.startsWith("genre:"))) continue; // Genre verlangt, keins passt
    /* Stimmungen: weicher Boost über Genres UND Tags der Masterliste —
       je besser annotiert, desto treffsicherer. */
    for (const st of sig.stimmungen) {
      const def = alleStimmungen()[st] || {};
      const trifft = (def.genres || []).some((g) => fGenreKeys.includes(genreKey(g))) || (def.tags || []).some((t) => fTagKeys.includes(genreKey(t)));
      if (trifft) { wert += 2; gruende.push("stimmung:" + st); }
    }
    /* Verneinte Stimmung: Abschlag in Höhe des Boosts. Passende Filme rutschen
       nach unten, verschwinden aber nicht — "nicht so spannend" ist ein weicher
       Wunsch, kein Verbot, und eine Stimmung ist ein Bündel aus Genres und Tags. */
    for (const st of sig.stimmungenAbschlag || []) {
      const def = alleStimmungen()[st] || {};
      const trifft = (def.genres || []).some((g) => fGenreKeys.includes(genreKey(g))) || (def.tags || []).some((t) => fTagKeys.includes(genreKey(t)));
      if (trifft) { wert -= 2; gruende.push("nicht-stimmung:" + st); }
    }
    if (sig.jahrMax) gruende.push("bis:" + sig.jahrMax);
    if (sig.jahrMin) gruende.push("ab:" + sig.jahrMin);
    const ss = schlagseite(f.bewertung);
    for (const a of sig.achsen) if (ss === a) { wert += 2.5; gruende.push("schlagseite:" + a.toUpperCase()); }
    for (const a of sig.achsenAbschlag || []) if (ss === a) { wert -= 2.5; gruende.push("nicht-schlagseite:" + a.toUpperCase()); }
    for (const k of sig.kategorien) if (f.kategorie === k) { wert += 3; gruende.push("kategorie:" + k); }
    if (!istTitelTreffer && sig.kategorien.length && !sig.kategorien.includes(f.kategorie)) continue; // Kategorie verlangt = Filter
    /* Reihe/Franchise/Regie-Signal (Sidecar): Treffer boostet; verlangt = harter Filter */
    if (sig.reihen && sig.reihen.length) {
      const fReihen = new Set([...(f.reihe || []), ...(f.franchise || []), ...(f.regie || [])].map((x) => norm(x)));
      const treff = sig.reihen.filter((r) => fReihen.has(norm(r.name)));
      for (const r of treff) { wert += 3; gruende.push(r.typ + ":" + r.name); }
      if (!istTitelTreffer && !treff.length) continue;
    }
    if (sig.dekaden.length) {
      const dek = f.jahr ? Math.floor(f.jahr / 10) * 10 : null;
      if (!istTitelTreffer && !sig.dekaden.includes(dek)) continue;
      if (sig.dekaden.includes(dek)) { wert += 1.5; gruende.push("jahrzehnt:" + dek + "er"); }
    }
    treffer.push({
      film: f, wert: Number(wert.toFixed(1)), rel: Number((wert - basis).toFixed(1)), gruende,
      herkunft: {
        // zeitenAlle/beschreibung/ot zusätzlich für die Detailansicht (Phase 4a)
        kino: kino ? { kinos: kino.k, zeiten: kinoZeiten.slice(0, 3), zeitenAlle: kinoZeiten, beschreibung: kino.b || null, ot: kino.ot || null } : null,
        dvd,
        streaming: stream ? { dienste: stream.dienste, web_urls: stream.web_urls } : null,
      },
    });
  }
  // Semantische Query-Relevanz (Summe der Boni) zuerst, dann Dreieck-Score —
  // was gesucht wurde, steht oben; die Grundgüte entscheidet nur bei Gleichstand.
  treffer.sort((a, b) => b.rel - a.rel || b.wert - a.wert);
  return treffer.slice(0, 20);
}

/* Herkunft (Kino/DVD/Streaming) für EINEN Film — für die Detailansicht, wenn kein
   Treffer-Objekt vorliegt (z.B. nach Klick in der Disambiguierungs-Liste, Phase 4a). */
export function filmHerkunft(f, { kinoMatches, streamingBekannt }) {
  const kino = new Map((kinoMatches?.matched || []).map((m) => [m.film.id, m.prog])).get(f.id) || null;
  const stream = new Map(((streamingBekannt && streamingBekannt.titel) || []).map((t) => [t.id, t])).get(f.id) || null;
  return {
    kino: kino ? { kinos: kino.k, zeiten: (kino.z || []).slice(0, 3), zeitenAlle: kino.z || [], beschreibung: kino.b || null, ot: kino.ot || null } : null,
    dvd: /dvd/.test(f.quelle || ""),
    streaming: stream ? { dienste: stream.dienste, web_urls: stream.web_urls } : null,
  };
}

/* Unbewerteter Kino-Fund (Phase 4c): aktuelle Kinofilme, die (noch) NICHT in der
   Master sind — auffindbar über Genre/Jahrzehnt/Jahr/Titel. Ungeprüft, kein Dreieck.
   Nur bei relevantem Signal, sonst leer (kein Grundrauschen). kinoRest = kinoMatches.rest. */
export function sucheKino(sig, kinoRest) {
  const nt = norm(sig.frage || "");
  const hatSignal = sig.genres.length || sig.dekaden.length || (sig.titel && sig.titel.length) || sig.quellen.includes("kino") || sig.jahrMin || sig.jahrMax;
  if (!hatSignal && nt.length < 4) return [];             // ohne Signal und ohne Titel-Freitext -> nichts
  // Tolerante Titel-Suche (leerzeichen-egal + alle Wörter), wie im Streaming-Katalog.
  const ntFlach = nt.replace(/ /g, "");
  const toks = nt.split(" ").filter((w) => w.length >= 3);
  const titelPasst = (tn) => !!tn && nt.length >= 4 && (tn.includes(nt) || tn.replace(/ /g, "").includes(ntFlach) || (toks.length > 0 && toks.every((w) => tn.includes(w))));
  // Reine Titel-Suche (kein Genre/Dekade/Jahr/quellen:kino) -> nur Titel-Treffer zeigen.
  const nurTitel = !sig.genres.length && !sig.dekaden.length && !sig.jahrMin && !sig.jahrMax && !sig.quellen.includes("kino");
  const treffer = [];
  for (const pf of kinoRest || []) {
    const g = (pf.g || []).map(norm);
    const gKeys = g.map(genreKey);
    const gruende = [];
    /* Ausschlüsse greifen auch hier — aber das Selbst-Gate oben bleibt: eine
       reine Ausschlussanfrage darf kein Grundrauschen aus dem ungeprüften
       Kinokatalog erzeugen. */
    if ((sig.genresAusschluss || []).some((sg) => { const k = genreKey(sg); return gKeys.some((x) => x.includes(k) || k.includes(x)); })) continue;
    if ((sig.dekadenAusschluss || []).length) {
      const dekAus = pf.j ? Math.floor(pf.j / 10) * 10 : null;
      if (dekAus !== null && sig.dekadenAusschluss.includes(dekAus)) continue;
    }
    if (sig.genres.length) {
      const gtreff = sig.genres.filter((sg) => { const k = genreKey(sg); return gKeys.some((x) => x.includes(k) || k.includes(x)); });
      if (!gtreff.length) continue;                       // Genre verlangt, keins passt
      for (const sg of gtreff) gruende.push("genre:" + sg);
    }
    if (sig.dekaden.length) {
      const dek = pf.j ? Math.floor(pf.j / 10) * 10 : null;
      if (!sig.dekaden.includes(dek)) continue;
      gruende.push("jahrzehnt:" + dek + "er");
    }
    if (sig.jahrMax && (!pf.j || pf.j > sig.jahrMax)) continue;
    if (sig.jahrMin && (!pf.j || pf.j < sig.jahrMin)) continue;
    if (sig.jahrMax) gruende.push("bis:" + sig.jahrMax);
    if (sig.jahrMin) gruende.push("ab:" + sig.jahrMin);
    const titelHit = titelPasst(norm(pf.t)) || titelPasst(norm(pf.ot || ""));
    if (titelHit) gruende.push("titel");
    if (nurTitel) { if (!titelHit) continue; }            // reine Titel-Suche -> Titel-Treffer verlangt
    else if (!gruende.length && !sig.quellen.includes("kino")) continue;
    treffer.push({ pf, gruende });
  }
  // Titel-Treffer nach oben, sonst nach Jahr (neu zuerst).
  treffer.sort((a, b) => (b.gruende.includes("titel") - a.gruende.includes("titel")) || ((b.pf.j || 0) - (a.pf.j || 0)));
  return treffer.slice(0, 15);
}

/* Stimmung abwählen: Jahr-Bereiche aus den verbleibenden neu ableiten — und die
   Vorrangregel danach ERNEUT anwenden. Vorher rechnete diese Funktion allein
   aus den restlichen Stimmungen; eine ausdrücklich genannte Grenze
   ("von 1975 bis 1985") verschwand damit still bei jedem Chip-Klick. */
export function ohneStimmung(sig, name) {
  const stimmungen = (sig.stimmungen || []).filter((s) => s !== name);
  const rest = { ...sig, stimmungen };
  return { ...rest, ...jahrGrenzen(rest) };
}

/* Entdecken-Titel aus dem Streaming-Katalog (ungeprüft, keine Bewertung) —
   findbar über Genre, Jahrzehnt, Jahr-Bereich ODER Titel-Freitext. Klar getrennt.
   Selbst-gated: ohne relevantes Signal leer (sonst wäre der ganze Katalog "Treffer"). */
export function sucheEntdecken(sig, streamingEntdecken) {
  const titel = (streamingEntdecken && streamingEntdecken.titel) || [];
  if (!titel.length) return [];
  const nt = norm(sig.frage || "");
  const hatGenreDek = sig.genres.length || sig.dekaden.length || sig.jahrMin || sig.jahrMax;
  if (!hatGenreDek && !sig.entdecken && nt.length < 4) return [];
  let l = titel;
  const tKeys = (t) => (t.genres || []).map(genreKey);
  if (sig.genres.length) l = l.filter((t) => tKeys(t).some((g) => sig.genres.some((s) => { const k = genreKey(s); return g.includes(k) || k.includes(g); })));
  /* Ausschlüsse greifen; das Selbst-Gate oben bleibt aber unangetastet, damit
     eine reine Ausschlussanfrage nicht den ganzen ungeprüften Entdecken-Katalog
     als "Treffer" ausschüttet. */
  if ((sig.genresAusschluss || []).length) {
    l = l.filter((t) => !tKeys(t).some((g) => sig.genresAusschluss.some((s) => { const k = genreKey(s); return g.includes(k) || k.includes(g); })));
  }
  if ((sig.dekadenAusschluss || []).length) {
    l = l.filter((t) => !t.jahr || !sig.dekadenAusschluss.includes(Math.floor(t.jahr / 10) * 10));
  }
  if (sig.dekaden.length) l = l.filter((t) => t.jahr && sig.dekaden.includes(Math.floor(t.jahr / 10) * 10));
  if (sig.jahrMax) l = l.filter((t) => t.jahr && t.jahr <= sig.jahrMax);
  if (sig.jahrMin) l = l.filter((t) => t.jahr && t.jahr >= sig.jahrMin);
  // Ohne Genre/Dekade: Titel-Freitext als Filter (nicht bei explizitem "was Neues").
  // Tolerant: direkte Teilzeichenkette, leerzeichen-egal ("super natural" -> "supernatural")
  // ODER alle Query-Wörter (>=3) im Titel (Reihenfolge egal). Tippfehler/Fremdtitel
  // fängt das NICHT — dafür bräuchte es Fuzzy-Suche bzw. Alternativtitel.
  if (!hatGenreDek && !sig.entdecken && nt.length >= 4) {
    const ntFlach = nt.replace(/ /g, "");
    const toks = nt.split(" ").filter((w) => w.length >= 3);
    const passt = (tn) => !!tn && (tn.includes(nt) || tn.replace(/ /g, "").includes(ntFlach) || (toks.length > 0 && toks.every((w) => tn.includes(w))));
    l = l.filter((t) => passt(norm(t.titel)) || passt(norm(t.originaltitel || "")));
  }
  l = [...l].sort((a, b) => (b.relevanz ?? 0) - (a.relevanz ?? 0));
  return l.slice(0, 12);
}
