/* Architektur- und Fehlertest für das zentrale Register persönlicher Daten.
   Kein Netz, keine echten Konten. */

const speicher = new Map();
globalThis.localStorage = {
  getItem: (key) => speicher.has(key) ? speicher.get(key) : null,
  setItem: (key, value) => { speicher.set(key, String(value)); },
  removeItem: (key) => { speicher.delete(key); },
  clear: () => speicher.clear(),
};

const ST = await import("./src/lib/storage.js");
const R = await import("./src/lib/restore.js");
const P = await import("./src/lib/personalDataRegistry.js");
const A = await import("./src/lib/accountDriver.js");

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const eintraege = P.PERSONAL_DATA_ENTRIES;
check("Register enthält genau die 16 persönlichen Töpfe", eintraege.length === 16);
check("Schlüssel sind eindeutig", new Set(eintraege.map((e) => e.key)).size === eintraege.length);
check("Backup-Felder sind eindeutig", new Set(eintraege.map((e) => e.backupField)).size === eintraege.length);
check("Jeder Eintrag hat Label, Backup-Projektion, Restore-Plan und Zählweise",
  eintraege.every((e) => e.label && e.backupField
    && typeof e.backupAusRoh === "function"
    && typeof e.restorePlan === "function"
    && typeof e.zaehleRoh === "function"));
check("Account-Sync leitet exakt dieselbe Registerliste ab",
  JSON.stringify(A.ACCOUNT_SYNC_KEYS) === JSON.stringify(P.PERSONAL_DATA_KEYS));
check("Darstellungsmodus reist als Teil der Settings mit dem Profil",
  A.ACCOUNT_SYNC_KEYS.includes(ST.K.einstellungen));
check("Restore leitet exakt dieselbe Registerliste ab",
  JSON.stringify(R.RESTORE_KEYS) === JSON.stringify(P.PERSONAL_DATA_KEYS));
check("Auth, Katalogcache und Demo-Markierung stehen nicht im Register",
  ["kd:auth:session", ST.K.programm, ST.K.demoSeed, ST.K.katalogKey]
    .every((key) => !P.PERSONAL_DATA_KEYS.includes(key)));
check("Deep-Space-Rhythmus bleibt außerhalb von Profil-Sync und Backup",
  P.PERSONAL_DATA_KEYS.every((key) => !String(key).startsWith("kd:deep-space-horror:rhythmus:")));

/* Vollständiges Decode/Validate muss fertig sein, bevor irgendein Topf
   geschrieben wird. Ein spätes kaputtes Feld darf den frühen Master nicht
   verändern. */
speicher.clear();
const alterMaster = JSON.stringify({ meta: {}, filme: [{ id: "alt", titel: "Alt" }] });
speicher.set(ST.K.master, alterMaster);
let schreibversuche = 0;
const zaehlTreiber = {
  name: "test",
  async get(key) {
    const value = speicher.get(key);
    return value == null ? null : { key, value };
  },
  async set(key, value) {
    schreibversuche++;
    speicher.set(key, String(value));
    return { key, value };
  },
  async delete(key) {
    schreibversuche++;
    speicher.delete(key);
    return { key, deleted: true };
  },
  async list() { return { keys: [...speicher.keys()] }; },
};
ST.setStorageDriver(zaehlTreiber);
let formfehler = null;
try {
  await R.restoreBackup({
    format: "kinodreieck-backup",
    version: 1,
    masterliste: { meta: {}, filme: [{ titel: "Neu" }] },
    kino_pins: { keine: "Liste" },
  });
} catch (error) { formfehler = error; }
check("Formfehler wird vor dem ersten Schreibzugriff abgewiesen",
  !!formfehler && schreibversuche === 0);
check("Formfehler lässt den vorhandenen Master bytegleich stehen",
  speicher.get(ST.K.master) === alterMaster);

/* Ein realer Schreibfehler nach einem erfolgreichen ersten Topf löst sofort
   das lokale Rollback aus. */
speicher.clear();
speicher.set(ST.K.master, alterMaster);
const alterArtikel = JSON.stringify({ artikel: [{ id: "alt-a" }] });
speicher.set(ST.K.artikel, alterArtikel);
let artikelSollScheitern = true;
const fehlerTreiber = {
  ...zaehlTreiber,
  async set(key, value) {
    if (key === ST.K.artikel && artikelSollScheitern) {
      artikelSollScheitern = false;
      throw new Error("simulierter Schreibfehler");
    }
    speicher.set(key, String(value));
    return { key, value };
  },
};
ST.setStorageDriver(fehlerTreiber);
let rollbackFehler = null;
try {
  await R.restoreBackup({
    format: "kinodreieck-backup",
    version: 1,
    masterliste: { meta: {}, filme: [{ titel: "Neu" }] },
    artikel: [{ id: "neu-a" }],
  });
} catch (error) { rollbackFehler = error; }
check("Teilfehler wird als automatisch zurückgenommener Restore gemeldet",
  rollbackFehler?.code === "restore-rolled-back");
check("Automatisches Rollback stellt den Master bytegleich wieder her",
  speicher.get(ST.K.master) === alterMaster);
check("Automatisches Rollback bewahrt den unangetasteten Artikel-Topf",
  speicher.get(ST.K.artikel) === alterArtikel);
check("Rückholpunkt bleibt für eine manuelle Kontrolle erhalten", R.hatRestoreSnapshot());

ST.setStorageDriver(null);
console.log(`personaldataregistry_test: ${ok} Checks bestanden.`);
