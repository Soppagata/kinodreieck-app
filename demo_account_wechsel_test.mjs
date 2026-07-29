import {
  ladeKontostandNachDemo, DEMO_STATUS_KEYS,
} from "./src/services/demoAccountWechsel.js";

let ok = 0;
const fehler = [];
async function check(name, fn) {
  try {
    if (!await fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (e) {
    fehler.push(name + ": " + (e?.message || e));
    console.error("✗ " + name + ": " + (e?.message || e));
  }
}

function aufbau({
  pull = { ok: true, geladen: ["kd:master"], angelegt: ["kd:artikel"], konflikt: [], fehler: [] },
  sichern = true,
  konfliktOk = true,
} = {}) {
  const werte = new Map([
    ["kd:master", "remote-master"],
    ["kd:artikel", "demo-artikel"],
    ...DEMO_STATUS_KEYS.map((k) => [k, "demo"]),
  ]);
  const entfernt = [];
  const bestaetigt = [];
  const konflikte = [];
  let pullZahl = 0;
  const deps = {
    leseLokaleToepfe: async () => ({ "kd:master": "demo-master", "kd:artikel": "demo-artikel" }),
    sichereRueckholpunkt: async () => sichern,
    pull: async () => { pullZahl++; return pull; },
    remoteBehalten: async (key) => { konflikte.push(key); return { ok: konfliktOk }; },
    bestaetigen: (id) => bestaetigt.push(id),
    storage: {
      removeItem(key) { entfernt.push(key); werte.delete(key); },
      getItem(key) { return werte.get(key) ?? null; },
    },
    syncKeys: ["kd:master", "kd:artikel"],
    demoKeys: DEMO_STATUS_KEYS,
  };
  return { deps, werte, entfernt, bestaetigt, konflikte, pullZahl: () => pullZahl };
}

await check("sichert den Gerätestand vor dem Pull", async () => {
  const a = aufbau({ sichern: false });
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps }).catch(() => {});
  return a.pullZahl() === 0 && a.werte.get("kd:artikel") === "demo-artikel";
});

await check("fehlender Remote-Topf lässt keine Demo-Daten stehen", async () => {
  const a = aufbau();
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps });
  return !a.werte.has("kd:artikel");
});

await check("vorhandener Kontotopf wird nicht nachträglich gelöscht", async () => {
  const a = aufbau();
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps });
  return a.werte.get("kd:master") === "remote-master";
});

await check("alle Demo-Statusmarken verschwinden erst nach Erfolg", async () => {
  const a = aufbau();
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps });
  return DEMO_STATUS_KEYS.every((key) => !a.werte.has(key));
});

await check("der Kontoübergang wird für genau dieses Konto bestätigt", async () => {
  const a = aufbau();
  await ladeKontostandNachDemo({ accountId: "konto-7", abhaengigkeiten: a.deps });
  return JSON.stringify(a.bestaetigt) === JSON.stringify(["konto-7"]);
});

await check("Pull-Fehler behält Demo-Marken und bestätigt nichts", async () => {
  const a = aufbau({ pull: { ok: false, angelegt: [], konflikt: [], fehler: ["offline"] } });
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps }).catch(() => {});
  return DEMO_STATUS_KEYS.every((key) => a.werte.has(key)) && a.bestaetigt.length === 0;
});

await check("Konflikte werden ausdrücklich zugunsten des Kontos aufgelöst", async () => {
  const a = aufbau({ pull: { ok: true, geladen: [], angelegt: [], konflikt: ["kd:master"], fehler: [] } });
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps });
  return JSON.stringify(a.konflikte) === JSON.stringify(["kd:master"]);
});

await check("nicht auflösbarer Konflikt behält die Demo-Marken", async () => {
  const a = aufbau({
    pull: { ok: true, geladen: [], angelegt: [], konflikt: ["kd:master"], fehler: [] },
    konfliktOk: false,
  });
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps }).catch(() => {});
  return DEMO_STATUS_KEYS.every((key) => a.werte.has(key)) && a.bestaetigt.length === 0;
});

await check("fremde Schlüssel werden niemals gelöscht", async () => {
  const a = aufbau({ pull: { ok: true, geladen: [], angelegt: ["kd:fremd"], konflikt: [], fehler: [] } });
  await ladeKontostandNachDemo({ accountId: "max", abhaengigkeiten: a.deps }).catch(() => {});
  return !a.entfernt.includes("kd:fremd") && DEMO_STATUS_KEYS.every((key) => a.werte.has(key));
});

await check("ohne Konto-ID beginnt kein Übergang", async () => {
  const a = aufbau();
  await ladeKontostandNachDemo({ abhaengigkeiten: a.deps }).catch(() => {});
  return a.pullZahl() === 0;
});

console.log(`\n${ok}/${ok + fehler.length} Demo→Konto-Checks bestanden.`);
if (fehler.length) {
  for (const f of fehler) console.error("  " + f);
  process.exit(1);
}
