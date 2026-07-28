import { K, store } from "./storage.js";

/* ---------- Geschmacksprofil (Etappe 7) ----------

   Strukturiertes, versioniertes Profil pro Konto. KEIN wachsender Fließtext:
   einzelne Signale mit Herkunft, Stärke und Sicherheit, aus denen je Aufgabe
   eine kompakte Prompt-Fassung erzeugt wird (Zielwert 800–1500 Tokens laut
   KI-Leitfaden, Kapitel „Das persönliche Geschmacksmodell").

   Bindende Entscheidungen (Steckbrief + V1–V10, Max 27.07.2026):
   - Zwei gleichwertige Erhebungswege. Der deterministische (Schlagwörter)
     ist beim KI-losen Start der einzige und trägt allein; der KI-Weg
     (3 offene Fragen) schärft ihn, ersetzt ihn nie.
   - Neukonten starten LEER. Keine Ableitung aus Bestandsbewertungen.
   - Ohne Opt-in entsteht kein Profil. Widerruf löscht Profil UND Signale;
     echte Bewertungen bleiben unberührt (getrennte Töpfe).
   - Jedes Signal trägt seinen BELEG. Ein Signal ohne Textstelle oder ohne
     gewähltes Schlagwort darf nicht entstehen — so wird „lieber leer als
     falsch" strukturell erzwungen statt nur erhofft.
   - Kein Hintergrund-Update: Vorschläge entstehen ab UPDATE_SCHWELLE neuen
     Signalen oder auf Knopfdruck, und werden immer angezeigt, bevor sie ins
     Profil wandern.

   NICHT-ZIEL: Prognosen und echte Bewertungen vermischen. Dieses Modul liest
   und schreibt ausschließlich `kd:geschmacksprofil`.

   EHRLICHE GRENZE (für Phase 3 wichtig): Die Bestätigungspflicht ist eine
   Zusage der FUNKTIONEN dieses Moduls — `sammle`/`uebernimm` für Signale,
   `vorschlagRahmen`/`uebernimmRahmen` für Achsen, Filme und Nichtdeutbares.
   Wer sich ein Profilobjekt selbst zusammensetzt und `speichereProfil()`
   aufruft, umgeht sie. Vollständig verhindern lässt sich das in JavaScript
   nicht; ein Aufrufer, der Extraktionsergebnisse direkt schreibt, verletzt
   das Nicht-Ziel „keine Profilbildung aus unbestätigten KI-Ergebnissen"
   ohne Widerstand des Modells. Phase 3 darf diese Grenze nicht für eine
   Zusage halten, die sie nicht ist. */

export const PROFIL_FORMAT = 1;

/* Ab so vielen unbestätigten Signalen bietet die App ein Profil-Update an
   (V4). Kein Automatismus — der Vorschlag wartet auf Bestätigung. */
export const UPDATE_SCHWELLE = 5;

/* Erlaubte Signalarten. Geschlossene Liste, weil ein freies Feld hier genau
   die Wildwuchs-Sammlung erzeugen würde, die das strukturierte Profil
   vermeiden soll (Leitfaden: „kein wachsender Fließtext"). */
export const SIGNAL_ARTEN = [
  "genre", "thema", "erzaehlweise", "inszenierung", "tempo", "ton",
  "haltung", "regie", "epoche", "land", "kritikpunkt", "achse",
];

/* `ambivalent` ist keine Verlegenheitsoption, sondern ein belegter Fall aus
   Max' Echtmaterial: „Irreversable – einfach nur grauslig, aber man muss sich
   drauf konzentrieren, um zu checken, was abgeht" ist weder Zuneigung noch
   Ablehnung. Ohne diesen Wert würde das Modell binär werten und dabei
   Abneigung gegen explizite Härte mit Abneigung gegen fordernde Filme
   verwechseln. */
export const RICHTUNGEN = ["zieht_an", "stoesst_ab", "ambivalent"];
export const SICHERHEITEN = ["hoch", "mittel", "niedrig"];

/* Woher ein Signal stammt. Die Liste ist zugleich die Lernquellen-Zusage aus
   dem Leitfaden: NICHT enthalten sind unbestätigte KI-Schätzungen, KI-Texte,
   bloße Worthäufigkeit, fremde Artikel und Daten anderer Konten. Blogtexte
   fehlen bewusst — sie kommen ausschließlich über die Bloganalyse (Etappe 8)
   mit eigenem Opt-in, nie stillschweigend hier. */
export const QUELLEN = [
  /* Die drei Onboarding-Fragen EINZELN, nicht als Sammelwert: Der Eval in
     Phase 4 stellt SOLL und IST je Frage gegenueber und braucht die
     Zuordnung Frage -> Signal. Ein gemeinsames "onboarding" haette sie
     unwiederbringlich eingeebnet. */
  "K1",           // bester Frame der Kinogeschichte
  "K2",           // oeftester Film und was reinzieht
  "K4",           // ein Pflichtfilm fuer eine fremde Person
  "vertiefung",   // längerer Fragenkatalog in den Einstellungen
  "schlagwort",   // deterministische Auswahl aus der kuratierten Liste
  "filmwahl",     // „diese Filme treffen mich"
  "bewertung",    // eigene, abgegebene Bewertung
  "prognose",     // Reaktion auf eine KI-Prognose (angenommen/korrigiert/verworfen)
  "korrektur",    // ausdrückliche Änderung im Profil selbst
];

/* Profilversion als kurzes Token: Die Edge Function validiert sie gegen
   /^[A-Za-z0-9._-]{1,20}$/ (ai-task/index.ts:443) und weist längere oder
   sprechende Kennungen mit 400 ab, BEVOR ein Auftrag reserviert wird. Die
   Härtung ist Absicht — sie verhindert, dass Inhalte über das Versionsfeld
   ins Nutzungsprotokoll sickern. */
export const VERSION_FORM = /^[A-Za-z0-9._-]{1,20}$/;

/* Zeichen, die in KEINEM Profilinhalt stehen dürfen: Zeilenumbrüche und
   Steuerzeichen. Grund ist nicht Kosmetik, sondern die Etappe-6-Lehre —
   dort ging ein Crawl-Genre unmaskiert in den SYSTEMPROMPT, weil es nicht
   wie eine Nutzereingabe aussah. Profil-Signale sind Freitext-Extraktion und
   Nutzer-Korrekturen; ihr Weg in die Anweisungszone ist dieselbe Strecke.
   Ein `wert` mit "\n\nSYSTEM: ..." bricht die Bullet-Struktur der
   Prompt-Fassung auf und schreibt eine eigene Zeile. */
const VERBOTENE_ZEICHEN = /[\r\n\u0000-\u001f\u2028\u2029]/;

/* Vereinheitlicht Weißraum. Zweite Schranke, bewusst REDUNDANT zur
   Validierung: Der Prompt-Bau ist die letzte Stelle vor dem Anbieter und
   darf sich nicht darauf verlassen, dass alles Vorherige sauber gelaufen
   ist — ein wiederhergestelltes Fremd-Backup umgeht die Validierung
   vollständig (restore.js schreibt den Topf ungeprüft). */
function flach(x, maxLen) {
  const s = String(x == null ? "" : x).replace(/\s+/g, " ").trim();
  return maxLen && s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

export function leeresProfil() {
  return {
    format: PROFIL_FORMAT,
    version: "p0",           // steigt mit jeder bestätigten Änderung: p1, p2, …
    erstellt: null,
    geaendert: null,
    einwilligung: null,      // { erteilt, am, textVersion } — ohne sie kein Profil
    signale: [],             // bestätigt, fließen in die Prompt-Fassung
    offen: [],               // gesammelt, warten auf Bestätigung (UPDATE_SCHWELLE)
    achsen: { wie: null, was: null, warum: null },  // Tendenz 0..5, null = unbekannt
    filme: [],               // { titel, jahr, masterId, sicher, richtung? }
    nichtDeutbar: [],        // ehrlich benannt statt still geschluckt
  };
}

/* Nächste Version. Reines Hochzählen — kein Datum, kein sprechender Name:
   beides würde die 20-Zeichen-Form sprengen oder Inhalte transportieren. */
export function naechsteVersion(version) {
  const roh = String(version == null ? "p0" : version);
  /* Nur die reine Zaehlform p<ganzzahl> wird fortgezaehlt. Alles andere
     faellt auf p1 zurueck, statt eine Version zu erzeugen, die
     VERSION_FORM verletzt: `naechsteVersion("p1e21")` ergab `"p1e+21"` --
     das `+` ist nicht erlaubt, und die Edge Function weist ein solches
     Profil mit 400 ab, BEVOR ein Auftrag reserviert wird. Ein einziges
     hand-editiertes Backup haette damit jeden KI-Aufruf des Kontos
     dauerhaft unmoeglich gemacht. */
  const m = /^p(\d{1,17})$/.exec(roh);
  const naechste = m ? "p" + (Number(m[1]) + 1) : "p1";
  return VERSION_FORM.test(naechste) ? naechste : "p1";
}

/* ---------- Validierung ----------
   Fachlich, nicht nur strukturell: Ein Signal ohne Beleg oder mit einer Art,
   die es nicht gibt, ist kein gültiges Signal — egal wie wohlgeformt das JSON
   aussieht. Diese Funktion ist die Wache vor dem Schreibpfad; sie gilt für
   BEIDE Erhebungswege, damit der deterministische Weg nicht schwächer
   geprüft wird als der bezahlte. */
export function pruefeSignal(s) {
  const fehler = [];
  if (!s || typeof s !== "object") return ["Signal ist kein Objekt"];
  if (!SIGNAL_ARTEN.includes(s.art)) fehler.push("unbekannte Art: " + String(s.art));
  if (typeof s.wert !== "string" || !s.wert.trim()) fehler.push("wert fehlt");
  if (s.wert && s.wert.length > 60) fehler.push("wert zu lang (max 60)");
  if (typeof s.wert === "string" && VERBOTENE_ZEICHEN.test(s.wert)) fehler.push("wert enthaelt Zeilenumbruch oder Steuerzeichen");
  if (!RICHTUNGEN.includes(s.richtung)) fehler.push("unbekannte Richtung: " + String(s.richtung));
  if (!Number.isInteger(s.staerke) || s.staerke < 1 || s.staerke > 5) fehler.push("staerke muss 1..5 sein");
  if (!SICHERHEITEN.includes(s.sicherheit)) fehler.push("unbekannte Sicherheit: " + String(s.sicherheit));
  if (!QUELLEN.includes(s.quelle)) fehler.push("unbekannte Quelle: " + String(s.quelle));
  /* Beleg-Pflicht: Der KI-Weg muss auf eine Textstelle zeigen, der
     deterministische auf das gewählte Schlagwort oder den Film. Ohne Beleg
     kein Signal — das ist die strukturelle Fassung von „nie erfundene". */
  if (typeof s.beleg !== "string" || !s.beleg.trim()) fehler.push("beleg fehlt (Pflicht)");
  if (s.beleg && s.beleg.length > 400) fehler.push("beleg zu lang (max 400)");
  /* `weitereBelege` entsteht beim Zusammenfuehren zweier Fundstellen. Ohne
     Grenze passierte ein Signal mit 500 Belegen a 400 Zeichen (200 KB) die
     Pruefung -- gegen ein Topf-Limit von 1 MiB. Keine Injektions-, eine
     Groessenfrage. */
  if (s.weitereBelege !== undefined) {
    if (!Array.isArray(s.weitereBelege)) fehler.push("weitereBelege ist keine Liste");
    else if (s.weitereBelege.length > 5) fehler.push("weitereBelege: hoechstens 5");
    else s.weitereBelege.forEach((b, i) => {
      if (typeof b !== "string" || !b.trim()) fehler.push("weitereBelege[" + i + "]: leer");
      else if (b.length > 400) fehler.push("weitereBelege[" + i + "]: zu lang (max 400)");
      else if (VERBOTENE_ZEICHEN.test(b)) fehler.push("weitereBelege[" + i + "]: Zeilenumbruch oder Steuerzeichen");
    });
  }
  if (typeof s.beleg === "string" && VERBOTENE_ZEICHEN.test(s.beleg)) fehler.push("beleg enthaelt Zeilenumbruch oder Steuerzeichen");
  return fehler;
}

export function pruefeProfil(p) {
  const fehler = [];
  if (!p || typeof p !== "object") return ["Profil ist kein Objekt"];
  if (p.format !== PROFIL_FORMAT) fehler.push("unbekanntes Format: " + String(p.format));
  if (!VERSION_FORM.test(String(p.version || ""))) fehler.push("version verletzt die Form der Edge Function");
  for (const feld of ["signale", "offen", "filme", "nichtDeutbar"]) {
    if (!Array.isArray(p[feld])) fehler.push(feld + " ist keine Liste");
  }
  /* BEIDE Listen prüfen, nicht nur `signale`. Vorher kam ein Profil mit Müll
     in `offen` fehlerfrei durch die Prüfung, war also speicher- und
     synchronisierbar — und `uebernimm()` schob den Müll dann nach `signale`,
     wo `speichereProfil()` ihn abwies. Der Nutzer klickte „übernehmen" und
     saß fest. Der Weg dahin ist offen: restore.js schreibt ein
     wiederhergestelltes Profil ungeprüft in den Topf. */
  for (const feld of ["signale", "offen"]) {
    if (Array.isArray(p[feld])) {
      p[feld].forEach((s, i) => pruefeSignal(s).forEach((f) => fehler.push(feld + "[" + i + "]: " + f)));
    }
  }
  /* `filme` wanderte ungeprüft in die Prompt-Fassung: `pruefeProfil` sah nur,
     DASS es eine Liste ist, nie ihre Elemente. Titel waren damit unbegrenzt
     lang und durften Zeilenumbrüche tragen — dieselbe Injektionsstrecke wie
     bei `wert`, nur unbewachter. */
  if (Array.isArray(p.filme)) {
    p.filme.forEach((f, i) => {
      const pre = "filme[" + i + "]: ";
      if (!f || typeof f !== "object") { fehler.push(pre + "kein Objekt"); return; }
      if (typeof f.titel !== "string" || !f.titel.trim()) fehler.push(pre + "titel fehlt");
      if (typeof f.titel === "string" && f.titel.length > 200) fehler.push(pre + "titel zu lang (max 200)");
      if (typeof f.titel === "string" && VERBOTENE_ZEICHEN.test(f.titel)) fehler.push(pre + "titel enthaelt Zeilenumbruch oder Steuerzeichen");
      if (f.jahr != null && (!Number.isInteger(f.jahr) || f.jahr < 1880 || f.jahr > 2200)) fehler.push(pre + "jahr unplausibel");
      /* `richtung` ist OPTIONAL und bleibt es (Etappe 7, Phase 2c).
         Der Filmschritt des Onboardings fragt ausdruecklich nach beiden
         Seiten -- „trifft mich" und „trifft mich gar nicht" -- weil die
         Ablehnung oft die trennschaerfere Haelfte ist: Wer Jackass und
         Transformers abwaehlt, sagt mehr ueber sich als jeder Genre-Chip.
         Vorher konnte `filme` das ueberhaupt nicht ausdruecken.

         Warum optional und nicht pflichtig mit Vorgabewert: Die
         KI-Extraktion (Phase 3) liefert „genannte Filme" -- Titel, die in
         einer Antwort VORKAMEN. Ob sie gemocht oder verrissen wurden, weiss
         sie oft nicht. Ein Vorgabewert `zieht_an` wuerde aus jeder Nennung
         eine Zuneigung machen und damit genau die Behauptung erfinden, die
         das Modul an jeder anderen Stelle verbietet. Fehlende Richtung
         heisst „nur genannt" und wird im Prompt auch so ausgewiesen. */
      if (f.richtung != null && !RICHTUNGEN.includes(f.richtung)) fehler.push(pre + "richtung unbekannt");
    });
  }
  if (Array.isArray(p.nichtDeutbar)) {
    p.nichtDeutbar.forEach((s, i) => {
      if (typeof s !== "string") fehler.push("nichtDeutbar[" + i + "]: kein Text");
      else if (s.length > 200) fehler.push("nichtDeutbar[" + i + "]: zu lang (max 200)");
      else if (VERBOTENE_ZEICHEN.test(s)) fehler.push("nichtDeutbar[" + i + "]: Zeilenumbruch oder Steuerzeichen");
    });
  }
  /* Kreuzpruefung beider Listen. Einzeln geprueft waren sie sauber, aber
     derselbe Zug in `signale` UND `offen` blieb gueltig -- und
     `uebernimmAlle` erzeugte daraus zwei identische Prompt-Zeilen, also
     genau die Dublette, die `sammle` verhindert. Der Weg dorthin ist der
     Restore-Pfad, der keine Modulfunktion durchlaeuft. */
  if (Array.isArray(p.signale) && Array.isArray(p.offen)) {
    const bestaetigt = new Set(p.signale.filter((s) => s && s.art).map(signalId));
    p.offen.forEach((s, i) => {
      if (s && s.art && bestaetigt.has(signalId(s))) fehler.push("offen[" + i + "]: steht bereits bestaetigt in signale");
    });
  }
  /* Die Schadensmarke aus `ladeProfil()` hat dieselbe Gestalt wie ein Profil
     und rutschte durch `erteileEinwilligung()` in einen gültigen Zustand —
     mit `beschaedigt: true` im Gepäck. Hier ausdrücklich abweisen. */
  if (p.beschaedigt) fehler.push("traegt die Schadensmarke aus ladeProfil()");
  /* `rahmenOffen` war ein ungepruefter Speicherplatz mit direktem Weg ins
     Profil: `pruefeProfil` kannte das Feld nicht, also war ein Profil mit
     beliebigem Inhalt darin gueltig, speicherbar und synchronisierbar -- und
     `uebernimmRahmen` schrieb es ungeprueft weiter. Danach war das Profil
     kaputt und der Nutzer sass fest. Der Weg dorthin ist der Restore-Pfad,
     der keine Modulfunktion durchlaeuft. */
  if (p.rahmenOffen !== undefined) {
    if (!p.rahmenOffen || typeof p.rahmenOffen !== "object" || Array.isArray(p.rahmenOffen)) {
      fehler.push("rahmenOffen ist kein Objekt");
    } else {
      const { vorgeschlagen, ...felder } = p.rahmenOffen;
      const erlaubt = ["achsen", "filme", "nichtDeutbar"];
      for (const k of Object.keys(felder)) {
        if (!erlaubt.includes(k)) fehler.push("rahmenOffen: unbekanntes Feld " + k);
      }
      const probe = { ...leeresProfil(), ...felder, version: p.version };
      pruefeProfil(probe).forEach((f) => fehler.push("rahmenOffen: " + f));
    }
  }
  if (p.achsen && typeof p.achsen === "object") {
    for (const a of ["wie", "was", "warum"]) {
      const v = p.achsen[a];
      /* 0 ist ein ECHTER Wert, kein fehlender: Die App fuehrt "0/0/0 ist eine
         ECHTE Bewertung" (FilmCard.jsx) und die Willkommens-Karte erklaert
         ausdruecklich, dass eine 0 nicht "schlecht" heisst. Ein deterministisch
         erhobenes "WAS interessiert mich gar nicht" muss abbildbar sein. */
      if (v != null && (!Number.isInteger(v) || v < 0 || v > 5)) fehler.push("achsen." + a + " muss 0..5 oder null sein");
    }
  } else fehler.push("achsen fehlt");
  return fehler;
}

/* ---------- Einwilligung ----------
   Ohne sie entsteht kein Profil (V5). Der Widerruf löscht Profil UND
   gesammelte Signale — echte Bewertungen liegen in einem anderen Topf und
   werden nicht angefasst. */
export function hatEinwilligung(p) {
  return !!(p && p.einwilligung && p.einwilligung.erteilt === true);
}

const PROFIL_FELDER = ["format", "version", "erstellt", "geaendert", "einwilligung",
  "signale", "offen", "achsen", "filme", "nichtDeutbar", "rahmenOffen"];

/* Nur bekannte Profilfelder uebernehmen. `{ ...(p || {}) }` liess jedes
   beliebige Objekt durch -- `erteileEinwilligung({achsen:{5,5,5}, filme:[…]})`
   erzeugte ein gueltiges Profil mit Achsen und Filmen, die nie bestaetigt
   wurden. Das schliesst den bequemsten Umweg um die Rahmen-Mechanik. */
function nurProfilFelder(p) {
  const aus = {};
  if (p && typeof p === "object") {
    for (const k of PROFIL_FELDER) if (p[k] !== undefined) aus[k] = p[k];
  }
  return aus;
}

function inhaltsfreieMetadaten(p) {
  const aus = {};
  if (!p || typeof p !== "object") return aus;
  if (VERSION_FORM.test(String(p.version || ""))) aus.version = p.version;
  if (typeof p.erstellt === "string" && p.erstellt) aus.erstellt = p.erstellt;
  return aus;
}

export function erteileEinwilligung(p, jetzt, textVersion = "v1") {
  /* Nur ein bereits wirksam eingewilligtes UND gültiges Profil darf seinen
     bestätigten Inhalt durch eine erneute Zustimmung tragen. Ein beliebiges
     Objekt vor dem Opt-in ist keine Profilquelle: Sonst könnte ein Aufrufer
     Achsen, Filme oder Signale am Bestätigungs-Gate vorbeischmuggeln. Nach
     einem Widerruf bleiben ausschließlich Fassung und Erstellzeitpunkt als
     inhaltsfreie Kontinuitätsmerkmale erhalten. */
  const bestaetigterBestand = hatEinwilligung(p) && pruefeProfil(p).length === 0;
  const basis = bestaetigterBestand ? nurProfilFelder(p) : inhaltsfreieMetadaten(p);
  const neu = { ...leeresProfil(), ...basis };
  neu.einwilligung = { erteilt: true, am: jetzt, textVersion };
  if (!neu.erstellt) neu.erstellt = jetzt;
  neu.geaendert = jetzt;
  return neu;
}

/* Widerruf gibt ein LEERES Profil zurück, nicht `null`: Der Topf bleibt
   bestehen und trägt die Information „Einwilligung widerrufen am …" — sonst
   könnte die App nicht unterscheiden zwischen „nie gefragt" und „abgelehnt"
   und würde erneut fragen. */
export function widerrufeEinwilligung(p, jetzt) {
  const leer = leeresProfil();
  leer.einwilligung = { erteilt: false, am: jetzt, textVersion: (p?.einwilligung?.textVersion) || "v1" };
  leer.erstellt = p?.erstellt || null;
  /* Die Version bleibt STEHEN und faellt nicht auf p0 zurueck. Sie ist das
     einzige inhaltsfreie Erkennungsmerkmal des Profils und steht bereits in
     Backups, auf Zweitgeraeten und im Nutzungsprotokoll. Ein Widerruf mit
     anschliessender neuer Zustimmung wuerde sonst ein zweites, inhaltlich
     voellig anderes „p1" erzeugen. */
  leer.version = VERSION_FORM.test(String(p?.version || "")) ? p.version : leeresProfil().version;
  leer.geaendert = jetzt;
  return leer;
}

/* ---------- Signale sammeln und übernehmen ---------- */

/* Identität eines Signals für die Dublettenprüfung: Art, Wert und Richtung.
   Der BELEG gehört bewusst nicht dazu — zwei verschiedene Textstellen, die
   denselben Zug stützen, sind echte Information und sollen zusammengeführt,
   nicht verworfen werden. */
/* Auch der schreibende UI-Pfad braucht exakt dieselbe Identität, um nur die
   Vorschläge zu bestätigen, die der Nutzer gerade gesehen hat. Exportiert
   statt dort nachgebaut: Drift zwischen Dublettenprüfung und Auswahl wäre
   ein Bestätigungsfehler, kein bloßes Darstellungsdetail. */
export const signalId = (s) =>
  [s.art, String(s.wert).toLowerCase().replace(/\s+/g, " ").trim(), s.richtung].join("\u0001");

/* Neue Signale landen in `offen`, nie direkt in `signale`. Erst die
   Bestätigung durch den Nutzer hebt sie hinüber (V4: Vorschau/Bestätigung,
   kein Hintergrund-Update).

   OHNE EINWILLIGUNG entsteht gar nichts. Vorher war das Opt-in-Gate nur am
   Ausgang (`promptFassung`) — `sammle` legte auch ohne Zustimmung ein
   vollständiges Profil an, und weil `kd:geschmacksprofil` in
   ACCOUNT_SYNC_KEYS steht, wanderten diese Signale auf den Server. Die
   Zusage „ohne Opt-in kein Profil" galt damit für den Prompt, nicht für die
   Daten. Jetzt für beides.

   Dubletten: gleiche (art, wert, richtung) UND gleicher Beleg werden
   ignoriert — ein Doppelklick soll nicht dieselbe Zeile zweimal in den
   Prompt schreiben, denn ein Modell liest die Wiederholung als Nachdruck
   und nicht als Versehen. Gleiches Tupel mit ANDEREM Beleg führt die Belege
   zusammen; die Sicherheit wird dabei bewusst NICHT automatisch angehoben —
   das wäre eine inhaltliche Wertung, die nur der Nutzer treffen kann. */
export function sammle(p, neueSignale, jetzt) {
  const basis = { ...leeresProfil(), ...(p || {}) };
  if (!hatEinwilligung(basis)) {
    return { profil: basis, uebernommen: 0, verworfen: [], zusammengefuehrt: 0, abgelehnt: "keine Einwilligung" };
  }
  if (!Array.isArray(basis.offen) || !Array.isArray(basis.signale)) {
    return { profil: basis, uebernommen: 0, verworfen: [], zusammengefuehrt: 0, abgelehnt: "Profil beschaedigt (offen/signale keine Listen)" };
  }
  const offen = [...basis.offen];
  const verworfen = [];
  let neu = 0, zusammengefuehrt = 0;
  const bekannt = new Map();
  for (const s of [...basis.signale, ...offen]) { if (s && s.art) bekannt.set(signalId(s), s); }

  for (const s of neueSignale || []) {
    const fehler = pruefeSignal(s);
    if (fehler.length) { verworfen.push({ signal: s, fehler }); continue; }
    const id = signalId(s);
    const vorhanden = bekannt.get(id);
    if (!vorhanden) {
      const eintrag = { ...s, erfasst: jetzt };
      offen.push(eintrag); bekannt.set(id, eintrag); neu++;
      continue;
    }
    const belege = new Set([vorhanden.beleg, ...(vorhanden.weitereBelege || [])]);
    if (belege.has(s.beleg)) continue;           // exakte Dublette: still ignorieren
    const idx = offen.indexOf(vorhanden);
    if (idx >= 0) {                              // nur Offenes zusammenführen, Bestätigtes nie ändern
      const bisher = vorhanden.weitereBelege || [];
      if (bisher.length >= 5) { verworfen.push({ signal: s, fehler: ["weitereBelege: hoechstens 5"] }); continue; }
      offen[idx] = { ...vorhanden, weitereBelege: [...bisher, s.beleg] };
      bekannt.set(id, offen[idx]);
      zusammengefuehrt++;
    } else {
      /* Der Zug ist bereits BESTÄTIGT. Vorher endete der Zweig hier
         wirkungslos: Der Nutzer wählte dasselbe Schlagwort mit einer neuen
         Textstelle, und es passierte nichts -- ohne jede Rückmeldung. Für ein
         Modul, dessen Kernzusage „jedes Signal trägt seinen Beleg" lautet,
         ist ein still verworfener Beleg der falsche Ausgang. Er wird deshalb
         als eigener Vorschlag zur Bestätigung gestellt, konsistent mit V4 --
         bestätigte Signale ändert weiterhin nichts ausser dem Nutzer. */
      /* `art` maschinenlesbar: Die Oberflaeche soll "schon bekannt -- Beleg
         ergaenzen?" anzeigen koennen, ohne einen deutschen Fehlertext zu
         parsen. "verworfen" waere fuer den Nutzer die falsche Auskunft ueber
         seine eigene, korrekte Eingabe. Phase 2 baut daraus eine dritte
         Buehne (`belegOffen`); dann ist dieses Feld die Naht dafuer. */
      verworfen.push({ signal: s, art: "bereits_bestaetigt",
        fehler: ["bereits bestaetigt -- neuer Beleg braucht eine eigene Bestaetigung"] });
    }
  }
  return {
    profil: { ...basis, offen, geaendert: jetzt },
    uebernommen: neu,
    zusammengefuehrt,
    verworfen,
  };
}

export function updateFaellig(p) {
  return !!(p && Array.isArray(p.offen) && p.offen.length >= UPDATE_SCHWELLE);
}

/* Bestätigte Übernahme: `offen` → `signale`, Version steigt.

   `auswahl` ist PFLICHT und eine Liste von Indizes. Für „alle" gibt es
   `uebernimmAlle()`. Grund: Vorher bedeutete ein fehlendes Argument „nimm
   alles" — eine nicht initialisierte Variable bestätigte damit versehentlich
   den ganzen Vorschlag und hebelte das Versprechen „nichts ohne Bestätigung"
   aus. Der Unterschied zwischen „Nutzer hat nichts gewählt" und „keine
   Auswahl übergeben" war ein einziger nullish-Wert.

   Indizes werden normalisiert: Zeichenketten aus Formularwerten (`["0","1"]`
   nahm vorher still NICHTS, weil `includes` strikt vergleicht), Dubletten
   und Werte außerhalb des Bereichs. Was nicht verwertbar war, steht im
   Rückgabewert — die Funktion schweigt nicht mehr über ihr Ergebnis. */
export function uebernimm(p, jetzt, auswahl) {
  const basis = { ...leeresProfil(), ...(p || {}) };
  /* Dasselbe Gate wie in `sammle`, einen Schritt spaeter. Ohne diesen Guard
     hob `uebernimm` Signale auch OHNE Einwilligung nach `signale`, zaehlte
     die Version hoch und meldete `fehler: null` -- und weil der Topf in
     ACCOUNT_SYNC_KEYS steht, wanderten sie auf den Server. Der Weg dorthin
     ist real: restore.js schreibt ein wiederhergestelltes Profil ungeprueft. */
  if (!hatEinwilligung(basis)) {
    return { profil: basis, uebernommen: 0, ignoriert: [], fehler: "keine Einwilligung" };
  }
  if (!Array.isArray(basis.offen) || !Array.isArray(basis.signale)) {
    return { profil: basis, uebernommen: 0, ignoriert: [], fehler: "Profil beschaedigt (offen/signale keine Listen)" };
  }
  if (!Array.isArray(auswahl)) {
    return { profil: basis, uebernommen: 0, ignoriert: [], fehler: "auswahl muss eine Liste von Indizes sein (fuer alle: uebernimmAlle)" };
  }
  const gueltig = new Set();
  const ignoriert = [];
  for (const roh of auswahl) {
    const i = typeof roh === "string" && /^\d+$/.test(roh.trim()) ? Number(roh.trim()) : roh;
    if (Number.isInteger(i) && i >= 0 && i < basis.offen.length) gueltig.add(i);
    else ignoriert.push(roh);
  }
  const gewaehlt = basis.offen.filter((_, i) => gueltig.has(i));
  const rest = basis.offen.filter((_, i) => !gueltig.has(i));
  return {
    profil: {
      ...basis,
      signale: [...basis.signale, ...gewaehlt.map((s) => ({ ...s, bestaetigt: jetzt }))],
      offen: rest,
      version: gewaehlt.length ? naechsteVersion(basis.version) : basis.version,
      geaendert: jetzt,
    },
    uebernommen: gewaehlt.length,
    ignoriert,
    fehler: null,
  };
}

/* Ausdrücklich alles übernehmen. Eigene Funktion statt eines Defaults, damit
   „alle" eine bewusste Entscheidung im Aufrufer bleibt. */
export function uebernimmAlle(p, jetzt) {
  const offen = Array.isArray(p?.offen) ? p.offen : [];
  return uebernimm(p, jetzt, offen.map((_, i) => i));
}

/* ---------- Die drei übrigen Extraktionsausgaben ----------

   `achsen`, `filme` und `nichtDeutbar` kommen aus derselben KI-Extraktion wie
   die Signale — hatten aber kein Gegenstück zur `offen`/`uebernimm`-Mechanik.
   Ein Phase-3-Aufrufer hätte
     speichereProfil({ ...p, achsen: extraktion.achsen_tendenz })
   schreiben können, und `achsen` und `filme` reisen ungebremst in die
   Prompt-Fassung. Damit wäre das Nicht-Ziel „keine Profilbildung aus
   unbestätigten KI-Ergebnissen" für zwei Drittel der Extraktionsausgabe
   offen geblieben (Befund 4 des Scope-Wächters).

   `vorschlagRahmen()` legt sie deshalb in `rahmenOffen` — dieselbe Bühne wie
   `offen`, nur für die Felder, die keine Liste von Signalen sind. Erst
   `uebernimmRahmen()` schreibt sie ins Profil. Der deterministische Weg
   (Schlagwörter) benutzt denselben Weg; er ist nicht schwächer geprüft. */
export function vorschlagRahmen(p, rahmen, jetzt) {
  const basis = { ...leeresProfil(), ...(p || {}) };
  if (!hatEinwilligung(basis)) {
    return { profil: basis, fehler: "keine Einwilligung" };
  }
  /* Gegen dieselbe Prüfung wie ein fertiges Profil — so kann ein Vorschlag
     nichts enthalten, was gespeichert nicht erlaubt wäre. */
  const gewaehlt = pickRahmen(rahmen, basis);
  /* Z3: Ein leerer Vorschlag ist kein Vorschlag. Vorher legte er eine leere
     Vorschau an, die die Oberflaeche angezeigt und deren Bestaetigung die
     Version gehoben haette -- entgegen der Zusage, die fuer `uebernimm` gilt
     und dort gepinnt ist. */
  if (!Object.keys(gewaehlt).length) return { profil: basis, fehler: "leerer Vorschlag" };
  const probe = { ...basis, ...gewaehlt };
  const fehler = pruefeProfil(probe);
  if (fehler.length) return { profil: basis, fehler: fehler.join("; ") };
  /* Z4: Ein zweiter Vorschlag ueberschrieb den ersten still -- laufen
     Onboarding und Vertiefung kurz nacheinander, verschwand die erste
     Vorschau samt allem, was der Nutzer noch nicht gesehen hatte. */
  if (rahmenOffenVorhanden(basis)) return { profil: basis, fehler: "es liegt bereits ein Vorschlag zur Bestaetigung" };
  return {
    profil: { ...basis, rahmenOffen: { ...gewaehlt, vorgeschlagen: jetzt }, geaendert: jetzt },
    fehler: null,
  };
}

/* `basis` ist das BESTEHENDE Profil, nicht `leeresProfil()`. Vorher mischte
   die Funktion gegen ein leeres Profil: Ein Vorschlag, der nur eine Achse
   nennt -- der Normalfall, denn die Extraktion kann selten alle drei belegen
   -- setzte die beiden anderen auf null. Der Nutzer bestaetigte eine
   Verfeinerung und verlor zwei Drittel seiner Angaben, ohne dass die
   Bestaetigung das gezeigt haette. `null` im Vorschlag heisst "unbekannt,
   nicht aendern", nicht "loeschen". */
function pickRahmen(r, basis) {
  const alt = (basis && basis.achsen) || leeresProfil().achsen;
  const aus = {};
  if (r && typeof r === "object") {
    if (r.achsen && typeof r.achsen === "object") {
      const neu = { ...alt };
      for (const a of ["wie", "was", "warum"]) {
        if (r.achsen[a] !== undefined && r.achsen[a] !== null) neu[a] = r.achsen[a];
      }
      aus.achsen = neu;
    }
    if (Array.isArray(r.filme)) aus.filme = r.filme;
    if (Array.isArray(r.nichtDeutbar)) aus.nichtDeutbar = r.nichtDeutbar;
  }
  return aus;
}

export function rahmenOffenVorhanden(p) {
  return !!(p && p.rahmenOffen && typeof p.rahmenOffen === "object");
}

export function uebernimmRahmen(p, jetzt, annehmen = true) {
  const basis = { ...leeresProfil(), ...(p || {}) };
  if (!hatEinwilligung(basis)) return { profil: basis, uebernommen: false, fehler: "keine Einwilligung" };
  if (!rahmenOffenVorhanden(basis)) return { profil: basis, uebernommen: false, fehler: "kein Vorschlag offen" };
  const { rahmenOffen, ...ohne } = basis;
  if (!annehmen) return { profil: { ...ohne, geaendert: jetzt }, uebernommen: false, fehler: null };
  const gewaehlt = pickRahmen(rahmenOffen, basis);
  const ergebnis = { ...ohne, ...gewaehlt, version: naechsteVersion(basis.version), geaendert: jetzt };
  /* Das ERGEBNIS pruefen, nicht auf `vorschlagRahmen` vertrauen: Ein Profil,
     das ueber den Restore-Pfad ins System kam, hat diese Funktion nie
     gesehen. Lieber hier melden als beim Speichern werfen. */
  const fehler = pruefeProfil(ergebnis);
  if (fehler.length) {
    /* Der fehlerhafte Vorschlag darf nicht als Teil des Rückgabeprofils
       weiterleben. Im Normalfall ist der Bestand ohne `rahmenOffen` gültig;
       kam zusätzlich ein beschädigtes Profil über Restore herein, liefert
       der Fehlerweg wenigstens einen gültigen, inhaltsleeren Quarantänestand
       statt erneut eines unspeicherbaren Objekts. `uebernommen:false`
       verhindert, dass der UI-Pfad diesen Ersatz als Bestätigung speichert. */
    const quarantiniert = { ...ohne, geaendert: jetzt };
    if (pruefeProfil(quarantiniert).length === 0) {
      return { profil: quarantiniert, uebernommen: false, fehler: fehler.join("; ") };
    }
    const leer = erteileEinwilligung(
      inhaltsfreieMetadaten(basis),
      jetzt,
      basis?.einwilligung?.textVersion || "v1",
    );
    return { profil: leer, uebernommen: false, fehler: fehler.join("; ") };
  }
  return { profil: ergebnis, uebernommen: true, fehler: null };
}

/* ---------- Prompt-Fassung ----------

   Erzeugt die kompakte Textfassung, die als „erlaubte Eingabedaten" im
   ai-task-Auftrag mitreist. Deterministisch: gleiche Eingabe, gleiche
   Ausgabe — damit sie testbar ist und nicht selbst eine KI braucht.

   Die Grenze zählt BYTES, nicht Zeichen — beides lief auseinander, weil der
   Kommentar an `request_max_bytes` (32768) und an die Reservierungsformel
   `Bytes/3 + 300` hängt, der Parameter aber Zeichen maß. Deutscher Text mit
   Umlauten liegt 5–10 % darüber; 963 Zeichen sind 1043 Bytes. Jedes Kilobyte
   kostet messbar: +6,5 KB sind rund +0,3 US-Cent je Aufruf, bei gemessenen
   0,82 Cent je Suchdeutung etwa +37 %.

   Sortierung nach Stärke und Sicherheit, nicht nach Erfassungszeitpunkt:
   Läuft die Fassung in die Grenze, sollen die tragenden Züge drinstehen und
   die schwachen wegfallen — nicht die zuletzt erfassten gewinnen. */
const SICHERHEIT_RANG = { hoch: 3, mittel: 2, niedrig: 1 };
const RICHTUNG_WORT = { zieht_an: "mag", stoesst_ab: "meidet", ambivalent: "ambivalent zu" };
const KUERZUNGSMARKE = "(weitere Züge aus Platzgründen ausgelassen)";
const bytes = (s) => new TextEncoder().encode(s).length;

export function promptFassung(p, { maxBytes = 6000 } = {}) {
  if (!hatEinwilligung(p)) return null;   // ohne Opt-in reist nichts mit
  const roh = Array.isArray(p.signale) ? p.signale : [];
  const signale = [...roh].sort((a, b) =>
    (b.staerke - a.staerke)
    || ((SICHERHEIT_RANG[b.sicherheit] || 0) - (SICHERHEIT_RANG[a.sicherheit] || 0))
    || String(a.wert).localeCompare(String(b.wert), "de")
    /* Art und Richtung als letzte Stufen: Ohne sie galten zwei Signale mit
       gleicher Stärke, Sicherheit und gleichem Wert als gleich, und die
       stabile Sortierung übernahm die Einfügereihenfolge — dieselben Signale
       in anderer Reihenfolge ergaben verschiedene Texte. */
    || String(a.art).localeCompare(String(b.art), "de")
    || String(a.richtung).localeCompare(String(b.richtung), "de"));

  const zeilen = [];
  const achsen = p.achsen || {};
  const achsText = ["wie", "was", "warum"]
    .filter((a) => Number.isInteger(achsen[a]))
    .map((a) => a.toUpperCase() + " " + achsen[a]);
  if (achsText.length) zeilen.push("Achsen-Tendenz: " + achsText.join(", ") + " (von 5)");

  for (const s of signale) {
    /* `flach()` auf jedem Freitext-Feld: zweite Schranke hinter der
       Validierung. Der Prompt-Bau ist die letzte Stelle vor dem Anbieter,
       und ein wiederhergestelltes Fremd-Backup umgeht die Validierung
       vollständig — restore.js schreibt den Topf ungeprüft.
       Die Sicherheit wandert MIT in den Prompt: Ein Modell, das „niedrig"
       liest, soll den Zug nicht wie eine Tatsache behandeln — genau das ist
       der Unterschied zwischen einem Profil und einer Behauptung. */
    zeilen.push("- " + (RICHTUNG_WORT[s.richtung] || flach(s.richtung, 20)) + " " + flach(s.wert, 60)
      + " (" + flach(s.art, 20) + ", Stärke " + flach(s.staerke, 3) + "/5, Sicherheit " + flach(s.sicherheit, 10) + ")");
  }

  /* Filme nach Richtung GETRENNT ausweisen. Eine gemeinsame Zeile war
     harmlos, solange `filme` nur „genannt" bedeuten konnte -- mit der
     Ablehnung ist sie aktiv schaedlich: „Genannte Filme: Alien, Jackass"
     laedt jedes Modell dazu ein, beide als Vorlieben zu lesen, und ein
     Profil, das Abneigung als Zuneigung ausliefert, ist schlechter als
     eines ohne Filme. Drei Zeilen statt einer, jede mit eigenem Wortlaut;
     die richtungslose bleibt woertlich wie bisher, damit bestehende
     Prompt-Erwartungen tragen. */
  if (Array.isArray(p.filme) && p.filme.length) {
    const sichere = p.filme.filter((f) => f && f.sicher !== false && f.titel);
    const nenne = (f) => flach(f.titel, 200) + (Number.isInteger(f.jahr) ? " (" + f.jahr + ")" : "");
    for (const [richtung, wort] of [
      ["zieht_an", "Filme, die ihn treffen"],
      ["stoesst_ab", "Filme, die ihn abstoßen"],
      ["ambivalent", "Filme, zu denen er zwiespältig steht"],
      [null, "Genannte Filme"],
    ]) {
      const teil = sichere.filter((f) => (f.richtung == null ? null : f.richtung) === richtung).map(nenne);
      if (teil.length) zeilen.push(wort + ": " + teil.join(", "));
    }
  }

  let text = zeilen.join("\n");
  let gekuerzt = false;
  let drin = zeilen.length;
  if (bytes(text) > maxBytes) {
    /* Auf Zeilengrenze kürzen, nicht mitten im Wort — und den Schnitt
       ausweisen, statt still abzuschneiden. Die Marke wird im Budget
       mitgerechnet: vorher war die Reserve (40) kleiner als die Marke selbst
       (44 inkl. Umbruch), und die Funktion überschritt ihre eigene Zusage. */
    const reserve = bytes("\n" + KUERZUNGSMARKE);
    const behalten = [];
    let laenge = 0;
    for (const z of zeilen) {
      const kosten = bytes(z) + 1;
      if (laenge + kosten > maxBytes - reserve) break;
      behalten.push(z); laenge += kosten;
    }
    /* Passt nicht einmal die Marke ins Budget, ist die ehrliche Antwort ein
       leerer Text -- nicht eine Marke, die das Budget selbst sprengt. */
    const nurMarke = behalten.length === 0;
    text = nurMarke
      ? (bytes(KUERZUNGSMARKE) <= maxBytes ? KUERZUNGSMARKE : "")
      : behalten.join("\n") + "\n" + KUERZUNGSMARKE;
    gekuerzt = true;
    drin = behalten.length;
  }
  return {
    text,
    version: p.version,
    /* `signale` meldete bisher ALLE Signale des Profils, auch die
       weggekürzten — wer daran ein Budget rechnete, bekam eine bis zu
       16-fach zu große Zahl. Jetzt: was wirklich im Text steht. */
    /* AM FERTIGEN TEXT gezaehlt, nicht aus Zeilenzahl minus Rahmenzeilen
       gerechnet. Die Rechnung war zweifach falsch: Sie zog `filmZeile` als
       EINS ab, obwohl es seit der Aufteilung nach Richtung bis zu VIER
       Filmzeilen gibt (gemessen: 1 Signal + 4 Filme meldete `signale: 4`
       bei `signaleGesamt: 1` -- eine Teilmenge groesser als ihre Menge).
       Und unter Kuerzung zog sie Rahmenzeilen ab, die laengst weggefallen
       waren, meldete also zu wenig. Signalzeilen sind genau die, die mit
       "- " beginnen; das gilt vor wie nach der Kuerzung. */
    signale: text.split("\n").filter((z) => z.startsWith("- ")).length,
    signaleGesamt: signale.length,
    bytes: bytes(text),
    gekuerzt,
  };
}

/* ---------- Speicher ----------
   Liest und schreibt ausschließlich `kd:geschmacksprofil`. Der Topf ist seit
   Etappe 7 in ACCOUNT_SYNC_KEYS, im Backup, im Restore-Snapshot und in der
   Übernahme-Vorschau — wer hier etwas ändert, prüft alle vier mit. */
export async function ladeProfil() {
  try {
    const r = await store.get(K.geschmacksprofil);
    if (!r || !r.value) return null;
    const p = JSON.parse(r.value);
    const fehler = pruefeProfil(p);
    /* Beschädigtes Profil NICHT stillschweigend als leer behandeln: Das würde
       eine kaputte Datei beim nächsten Schreiben endgültig überschreiben. */
    if (fehler.length) return { beschaedigt: true, fehler, roh: p };
    return p;
  } catch (e) {
    return { beschaedigt: true, fehler: ["nicht lesbar: " + (e?.message || e)], roh: null };
  }
}

export async function speichereProfil(p) {
  const fehler = pruefeProfil(p);
  if (fehler.length) throw new Error("Profil ungültig: " + fehler.join("; "));
  await store.set(K.geschmacksprofil, JSON.stringify(p));
  return p;
}

/* Löscht die Profilinhalte, BEHÄLT aber den Einwilligungsvermerk und die
   Version. Vorher schrieb die Funktion ein blankes `leeresProfil()` und
   zerstörte damit genau die Unterscheidung, die `widerrufeEinwilligung()`
   zwei Funktionen weiter oben ausdrücklich herstellt: „abgelehnt" wurde
   wieder zu „nie gefragt", und die App fragte erneut. */
export async function loescheProfil(jetzt = null) {
  const alt = await ladeProfil();
  const leer = leeresProfil();
  if (alt && !alt.beschaedigt) {
    if (alt.einwilligung) leer.einwilligung = { ...alt.einwilligung };
    if (VERSION_FORM.test(String(alt.version || ""))) leer.version = alt.version;
    leer.erstellt = alt.erstellt || null;
  }
  leer.geaendert = jetzt;
  await store.set(K.geschmacksprofil, JSON.stringify(leer));
  return leer;
}
