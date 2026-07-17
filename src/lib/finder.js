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
import vokabular from "../data/finder_vokabular.json";
const sigVokabular = vokabular; // Alias für Nutzung in sucheFinder

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

export function parseAnfrage(text, master, zusatzGenres = []) {
  const nt = norm(text);
  const sig = { genres: [], achsen: [], kategorien: [], dekaden: [], quellen: [], zeit: [], stimmungen: [], reihen: [], jahrMin: null, jahrMax: null, entdecken: false, frage: text };
  const erkannt = new Set(); // Wörter, die einem Signal zugeordnet wurden
  const merke = (phrase) => { for (const w of norm(phrase).split(" ")) erkannt.add(w); };

  // Genres: dynamisch aus der Masterliste + film.at-Kino-Genres (zusatzGenres) + Synonyme
  const masterGenres = new Set();
  for (const f of master || []) for (const g of f.genre || []) masterGenres.add(norm(g));
  for (const g of zusatzGenres || []) { const ng = norm(g); if (ng) masterGenres.add(ng); } // Vokabular: film.at-Genres kennen
  for (const g of masterGenres) if (g && hatWort(nt, g)) { sig.genres.push(g); merke(g); }
  for (const [syn, ziel] of Object.entries(vokabular.genre_synonyme)) {
    if (hatWort(nt, norm(syn)) && !sig.genres.includes(norm(ziel))) { sig.genres.push(norm(ziel)); merke(syn); }
  }
  for (const [achse, woerter] of Object.entries(vokabular.achsen)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) { if (!sig.achsen.includes(achse)) sig.achsen.push(achse); merke(w); }
  }
  for (const [kat, woerter] of Object.entries(vokabular.kategorien)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) { if (!sig.kategorien.includes(kat)) sig.kategorien.push(kat); merke(w); }
  }
  for (const [q, woerter] of Object.entries(vokabular.quellen)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) { if (!sig.quellen.includes(q)) sig.quellen.push(q); merke(w); }
  }
  for (const [z, woerter] of Object.entries(vokabular.zeit)) {
    for (const w of woerter) if (hatWort(nt, norm(w))) { if (!sig.zeit.includes(z)) sig.zeit.push(z); merke(w); }
  }
  for (const w of vokabular.entdecken) if (hatWort(nt, norm(w))) { sig.entdecken = true; merke(w); }
  /* Stimmungen: mappen auf Genres+Tags (weicher Boost) bzw. Jahr-Bereiche
     (harter Filter) — "traurige Komödie" = traurig + komoedie, beides zählt. */
  for (const [name, def] of Object.entries(alleStimmungen())) {
    if (hatWort(nt, norm(name))) {
      sig.stimmungen.push(name);
      merke(name);
      if (def.jahr_max && (!sig.jahrMax || def.jahr_max < sig.jahrMax)) sig.jahrMax = def.jahr_max;
      if (def.jahr_min && (!sig.jahrMin || def.jahr_min > sig.jahrMin)) sig.jahrMin = def.jahr_min;
    }
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

  // Jahrzehnte: "80er", "1990er", "aus den 70ern"
  for (const m of nt.matchAll(/\b(19|20)?(\d)0er/g)) {
    const dek = m[1] ? Number(m[1] + m[2] + "0") : Number(m[2]) >= 3 ? 1900 + Number(m[2] + "0") : 2000 + Number(m[2] + "0");
    if (!sig.dekaden.includes(dek)) sig.dekaden.push(dek);
    merke(m[0]);
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

  /* Nicht zugeordnete Wörter sichtbar machen — zeigt Vokabular-Lücken. */
  const FUELL = new Set(["film", "filme", "was", "zeig", "zeige", "mir", "ich", "auf", "aus", "den", "dem", "im", "in", "mit", "und", "oder", "der", "die", "das", "ein", "eine", "einen", "etwas", "gerne", "bitte", "heut", "will", "mag", "lust", "irgendwas", "so", "richtig", "mal", "er", "es", "wo", "wann", "denn", "gibt", "gibts", "grad", "gerade"]);
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
  const hatSignal = titelIds.size > 0 || sig.genres.length || (sig.reihen && sig.reihen.length) ||
    sig.stimmungen.length || sig.achsen.length || sig.kategorien.length || sig.dekaden.length ||
    sig.quellen.length || sig.zeit.length || sig.jahrMin || sig.jahrMax;
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

    const basis = score(f);   // Dreieck-Score (Grundgüte); wert = basis + Query-Boni
    let wert = basis;
    const gruende = [];
    if (istTitelTreffer) { wert += 100; gruende.push("titel-treffer"); }
    const fGenres = (f.genre || []).map((g) => norm(g));
    const fTags = (f.tags || []).map((g) => norm(g));
    for (const g of sig.genres) if (fGenres.includes(g)) { wert += 2; gruende.push("genre:" + g); }
    if (!istTitelTreffer && sig.genres.length && !gruende.some((x) => x.startsWith("genre:"))) continue; // Genre verlangt, keins passt
    /* Stimmungen: weicher Boost über Genres UND Tags der Masterliste —
       je besser annotiert, desto treffsicherer. */
    for (const st of sig.stimmungen) {
      const def = alleStimmungen()[st] || {};
      const trifft = (def.genres || []).some((g) => fGenres.includes(norm(g))) || (def.tags || []).some((t) => fTags.includes(norm(t)));
      if (trifft) { wert += 2; gruende.push("stimmung:" + st); }
    }
    if (sig.jahrMax) gruende.push("bis:" + sig.jahrMax);
    if (sig.jahrMin) gruende.push("ab:" + sig.jahrMin);
    const ss = schlagseite(f.bewertung);
    for (const a of sig.achsen) if (ss === a) { wert += 2.5; gruende.push("schlagseite:" + a.toUpperCase()); }
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
    const gruende = [];
    if (sig.genres.length) {
      const gtreff = sig.genres.filter((sg) => g.some((x) => x.includes(sg) || sg.includes(x)));
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

/* Stimmung abwählen: Jahr-Bereiche aus den verbleibenden neu ableiten. */
export function ohneStimmung(sig, name) {
  const stimmungen = sig.stimmungen.filter((s) => s !== name);
  let jahrMin = null, jahrMax = null;
  for (const st of stimmungen) {
    const def = alleStimmungen()[st] || {};
    if (def.jahr_max && (!jahrMax || def.jahr_max < jahrMax)) jahrMax = def.jahr_max;
    if (def.jahr_min && (!jahrMin || def.jahr_min > jahrMin)) jahrMin = def.jahr_min;
  }
  return { ...sig, stimmungen, jahrMin, jahrMax };
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
  if (sig.genres.length) l = l.filter((t) => (t.genres || []).map((g) => norm(g)).some((g) => sig.genres.some((s) => g.includes(s) || s.includes(g))));
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
