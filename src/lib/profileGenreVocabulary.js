/* Gepruefte Bruecke zwischen strukturierten Quellgenres und den stabilen
   gespeicherten Genre-Signalwerten. Keine Aehnlichkeitssuche: Nur diese
   explizit aus dem bestehenden Onboarding-Vokabular uebernommenen Werte
   gelten. Die kleine Tabelle bleibt absichtlich direkt als JS lesbar, damit
   dieselbe Logik im Browser und in den Node-Vertragstests laeuft. */

function text(value) { return String(value == null ? "" : value).trim(); }
function key(value) {
  return text(value).normalize("NFKD").toLocaleLowerCase("de-AT")
    .replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, " ").trim();
}
/* Der erste Wert ist jeweils der persistierte `wert` aus
   geschmack_schlagwoerter.json. Weitere Werte sind echte lokale
   Genre-Schreibweisen fuer positiv bewertete Mediathekseintraege. Bei den
   im Joyn-Spike real beobachteten Kompositgenres werden nur ihre expliziten
   Bestandteile abgebildet; unbekannte Begriffe bleiben als Rohwert erhalten. */
const targetToSignals = new Map(Object.entries({
  drama: ["drama", "Drama"],
  comedy: ["komoedie", "Komödie"],
  komodie: ["komoedie", "Komödie"],
  tragikomodie: ["komoedie", "Komödie"],
  sitcom: ["komoedie", "Komödie"],
  "romantische komodie": ["romantik", "Romantik", "komoedie", "Komödie"],
  romance: ["romantik", "Romantik"],
  romanze: ["romantik", "Romantik"],
  liebesfilm: ["romantik", "Romantik"],
  abenteuer: ["abenteuer", "Abenteuer"],
  thriller: ["thriller", "Thriller"],
  familie: ["familie", "Familie"],
  familienfilm: ["familie", "Familie"],
  kinderfilm: ["familie", "Familie"],
  kinder: ["familie", "Familie"],
  dokumentation: ["doku", "Dokumentation"],
  dokumentarfilm: ["doku", "Dokumentarfilm"],
  doku: ["doku", "Dokumentation"],
  dokudrama: ["doku", "Dokumentation", "drama", "Drama"],
  action: ["action", "Action"],
  "science fiction": ["scifi", "Sci-Fi"],
  "sci fi": ["scifi", "Sci-Fi"],
  animation: ["animation", "Animation"],
  anime: ["animation", "Animation"],
  crime: ["krimi", "Krimi"],
  krimi: ["krimi", "Krimi"],
  "krimi drama": ["krimi", "Krimi", "drama", "Drama"],
  fantasy: ["fantasy", "Fantasy"],
  fantasie: ["fantasy", "Fantasy"],
  musical: ["musikfilm", "Musikfilm"],
  musik: ["musikfilm", "Musikfilm"],
  musikfilm: ["musikfilm", "Musikfilm"],
  tanzfilm: ["musikfilm", "Musikfilm"],
  "musikalische komodie": ["musikfilm", "Musikfilm", "komoedie", "Komödie"],
  horror: ["horror", "Horror"],
  satire: ["satire", "Satire"],
  parodie: ["satire", "Satire"],
  "historisches drama": ["drama", "Drama"],
}));

export function profileCompatibleGenres(genres) {
  const values = new Map();
  for (const raw of Array.isArray(genres) ? genres : []) {
    const clean = text(raw);
    if (!clean) continue;
    values.set(clean.toLocaleLowerCase("de-AT"), clean);
    for (const signal of targetToSignals.get(key(clean)) || []) {
      values.set(signal.toLocaleLowerCase("de-AT"), signal);
    }
  }
  return Object.freeze([...values.values()]);
}
