/* Übernahme lokaler Bestand → Konto (Etappe 3).
   Der heikelste Weg der Etappe: hier treffen zwei Datenstände aufeinander.
   Geprüft wird vor allem, dass nichts passiert, was der Nutzer nicht gewählt hat —
   und dass jeder Schritt umkehrbar bleibt. */

const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
};

const U = await import("./src/lib/uebernahme.js");
const { ACCOUNT_SYNC_KEYS } = await import("./src/lib/accountDriver.js");

const checks = [];
const check = (n, p) => checks.push([n, !!p]);

/* ---------- Konto-Attrappe ---------- */
let konto = new Map();
let aufrufe = [];
const uebernehmeKey = async (key, value) => {
  aufrufe.push({ art: "schreiben", key, value });
  const da = konto.get(key);
  if (da == null) { konto.set(key, value); return { ok: true, angelegt: true }; }
  if (da === value) return { ok: true, bereitsGleich: true };
  konto.set(key, value); return { ok: true, ersetzt: true };
};
const loescheRemote = async (key) => { aufrufe.push({ art: "loeschen", key }); konto.delete(key); return { ok: true }; };

function seedLokal(werte) { _ls.clear(); for (const [k, v] of Object.entries(werte)) _ls.set(k, v); }
function kontoZeilen() {
  const o = {};
  for (const [k, v] of konto.entries()) o[k] = { key: k, value: v, revision: 1 };
  return o;
}

const MASTER = JSON.stringify({ meta: { name: "Max" }, filme: [{ id: "f1" }, { id: "f2" }, { id: "f3" }] });
const ARTIKEL = JSON.stringify({ artikel: [{ id: "a1" }] });

/* ---------- Zählweise und Prüfsumme ---------- */
check("Zählstand liest die Form jedes Topfes richtig",
  U.zaehleTopf("kd:master", MASTER) === 3
  && U.zaehleTopf("kd:artikel", ARTIKEL) === 1
  && U.zaehleTopf("kd:autor-name", "Max") === 1
  && U.zaehleTopf("kd:master", null) === 0);
check("Ein beschädigter Topf gilt als vorhanden, nicht als leer",
  U.zaehleTopf("kd:master", "{kaputt") === 1);
check("Prüfsumme unterscheidet ähnliche Werte",
  U.pruefsumme("abc") === U.pruefsumme("abc") && U.pruefsumme("abc") !== U.pruefsumme("abd"));
check("Prüfsumme ist auch bei Sonderzeichen stabil",
  U.pruefsumme("Amélie 🎬") === U.pruefsumme("Amélie 🎬") && U.pruefsumme("Amélie 🎬") !== U.pruefsumme("Amelie 🎬"));

/* ---------- C1: Vorschau ist rein lesend ---------- */
konto = new Map(); aufrufe = [];
seedLokal({ "kd:master": MASTER, "kd:artikel": ARTIKEL });
konto.set("kd:merkliste", "[1]");
const lokal1 = await U.leseLokaleToepfe();
const vorschau1 = U.baueVorschau(lokal1, kontoZeilen());
check("C1 Die Vorschau löst keinen einzigen Schreibvorgang aus", aufrufe.length === 0);
check("C1 Die Vorschau verändert den lokalen Bestand nicht",
  _ls.get("kd:master") === MASTER && !_ls.has("kd:merkliste"));

/* ---------- C2: Einstufung je Topf ---------- */
const finde = (v, k) => v.find((z) => z.key === k);
check("C2 'nur hier' wird erkannt", finde(vorschau1, "kd:master").status === "nur-lokal");
check("C2 'nur im Konto' wird erkannt", finde(vorschau1, "kd:merkliste").status === "nur-konto");
check("C2 Unberührte Töpfe gelten als leer", finde(vorschau1, "kd:vokabular").status === "beide-leer");
check("C2 Zählstand und Größe stehen für die Anzeige bereit",
  finde(vorschau1, "kd:master").lokalAnzahl === 3 && finde(vorschau1, "kd:master").lokalBytes > 0);

konto.set("kd:master", MASTER);
const vorschauGleich = U.baueVorschau(lokal1, kontoZeilen());
check("C2 Identische Stände werden als identisch erkannt", finde(vorschauGleich, "kd:master").status === "identisch");
konto.set("kd:master", JSON.stringify({ filme: [{ id: "x" }] }));
const vorschauDiff = U.baueVorschau(lokal1, kontoZeilen());
check("C2 Abweichende Stände werden als verschieden erkannt", finde(vorschauDiff, "kd:master").status === "unterschiedlich");

/* ---------- Fallunterscheidung ---------- */
check("Fall 'beide leer'", U.ermittleFall(U.baueVorschau({}, {})) === "beide-leer");
konto = new Map();
check("Fall 'nur auf dem Gerät'", U.ermittleFall(U.baueVorschau(lokal1, {})) === "nur-lokal");
konto.set("kd:master", MASTER);
check("Fall 'nur im Konto'", U.ermittleFall(U.baueVorschau({}, kontoZeilen())) === "nur-konto");
check("Fall 'beides belegt'", U.ermittleFall(U.baueVorschau(lokal1, kontoZeilen())) === "beide-belegt");
check("C9 Fremdes Konto sticht jede andere Einstufung",
  U.ermittleFall(U.baueVorschau(lokal1, kontoZeilen()), { fremdesKonto: true }) === "fremdes-konto");

/* ---------- C3/C4: Übernahme schreibt nur, was gewählt wurde ---------- */
konto = new Map(); aufrufe = [];
seedLokal({ "kd:master": MASTER, "kd:artikel": ARTIKEL, "kd:vokabular": "[]" });
const lokal2 = await U.leseLokaleToepfe();
await U.sichereRueckholpunkt(lokal2);
const lauf1 = await U.fuehreUebernahmeAus({ lokaleWerte: lokal2, uebernehmeKey, nurSchluessel: ["kd:master"] });
check("C4 Nur der gewählte Topf wird übertragen",
  konto.get("kd:master") === MASTER && !konto.has("kd:artikel") && !konto.has("kd:vokabular"));
check("C4 Der Bericht führt genau den übertragenen Topf", lauf1.bericht.length === 1 && lauf1.ok);
check("C3 Nicht gewählte Töpfe bleiben auf beiden Seiten unangetastet",
  _ls.get("kd:artikel") === ARTIKEL && !konto.has("kd:artikel"));
check("C4 Die Übernahme verändert den lokalen Bestand nicht",
  _ls.get("kd:master") === MASTER);

/* ---------- Prüfbericht ---------- */
const verif = U.baueVerifikation({ "kd:master": MASTER }, kontoZeilen());
check("Der Prüfbericht bestätigt bitgenaue Übereinstimmung", verif.allesGleich && verif.zeilen[0].gleich);
const verifFalsch = U.baueVerifikation({ "kd:master": MASTER }, { "kd:master": { value: MASTER + " " } });
check("Der Prüfbericht erkennt eine Abweichung, die die Stückzahl nicht zeigen würde",
  !verifFalsch.allesGleich);
const verifFehlt = U.baueVerifikation({ "kd:master": MASTER }, {});
check("Ein im Konto fehlender Topf gilt nie als übernommen", !verifFehlt.allesGleich);

/* ---------- C6: Wiederholung nach Abbruch ---------- */
konto = new Map(); aufrufe = [];
seedLokal({ "kd:master": MASTER, "kd:artikel": ARTIKEL });
const lokal3 = await U.leseLokaleToepfe();
await U.fuehreUebernahmeAus({ lokaleWerte: lokal3, uebernehmeKey, nurSchluessel: ["kd:master"] });  // "Abbruch" nach Topf 1
const lauf3 = await U.fuehreUebernahmeAus({ lokaleWerte: lokal3, uebernehmeKey });                   // zweiter Anlauf, alles
check("C6 Der zweite Anlauf läuft sauber durch", lauf3.ok);
check("C6 Der bereits übertragene Topf wird als vorhanden erkannt, nicht doppelt geschrieben",
  lauf3.bericht.find((b) => b.key === "kd:master").status === "war bereits im Konto");
check("C6 Der fehlende Topf wird nachgeholt", konto.get("kd:artikel") === ARTIKEL);
check("C6 Das Ergebnis ist am Ende dasselbe wie bei einem Durchlauf",
  U.baueVerifikation(lokal3, kontoZeilen()).allesGleich);

/* ---------- C5: Rücknahme ---------- */
konto = new Map(); aufrufe = [];
seedLokal({ "kd:master": MASTER, "kd:autor-name": "Max" });
const lokal4 = await U.leseLokaleToepfe();
const gesichert = await U.sichereRueckholpunkt(lokal4);
check("C5 Der Rückholpunkt wird vor jeder Änderung gesichert", gesichert && U.hatRueckholpunkt());
const lauf4 = await U.fuehreUebernahmeAus({ lokaleWerte: lokal4, uebernehmeKey });
U.merkeUebernommen("konto-A");
check("C5 Die Übernahme ist vermerkt", U.istUebernommen("konto-A"));
/* Danach etwas anderes lokal eintragen und alles zurücknehmen. */
_ls.set("kd:master", "SPAETER-GEAENDERT");
await U.nimmUebernahmeZurueck({ loescheRemote, gepusht: lauf4.gepusht });
check("C5 Die Rücknahme stellt den gesicherten Gerätestand her", _ls.get("kd:master") === MASTER);
check("C5 Die Rücknahme entfernt die angelegten Kontozeilen wieder", konto.size === 0);
check("C5 Nach der Rücknahme gilt der Bestand wieder als nicht übernommen", !U.istUebernommen("konto-A"));

/* ---------- C7: Leeres überschreibt nie Gefülltes ---------- */
konto = new Map(); aufrufe = [];
konto.set("kd:master", MASTER);
seedLokal({});                                   // Gerät leer
const lokal5 = await U.leseLokaleToepfe();
const lauf5 = await U.fuehreUebernahmeAus({ lokaleWerte: lokal5, uebernehmeKey });
check("C7 Ein leeres Gerät überschreibt keinen gefüllten Kontostand",
  konto.get("kd:master") === MASTER && !aufrufe.some((a) => a.art === "schreiben"));
check("C7 Leere Töpfe werden im Bericht als übersprungen geführt",
  lauf5.bericht.every((b) => /übersprungen/.test(b.status)));

/* ---------- C8: Sonderzeichen ---------- */
konto = new Map();
const unicode = JSON.stringify({ artikel: [{ titel: "Ōdishon – Amélie 🎬", text: "Zeile1\nZeile2\t\"zitiert\"" }] });
seedLokal({ "kd:artikel": unicode });
const lokal6 = await U.leseLokaleToepfe();
await U.fuehreUebernahmeAus({ lokaleWerte: lokal6, uebernehmeKey });
check("C8 Sonderzeichen überstehen die Übernahme unverändert", konto.get("kd:artikel") === unicode);
check("C8 Der Prüfbericht bestätigt das", U.baueVerifikation(lokal6, kontoZeilen()).allesGleich);

/* ---------- Fehlerfall wird ehrlich berichtet ---------- */
konto = new Map();
seedLokal({ "kd:master": MASTER });
const lokal7 = await U.leseLokaleToepfe();
const laufFehler = await U.fuehreUebernahmeAus({
  lokaleWerte: lokal7,
  uebernehmeKey: async () => ({ ok: false, zuGross: true }),
});
check("Ein zu großer Topf wird als Fehler berichtet, nicht als Erfolg",
  !laufFehler.ok && /zu groß/.test(laufFehler.bericht[0].status));
check("Nach einem Fehler bleibt der lokale Bestand vollständig", _ls.get("kd:master") === MASTER);

/* ---------- Demo-Erkennung ---------- */
seedLokal({ "kd:demo-seed": JSON.stringify({ pins: true }) });
check("Demo-Beilagen werden vor der Übernahme erkannt", await U.enthaeltDemoInhalte());
seedLokal({ "kd:master": JSON.stringify({ filme: [], herkunft: { typ: "demo" } }) });
check("Auch eine als Demo markierte Masterliste wird erkannt", await U.enthaeltDemoInhalte());
seedLokal({ "kd:master": MASTER });
check("Ein eigener Bestand wird nicht fälschlich als Demo gemeldet", !(await U.enthaeltDemoInhalte()));

/* ---------- Vollständigkeit ---------- */
check("Die Vorschau deckt alle Konto-Töpfe ab",
  U.baueVorschau({}, {}).length === ACCOUNT_SYNC_KEYS.length);
check("Jeder Topf hat einen verständlichen Namen",
  ACCOUNT_SYNC_KEYS.every((k) => U.topfLabel(k) && U.topfLabel(k) !== k));

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`\n${checks.filter(([, p]) => p).length}/${checks.length} Übernahme-Checks bestanden.`);
process.exit(ok ? 0 : 1);
