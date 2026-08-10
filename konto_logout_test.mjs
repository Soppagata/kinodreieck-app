/* Logout-Grenze: Kontocache verschwindet aus dem Gastbetrieb, während der
   lokale Stand von vor der Anmeldung und reine Gerätezustände erhalten bleiben. */

import { readFileSync } from "node:fs";

const daten = new Map();
globalThis.localStorage = {
  getItem: (key) => daten.has(key) ? daten.get(key) : null,
  setItem: (key, value) => void daten.set(key, String(value)),
  removeItem: (key) => void daten.delete(key),
  clear: () => daten.clear(),
  key: (index) => [...daten.keys()][index] ?? null,
  get length() { return daten.size; },
};

const U = await import("./src/lib/uebernahme.js");
const KontoService = await import("./src/services/uebernahme.js");
const AccountDriver = await import("./src/lib/accountDriver.js");
const { ACCT_KEYS } = AccountDriver;
const {
  PERSONAL_DATA_KEYS, VERALTETE_IMPORT_SNAPSHOT_KEYS,
} = await import("./src/lib/personalDataRegistry.js");

let ok = 0;
function check(name, value) {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const GAST_MASTER = JSON.stringify({ filme: [{ id: "gast" }] });
const KONTO_MASTER = JSON.stringify({ filme: [{ id: "konto" }] });

{
  daten.clear();
  daten.set("kd:master", GAST_MASTER);
  daten.set("kd:streaming-dienste", JSON.stringify({ mubi: true }));
  daten.set("kd:ki", JSON.stringify({ global: false }));
  await U.sichereRueckholpunkt({
    "kd:master": GAST_MASTER,
    "kd:streaming-dienste": JSON.stringify({ mubi: true }),
  });
  check("Rückholpunkt wird an genau das angemeldete Konto gebunden",
    U.bindeRueckholpunktAnKonto("konto-A")
      && JSON.parse(daten.get(U.UEBERNAHME_SNAP)).accountId === "konto-A");

  daten.set("kd:master", KONTO_MASTER);
  daten.set("kd:streaming-dienste", JSON.stringify({ netflix: true }));
  daten.set("kd:geschmacksprofil", JSON.stringify({ signale: [{ id: "konto-tag" }] }));
  for (const key of VERALTETE_IMPORT_SNAPSHOT_KEYS) daten.set(key, "VOLLSTAENDIGER-ALTER-KONTOBESTAND");
  const r = U.stelleGaststandNachAbmeldungWiederHer("konto-A");
  check("Logout stellt den früheren Gastbestand wieder her",
    r.ok && daten.get("kd:master") === GAST_MASTER
      && /mubi/.test(daten.get("kd:streaming-dienste")));
  check("Reine Kontodaten bleiben nach Logout nicht als Gast sichtbar",
    !daten.has("kd:geschmacksprofil"));
  check("Logout entfernt veraltete Import-Rohsnapshots vollständig",
    VERALTETE_IMPORT_SNAPSHOT_KEYS.every((key) => !daten.has(key)));
  check("Gerätelokale KI-Grundwahl bleibt vom Konto-Logout unberührt",
    /false/.test(daten.get("kd:ki")));
  check("Logout entfernt Rückholpunkt und Übernahmemarke", !daten.has(U.UEBERNAHME_SNAP));
}

{
  daten.clear();
  daten.set("kd:master", GAST_MASTER);
  await U.sichereRueckholpunkt({ "kd:master": GAST_MASTER });
  U.bindeRueckholpunktAnKonto("konto-M");
  daten.set("kd:master", KONTO_MASTER);
  daten.set(ACCT_KEYS.owner, "konto-M");
  daten.set(ACCT_KEYS.transition, JSON.stringify({
    accountId: "konto-M", zweck: "konto-zu-gast", token: "logout-M",
  }));
  const r = KontoService.gaststandNachKontoAbmeldung("konto-M", { behalteTransition: true });
  check("Logout-Restore entfernt Kontodaten und Owner, hält aber den Marker bis zum Credential-Commit",
    r.ok && daten.get("kd:master") === GAST_MASTER
    && !daten.has(ACCT_KEYS.owner)
    && JSON.parse(daten.get(ACCT_KEYS.transition)).token === "logout-M");
  daten.delete(ACCT_KEYS.transition);
}

{
  daten.clear();
  for (const key of PERSONAL_DATA_KEYS) daten.set(key, "KONTO");
  daten.set("kd:ki", "GERAET");
  const r = U.stelleGaststandNachAbmeldungWiederHer("legacy-konto");
  check("Alte Installationen ohne Rückholpunkt entfernen den ganzen persönlichen Kontocache",
    r.ok && PERSONAL_DATA_KEYS.every((key) => !daten.has(key)));
  check("Auch beim Legacy-Fallback bleiben fremde Gerätezustände erhalten", daten.get("kd:ki") === "GERAET");
}

{
  daten.clear();
  daten.set("kd:master", GAST_MASTER);
  await U.sichereRueckholpunkt({ "kd:master": GAST_MASTER });
  U.bindeRueckholpunktAnKonto("konto-A");
  daten.set("kd:master", KONTO_MASTER);
  const r = U.stelleGaststandNachAbmeldungWiederHer("konto-B");
  check("Ein Rückholpunkt eines anderen Kontos wird nie in den Gastbetrieb eingespielt",
    r.ok && !daten.has("kd:master"));
}

{
  daten.clear();
  daten.set("kd:master", GAST_MASTER);
  daten.set("kd:ki", "GERAET");
  check("Leere Kontoaktivierung legt selbstständig einen vollständigen Gast-Rückholpunkt an",
    U.bindeRueckholpunktAnKonto("konto-C"));
  const snap = JSON.parse(daten.get(U.UEBERNAHME_SNAP));
  check("Automatischer Rückholpunkt enthält persönliche, aber keine gerätelokalen Töpfe",
    snap.werte["kd:master"] === GAST_MASTER && !("kd:ki" in snap.werte));
}

{
  const quotaDaten = new Map();
  for (const key of PERSONAL_DATA_KEYS) quotaDaten.set(key, `KONTO:${key}`);
  for (const key of VERALTETE_IMPORT_SNAPSHOT_KEYS) quotaDaten.set(key, "ALTER-KONTO-SNAPSHOT");
  quotaDaten.set(U.UEBERNAHME_SNAP, JSON.stringify({
    accountId: "konto-Q",
    t: new Date().toISOString(),
    werte: { "kd:master": GAST_MASTER },
  }));
  quotaDaten.set(U.UEBERNOMMEN_KEY, JSON.stringify({ accountId: "konto-Q" }));
  quotaDaten.set(ACCT_KEYS.owner, "konto-Q");
  const quotaStorage = {
    getItem: (key) => quotaDaten.has(key) ? quotaDaten.get(key) : null,
    setItem() { throw new DOMException("Speicher voll", "QuotaExceededError"); },
    removeItem: (key) => void quotaDaten.delete(key),
    key: (index) => [...quotaDaten.keys()][index] ?? null,
    get length() { return quotaDaten.size; },
  };
  const vorher = globalThis.localStorage;
  globalThis.localStorage = quotaStorage;
  const r = KontoService.gaststandNachKontoAbmeldung("konto-Q");
  globalThis.localStorage = vorher;
  check("Quota beim Gast-Restore fällt auf einen leeren, ownerfreien Kontocache zurück",
    r.ok && r.quelle === "konto-cache-quarantaene"
    && PERSONAL_DATA_KEYS.every((key) => !quotaDaten.has(key))
    && VERALTETE_IMPORT_SNAPSHOT_KEYS.every((key) => !quotaDaten.has(key))
    && !quotaDaten.has(U.UEBERNAHME_SNAP)
    && !quotaDaten.has(U.UEBERNOMMEN_KEY)
    && !quotaDaten.has(ACCT_KEYS.owner));
}

{
  const teilDaten = new Map([
    ["kd:master", KONTO_MASTER],
    ["kd:artikel", JSON.stringify({ artikel: [{ id: "konto-artikel" }] })],
    [U.UEBERNAHME_SNAP, JSON.stringify({ accountId: "konto-T", werte: { "kd:master": GAST_MASTER } })],
    [U.UEBERNOMMEN_KEY, JSON.stringify({ accountId: "konto-T" })],
    [ACCT_KEYS.owner, "konto-T"],
  ]);
  const teilStorage = {
    getItem: (key) => teilDaten.has(key) ? teilDaten.get(key) : null,
    setItem() { throw new DOMException("Schreiben blockiert", "QuotaExceededError"); },
    removeItem(key) {
      if (key === "kd:master") throw new DOMException("Entfernen blockiert", "InvalidStateError");
      teilDaten.delete(key);
    },
    key: (index) => [...teilDaten.keys()][index] ?? null,
    get length() { return teilDaten.size; },
  };
  const vorher = globalThis.localStorage;
  globalThis.localStorage = teilStorage;
  let geworfen = false;
  try { KontoService.quarantaeneKontodatenNachAbmeldung(); }
  catch { geworfen = true; }
  globalThis.localStorage = vorher;
  check("Teilquarantäne behält den Account-Owner als persistenten Restverdacht",
    geworfen
    && teilDaten.get("kd:master") === KONTO_MASTER
    && !teilDaten.has("kd:artikel")
    && teilDaten.get(ACCT_KEYS.owner) === "konto-T");
}

{
  const snapDaten = new Map([
    ["kd:master", KONTO_MASTER],
    [ACCT_KEYS.snap, JSON.stringify({ "kd:master": [{ value: KONTO_MASTER }] })],
    [ACCT_KEYS.owner, "konto-S"],
  ]);
  const snapStorage = {
    getItem: (key) => snapDaten.has(key) ? snapDaten.get(key) : null,
    setItem: (key, value) => void snapDaten.set(key, String(value)),
    removeItem(key) {
      if (key === ACCT_KEYS.snap) throw new DOMException("Snapshot gesperrt", "InvalidStateError");
      snapDaten.delete(key);
    },
  };
  const vorher = globalThis.localStorage;
  globalThis.localStorage = snapStorage;
  let geworfen = false;
  try { KontoService.quarantaeneKontodatenNachAbmeldung(); }
  catch { geworfen = true; }
  globalThis.localStorage = vorher;
  check("Nicht entfernbarer Account-Vollwertsnapshot verhindert Erfolg und bewahrt den Owner",
    geworfen
    && !snapDaten.has("kd:master")
    && snapDaten.has(ACCT_KEYS.snap)
    && snapDaten.get(ACCT_KEYS.owner) === "konto-S");
}

{
  const noopDaten = new Map([
    ["kd:master", KONTO_MASTER],
    [ACCT_KEYS.snap, JSON.stringify({ "kd:master": [{ value: KONTO_MASTER }] })],
    [ACCT_KEYS.owner, "konto-N"],
  ]);
  const noopStorage = {
    getItem: (key) => noopDaten.has(key) ? noopDaten.get(key) : null,
    setItem: (key, value) => void noopDaten.set(key, String(value)),
    removeItem(key) {
      if (key !== ACCT_KEYS.snap) noopDaten.delete(key);
    },
  };
  const r = U.stelleGaststandNachAbmeldungWiederHer("konto-N", noopStorage);
  check("Stilles Snapshot-remove-No-op wird rückgelesen und nie als Gast-Erfolg gemeldet",
    !r.ok
    && noopDaten.has(ACCT_KEYS.snap)
    && noopDaten.get(ACCT_KEYS.owner) === "konto-N");
}

{
  const orphanMaster = "PERSOENLICHER-HAUPTTOPF";
  daten.clear();
  daten.set("kd:master", orphanMaster);
  daten.set(ACCT_KEYS.snap, "VERWAISTER-ACCOUNT-SNAPSHOT");
  check("Upgrade-Cleanup entfernt ownerlose Account-Snapshots, aber keine persönlichen Haupttöpfe",
    AccountDriver.bereinigeVerwaisteTreiberMetadaten()
    && !daten.has(ACCT_KEYS.snap)
    && daten.get("kd:master") === orphanMaster);
}

{
  const kontoUi = readFileSync(new URL("./src/components/KontoBereich.jsx", import.meta.url), "utf8");
  check("Die Kontooberfläche meldet Quarantäne ehrlich statt einen restaurierten Gaststand zu behaupten",
    /logout\?\.gaststand\?\.quelle === "konto-cache-quarantaene"/.test(kontoUi)
    && /setFehler\(logout\.gaststand\.warnung/.test(kontoUi));
}

console.log(`KONTO-LOGOUT-TEST BESTANDEN (${ok}/${ok})`);
