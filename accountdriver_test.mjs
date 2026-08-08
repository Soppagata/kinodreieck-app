/* Account-Treiber (Etappe 3) — PostgREST auf kd_personal gemockt, kein Netz.
   Der Treiber trägt die persönlichen Daten. Geprüft wird deshalb vor allem,
   was er NICHT tut: keine fremden Zeilen berühren, nie stillschweigend
   überschreiben, nie einen Legacy-Schlüssel mitsenden, nie endlos gegen einen
   Fehler anrennen, den er nicht lösen kann. */

const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
};

const D = await import("./src/lib/accountDriver.js");
const ST = await import("./src/lib/storage.js");

const checks = [];
const check = (n, p) => checks.push([n, !!p]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_OK = "https://projekt.supabase.co";
const CONFIG = { supabaseUrl: URL_OK, supabasePublishableKey: "sb_publishable_test" };

/* ---------- PostgREST-Mock: eine Tabelle je Konto ---------- */
let tabelle = new Map();          // "<konto>|<key>" -> {account_id,key,value,revision}
let calls = [];
let tokenGeber = async () => "at-gueltig";
let tokenZuKonto = { "at-gueltig": "konto-A", "at-frisch": "konto-A", "at-B": "konto-B" };
let erzwinge401Einmal = false;
let maxBytes = 1048576;
let erlaubteKeys = null;          // null = alle Keys erlaubt; Array = DB-Whitelist (kd_personal_key_erlaubt)

function res(status, data) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }

function mockFetch(url, opt = {}) {
  const method = opt.method || "GET";
  const headers = opt.headers || {};
  const body = opt.body ? JSON.parse(opt.body) : null;
  calls.push({ url: String(url), method, headers, body });

  const bearer = String(headers.Authorization || "").replace("Bearer ", "");
  if (erzwinge401Einmal) { erzwinge401Einmal = false; return Promise.resolve(res(401, { message: "JWT expired" })); }
  const konto = tokenZuKonto[bearer];
  if (!konto) return Promise.resolve(res(401, { message: "invalid token" }));

  const u = new URL(String(url));
  const p = new URLSearchParams(u.search);
  const keyFilter = (p.get("key") || "").replace("eq.", "");
  const revFilter = p.get("revision") ? Number(p.get("revision").replace("eq.", "")) : null;

  /* RLS-Nachbildung: sichtbar sind ausschließlich die Zeilen des eigenen Kontos. */
  const eigene = () => [...tabelle.values()].filter((r) => r.account_id === konto);

  if (method === "GET") {
    let rows = eigene();
    if (keyFilter) rows = rows.filter((r) => r.key === keyFilter);
    return Promise.resolve(res(200, rows.map((r) => ({ ...r }))));
  }
  if (method === "POST") {
    /* Die Zeilenzugehörigkeit setzt der Server. Ein mitgeschicktes fremdes
       account_id verletzt die WITH-CHECK-Regel. */
    if (body.account_id && body.account_id !== konto) return Promise.resolve(res(403, { code: "42501", message: "row-level security" }));
    /* Beide CHECKs liefern denselben SQL-Code 23514 — unterscheidbar nur am
       Constraint-Namen, exakt wie beim echten PostgREST. */
    if (erlaubteKeys && !erlaubteKeys.includes(body.key)) return Promise.resolve(res(400, { code: "23514", message: "new row for relation \"kd_personal\" violates check constraint \"kd_personal_key_erlaubt\"" }));
    if (String(body.value).length > maxBytes) return Promise.resolve(res(400, { code: "23514", message: "kd_personal_value_max" }));
    const id = konto + "|" + body.key;
    if (tabelle.has(id)) return Promise.resolve(res(409, { code: "23505", message: "duplicate key" }));
    const zeile = { account_id: konto, key: body.key, value: String(body.value), revision: 1 };
    tabelle.set(id, zeile);
    return Promise.resolve(res(201, [{ ...zeile }]));
  }
  if (method === "PATCH") {
    if (erlaubteKeys && !erlaubteKeys.includes(keyFilter)) return Promise.resolve(res(400, { code: "23514", message: "new row for relation \"kd_personal\" violates check constraint \"kd_personal_key_erlaubt\"" }));
    if (String(body.value).length > maxBytes) return Promise.resolve(res(400, { code: "23514", message: "kd_personal_value_max" }));
    const id = konto + "|" + keyFilter;
    const zeile = tabelle.get(id);
    if (!zeile || (revFilter != null && zeile.revision !== revFilter)) return Promise.resolve(res(200, []));
    zeile.value = String(body.value);
    zeile.revision += 1;                     // server-autoritativ, Client-Wunsch wird ignoriert
    return Promise.resolve(res(200, [{ ...zeile }]));
  }
  if (method === "DELETE") {
    const id = konto + "|" + keyFilter;
    const gab = tabelle.delete(id);
    return Promise.resolve(res(gab ? 204 : 204, null));
  }
  return Promise.resolve(res(405, {}));
}

function neuerTreiber(getToken = tokenGeber) {
  calls = [];
  return D.createAccountDriver({ config: CONFIG, getAccessToken: getToken, fetchImpl: mockFetch });
}
function seed(konto, key, value, revision = 1) { tabelle.set(konto + "|" + key, { account_id: konto, key, value, revision }); }
function db(konto, key) { return tabelle.get(konto + "|" + key)?.value ?? null; }

/* ---------- B1: Topf-Liste ---------- */
/* 17 seit „Deine Woche": kd:wochenplan kam dazu. Die Zahl steht hier
   bewusst hart -- sie ist die Wache dagegen, dass ein Topf still in die
   Sync-Liste rutscht, ohne dass Backup, Restore-Snapshot, Uebernahme-
   Vorschau und die DB-Whitelist mitgezogen werden. Wer sie erhoeht, hat
   diese vier Stellen zu pruefen. */
check("B1 Genau 17 Töpfe gehören zum Konto", D.ACCOUNT_SYNC_KEYS.length === 17);
check("B1 Der persönliche Wochenplan ist dabei", D.ACCOUNT_SYNC_KEYS.includes("kd:wochenplan"));
check("B1 Das Geschmacksprofil (Etappe 7) ist dabei",
  D.ACCOUNT_SYNC_KEYS.includes("kd:geschmacksprofil"));
check("B1 Die vier Sicht-/Zeit-Präferenzen sind dabei",
  ["kd:zeitgrenze", "kd:filter-mediathek", "kd:filter-kino", "kd:filter-streaming"]
    .every((k) => D.ACCOUNT_SYNC_KEYS.includes(k)));
check("B1 Alle Töpfe stehen auch in der zentralen Schlüsselliste",
  D.ACCOUNT_SYNC_KEYS.every((k) => Object.values(ST.K).includes(k)));
check("B1 Gerätezustand gehört NICHT zum Konto",
  ![ST.K.start, ST.K.treiber, ST.K.katalogKey, ST.K.katalogUrl, ST.K.programm, ST.K.demoSeed]
    .some((k) => D.ACCOUNT_SYNC_KEYS.includes(k)));

/* ---------- B2: Anlegen und Fortschreiben ---------- */
_ls.clear(); tabelle = new Map();
let d = neuerTreiber();
await d.set("kd:master", "M1");
await sleep(30);
check("B2 Erster Schreibzugriff legt die Zeile an", db("konto-A", "kd:master") === "M1");
check("B2 Der lokale Stand ist sofort da (nicht erst nach dem Senden)", _ls.get("kd:master") === "M1");
await d.set("kd:master", "M2");
await sleep(30);
check("B2 Folgeänderung schreibt mit optimistischer Sperre fort",
  db("konto-A", "kd:master") === "M2" && tabelle.get("konto-A|kd:master").revision === 2);
check("B2 Nach erfolgreicher Übertragung ist nichts mehr ausstehend", d.status().pending.length === 0);

/* ---------- B5/B6: keine Legacy-Schlüssel, keine Tokens in Daten ---------- */
check("B5 Kein Request trägt den alten Sync-Schlüssel",
  calls.every((c) => !Object.keys(c.headers).some((h) => h.toLowerCase() === "x-kd-key")));
check("B5 Jeder Request weist sich mit dem Sitzungstoken aus",
  calls.every((c) => String(c.headers.Authorization || "").startsWith("Bearer ")));
check("B6 Kein Request trägt eine Konto-Kennung im Rumpf (die setzt der Server)",
  calls.filter((c) => c.body).every((c) => !("account_id" in c.body)));
check("B6 Das Token steht in keinem gespeicherten Wert",
  ![..._ls.values()].some((v) => String(v).includes("at-gueltig")));

/* ---------- B3: Versionskonflikt ---------- */
_ls.clear(); tabelle = new Map(); d = neuerTreiber();
await d.set("kd:artikel", "A1");
await sleep(30);
seed("konto-A", "kd:artikel", "FREMD", 9);        // ein anderes Gerät war schneller
await d.set("kd:artikel", "A2");
await sleep(30);
check("B3 Abweichende Version wird als Konflikt gemeldet", d.status().conflict.includes("kd:artikel"));
check("B3 Im Konflikt wird der fremde Stand NICHT überschrieben", db("konto-A", "kd:artikel") === "FREMD");
check("B3 Im Konflikt bleibt der lokale Stand erhalten", _ls.get("kd:artikel") === "A2");
check("B3 Vor dem Konflikt wurde der lokale Wert gesichert",
  d.getSnapshots("kd:artikel").some((s) => s.value === "A2"));

/* Auflösung: lokalen Stand durchsetzen */
await d.resolveConflictPushLocal("kd:artikel");
await sleep(30);
check("B3 Auflösung 'Gerätestand behalten' schreibt ihn ins Konto",
  db("konto-A", "kd:artikel") === "A2" && d.status().conflict.length === 0);

/* Auflösung: Kontostand übernehmen */
seed("konto-A", "kd:merkliste", "KONTO", 3);
_ls.set("kd:merkliste", "LOKAL");
await d.resolveConflictUseRemote("kd:merkliste");
check("B3 Auflösung 'Kontostand übernehmen' schreibt ihn aufs Gerät", _ls.get("kd:merkliste") === "KONTO");

/* ---------- B4: Abgleich schützt ungesendete Änderungen ---------- */
_ls.clear(); tabelle = new Map(); d = neuerTreiber();
seed("konto-A", "kd:vokabular", "SERVER", 5);
_ls.set("kd:vokabular", "OFFLINE-BEARBEITET");
d.status();                                        // pending simulieren:
await d.set("kd:vokabular", "OFFLINE-BEARBEITET"); // erzeugt pending + Commit-Versuch
await sleep(30);
const pull1 = await d.pull();
check("B4 Ungesendete Änderung + abweichender Kontostand ergibt Konflikt, keinen Datenverlust",
  _ls.get("kd:vokabular") === "OFFLINE-BEARBEITET"
  && (pull1.konflikt.includes("kd:vokabular") || d.status().conflict.includes("kd:vokabular")));

/* Abgleichfehler darf nie zu einem Sendeversuch führen. */
_ls.clear(); tabelle = new Map();
const kaputt = D.createAccountDriver({
  config: CONFIG, getAccessToken: async () => "at-gueltig",
  fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")),
});
_ls.set("kd:master", "NUR-LOKAL");
const pullFehler = await kaputt.pull();
check("B4 Fehlgeschlagener Abgleich meldet 'nicht aktuell', nicht 'ausstehend'",
  pullFehler.ok === false && kaputt.status().stale.length > 0 && kaputt.status().pending.length === 0);
check("B4 Fehlgeschlagener Abgleich lässt den lokalen Stand unberührt", _ls.get("kd:master") === "NUR-LOKAL");

/* ---------- B7: 401 löst genau EINE Erneuerung aus ---------- */
_ls.clear(); tabelle = new Map();
let tokenAufrufe = 0;
d = neuerTreiber(async ({ erzwingeErneuerung } = {}) => {
  tokenAufrufe++;
  return erzwingeErneuerung ? "at-frisch" : "at-gueltig";
});
erzwinge401Einmal = true;
await d.set("kd:kino-pins", "P1");
await sleep(40);
check("B7 Nach einem 401 wird genau einmal erneuert und der Schreibvorgang wiederholt",
  db("konto-A", "kd:kino-pins") === "P1" && tokenAufrufe === 2);

/* Bleibt das Token ungültig, wird der Topf ausstehend — kein Dauerfeuer. */
_ls.clear(); tabelle = new Map(); calls = [];
d = neuerTreiber(async () => "at-kaputt");
await d.set("kd:kino-pins", "P2");
await sleep(40);
check("B7 Dauerhaft ungültiges Token: Topf bleibt ausstehend statt endlos zu wiederholen",
  d.status().pending.includes("kd:kino-pins") && calls.length <= 2);
check("B7 Der lokale Stand geht dabei nie verloren", _ls.get("kd:kino-pins") === "P2");

/* ---------- B8: kein Token = kein Request ---------- */
_ls.clear(); tabelle = new Map(); calls = [];
d = neuerTreiber(async () => null);
await d.set("kd:mustwatch", "MW");
await sleep(30);
check("B8 Ohne Sitzung geht kein einziger Request raus", calls.length === 0);
check("B8 Ohne Sitzung bleibt die Änderung lokal und ausstehend",
  _ls.get("kd:mustwatch") === "MW" && d.status().pending.includes("kd:mustwatch"));

/* ---------- B9: fremde Zeilen sind unerreichbar ---------- */
_ls.clear(); tabelle = new Map();
seed("konto-B", "kd:master", "FREMDES-KONTO", 1);
d = neuerTreiber(async () => "at-gueltig");     // = konto-A
const inv = await d.inventur();
check("B9 Die Bestandsaufnahme sieht keine fremden Zeilen",
  inv.ok && !Object.keys(inv.zeilen).length);
await d.pull();
check("B9 Ein Abgleich holt keine fremden Daten aufs Gerät", _ls.get("kd:master") == null);
check("B9 Die fremde Zeile bleibt unverändert", db("konto-B", "kd:master") === "FREMDES-KONTO");

/* ---------- B10: Löschen bleibt lokal ---------- */
_ls.clear(); tabelle = new Map(); d = neuerTreiber(async () => "at-gueltig");
await d.set("kd:achievements", "E1");
await sleep(30);
await d.delete("kd:achievements");
await sleep(30);
check("B10 Löschen entfernt nur lokal — die Kontozeile bleibt",
  _ls.get("kd:achievements") == null && db("konto-A", "kd:achievements") === "E1");

/* ---------- Zu großer Wert: terminal, kein Dauerversuch ---------- */
_ls.clear(); tabelle = new Map(); calls = [];
maxBytes = 50;
d = neuerTreiber(async () => "at-gueltig");
await d.set("kd:master", "x".repeat(80));
await sleep(30);
const nachErstem = calls.length;
check("Zu großer Topf wird als dauerhaftes Hindernis geführt, nicht als ausstehend",
  d.status().zuGross.includes("kd:master") && !d.status().pending.includes("kd:master"));
await d.syncFlush();
await sleep(30);
check("Ein zu großer Topf wird beim Nachsenden übersprungen (kein Dauerfeuer)", calls.length === nachErstem);
check("Der lokale Stand bleibt vollständig erhalten", _ls.get("kd:master").length === 80);
maxBytes = 1048576;

/* ---------- Unbekannter Datentopf (23514, kd_personal_key_erlaubt): eigener Status ----------
   Entscheid Max 03.08.2026 (Audit Probe f): Der Fall „DB kennt den Key noch
   nicht" (fehlende Migration) lief bisher auf demselben zuGross-Flag und
   wurde in der Oberfläche als „zu groß" fehldiagnostiziert. Jetzt eigener
   terminaler Status `schemaVeraltet`; der echte Größenfall oben bleibt
   unverändert gepinnt. */
_ls.clear(); tabelle = new Map(); calls = [];
erlaubteKeys = ["kd:artikel"];    // kd:master fehlt in der DB-Whitelist -> Migration fehlt
d = neuerTreiber(async () => "at-gueltig");
await d.set("kd:master", "M-NEU");
await sleep(30);
const nachKeyAblehnung = calls.length;
check("Unbekannter Topf wird als schemaVeraltet geführt — nicht als zu groß, nicht als ausstehend",
  d.status().schemaVeraltet.includes("kd:master")
  && !d.status().zuGross.includes("kd:master")
  && !d.status().pending.includes("kd:master"));
await d.syncFlush();
await sleep(30);
check("Ein unbekannter Topf wird beim Nachsenden übersprungen (kein Dauerfeuer)", calls.length === nachKeyAblehnung);
check("Der lokale Stand bleibt beim unbekannten Topf vollständig erhalten", _ls.get("kd:master") === "M-NEU");
/* Nach eingespielter Migration heilt der nächste Edit den Topf von selbst —
   dieselbe Selbstheilung, die der zu-groß-Weg über set() besitzt. */
erlaubteKeys = null;
await d.set("kd:master", "M-NACH-MIGRATION");
await sleep(30);
check("Nach der Migration heilt der nächste Schreibzugriff den Topf von selbst",
  db("konto-A", "kd:master") === "M-NACH-MIGRATION" && d.status().schemaVeraltet.length === 0);

/* ---------- B11: Statusform bleibt kompatibel ---------- */
const st = d.status();
check("B11 Der Status hat die gewohnte Form (Restore/Chip lesen sie unverändert)",
  Array.isArray(st.pending) && Array.isArray(st.conflict) && Array.isArray(st.stale)
  && typeof st.configured === "boolean" && "lastPull" in st && "lastCommit" in st);

/* ---------- Kontowechsel am selben Gerät ---------- */
_ls.clear();
D.setCacheOwner("konto-A");
_ls.set("kd:acct:ver", JSON.stringify({ "kd:master": 7 }));
check("Kontowechsel wird erkannt", D.getCacheOwner() === "konto-A");
D.verwerfeTreiberZustand();
check("Beim Kontowechsel wird der Treiberzustand verworfen", _ls.get("kd:acct:ver") == null);

/* ---------- Auftrag bleibt an seine Treibergeneration gebunden ---------- */
_ls.clear(); tabelle = new Map(); calls = [];
let generationAktiv = true;
let aktuellesToken = "at-gueltig";
d = D.createAccountDriver({
  config: CONFIG,
  getAccessToken: async () => aktuellesToken,
  fetchImpl: mockFetch,
  isActive: () => generationAktiv,
});
const alterAuftrag = d.set("kd:master", "DATEN-A");
/* Noch bevor die Queue startet, wechselt die App zu Konto B und dessen
   lokaler Wert liegt im selben Cache-Schlüssel. Der alte Auftrag darf weder
   das neue Token noch den neuen Wert verwenden. */
generationAktiv = false;
aktuellesToken = "at-B";
_ls.set("kd:master", "DATEN-B");
let alterAuftragVerworfen = false;
try { await alterAuftrag; } catch (error) {
  alterAuftragVerworfen = error?.code === "ACCOUNT_CONTEXT_CHANGED";
}
await sleep(30);
check("Ein Auftrag einer alten Treibergeneration sendet nach Kontowechsel nichts",
  alterAuftragVerworfen
  && calls.length === 0 && db("konto-A", "kd:master") === null && db("konto-B", "kd:master") === null);
check("Der lokale Wert des neuen Kontos bleibt vom alten Auftrag unberührt",
  _ls.get("kd:master") === "DATEN-B");

/* ---------- Wiederholbare Übernahme ---------- */
_ls.clear(); tabelle = new Map(); d = neuerTreiber(async () => "at-gueltig");
const u1 = await d.uebernehmeKey("kd:master", "BESTAND");
const u2 = await d.uebernehmeKey("kd:master", "BESTAND");     // zweiter Anlauf nach Abbruch
check("Übernahme ist wiederholbar: derselbe Wert ergibt keinen Konflikt",
  u1.ok && u1.angelegt && u2.ok && u2.bereitsGleich && d.status().conflict.length === 0);
const u3 = await d.uebernehmeKey("kd:master", "GEAENDERT");
check("Übernahme ersetzt einen abweichenden Kontostand bewusst",
  u3.ok && u3.ersetzt && db("konto-A", "kd:master") === "GEAENDERT");
await d.loescheRemote("kd:master");
check("Rücknahme entfernt die angelegte Kontozeile wieder", db("konto-A", "kd:master") === null);

/* ---------- Verbatim-Rundlauf: Sonderzeichen, roher String, JSON ---------- */
_ls.clear(); tabelle = new Map(); d = neuerTreiber(async () => "at-gueltig");
const heikel = JSON.stringify({ titel: "Amélie – Ōdishon 🎬", note: "Zeile1\nZeile2\t\"zitiert\"" });
await d.set("kd:artikel", heikel);
await d.set("kd:autor-name", "Max Rinke");       // roher String, kein JSON
await sleep(40);
_ls.delete("kd:artikel"); _ls.delete("kd:autor-name");
await d.pull();
check("Rundlauf: verschachteltes JSON mit Sonderzeichen kommt unverändert zurück", _ls.get("kd:artikel") === heikel);
check("Rundlauf: roher Nicht-JSON-String bleibt roh", _ls.get("kd:autor-name") === "Max Rinke");

/* ---------- Abgleich sichert vor dem Überschreiben ---------- */
_ls.clear(); tabelle = new Map(); d = neuerTreiber(async () => "at-gueltig");
seed("konto-A", "kd:einstellungen", "SERVER-STAND", 2);
_ls.set("kd:einstellungen", "ALTER-GERAETESTAND");
await d.pull();
check("Abgleich übernimmt den Kontostand", _ls.get("kd:einstellungen") === "SERVER-STAND");
check("Abgleich sichert den überschriebenen Gerätestand vorher",
  d.getSnapshots("kd:einstellungen").some((s) => s.value === "ALTER-GERAETESTAND"));

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`\n${checks.filter(([, p]) => p).length}/${checks.length} Account-Treiber-Checks bestanden.`);
process.exit(ok ? 0 : 1);
