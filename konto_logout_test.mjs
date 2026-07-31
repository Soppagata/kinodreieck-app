/* Logout-Grenze: Kontocache verschwindet aus dem Gastbetrieb, während der
   lokale Stand von vor der Anmeldung und reine Gerätezustände erhalten bleiben. */

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
const { PERSONAL_DATA_KEYS } = await import("./src/lib/personalDataRegistry.js");

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
  const r = U.stelleGaststandNachAbmeldungWiederHer("konto-A");
  check("Logout stellt den früheren Gastbestand wieder her",
    r.ok && daten.get("kd:master") === GAST_MASTER
      && /mubi/.test(daten.get("kd:streaming-dienste")));
  check("Reine Kontodaten bleiben nach Logout nicht als Gast sichtbar",
    !daten.has("kd:geschmacksprofil"));
  check("Gerätelokale KI-Grundwahl bleibt vom Konto-Logout unberührt",
    /false/.test(daten.get("kd:ki")));
  check("Logout entfernt Rückholpunkt und Übernahmemarke", !daten.has(U.UEBERNAHME_SNAP));
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

console.log(`KONTO-LOGOUT-TEST BESTANDEN (${ok}/${ok})`);
