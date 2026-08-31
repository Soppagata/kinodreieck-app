/* Automatischer Kontodownload nach Login: Der Gaststand bleibt als lokaler
   Rückholpunkt getrennt, sichtbar wird ausschließlich kd_personal. */

const { kontoSicherAutomatischLaden } = await import("./src/services/uebernahme.js");
const {
  sichereGebundenenGastRueckholpunkt,
  stelleGaststandNachAbmeldungWiederHer,
} = await import("./src/lib/uebernahme.js");
const { PERSONAL_DATA_KEYS } = await import("./src/lib/personalDataRegistry.js");

const speicher = new Map();
globalThis.localStorage = {
  getItem: (key) => speicher.has(key) ? speicher.get(key) : null,
  setItem: (key, value) => speicher.set(key, String(value)),
  removeItem: (key) => speicher.delete(key),
};

let ok = 0;
function check(name, value) {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

function inventur(fall, stati) {
  return async () => ({
    ok: true,
    fall,
    lokaleWerte: { "kd:master": null },
    vorschau: stati.map((status) => ({ status })),
  });
}

{
  const calls = [];
  let geworfen = false;
  try {
    await kontoSicherAutomatischLaden("konto-A", {
      inventur: async () => ({ ok: false, erreichbar: false, fall: "beide-leer", vorschau: [] }),
      bestaetigen: () => calls.push("bestaetigen"),
    });
  } catch { geworfen = true; }
  check("Nicht erreichbare Konten werden niemals als leer bestätigt", geworfen && calls.length === 0);
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("nur-konto", ["nur-konto", "beide-leer"]),
    kontoLaden: async () => { calls.push("laden"); return { ok: true }; },
    bestaetigen: (id) => calls.push("bestaetigen:" + id),
  });
  check("Leeres Gerät lädt vorhandene Kontodaten direkt", ergebnis.automatisch
    && calls.join("|") === "laden|bestaetigen:konto-A");
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("beide-leer", ["beide-leer"]),
    kontoLaden: async () => { calls.push("laden"); return { ok: true }; },
    bestaetigen: (id) => calls.push(id),
  });
  check("Auch zwei leere Bestände durchlaufen dieselbe gebundene Downloadgrenze",
    ergebnis.grund === "konto-geladen" && calls.join("|") === "laden|konto-A");
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("beide-belegt", ["identisch", "beide-leer"]),
    kontoLaden: async () => { calls.push("laden"); return { ok: true }; },
    bestaetigen: () => calls.push("bestaetigen"),
  });
  check("Bitgleiche Bestände verwenden denselben Remote→lokal-Pfad",
    ergebnis.grund === "konto-geladen" && calls.join("|") === "laden|bestaetigen");
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("beide-belegt", ["unterschiedlich"]),
    kontoLaden: async () => { calls.push("laden"); return { ok: true }; },
    bestaetigen: () => calls.push("bestaetigen"),
    merge: () => calls.push("merge"),
    upload: () => calls.push("upload"),
  });
  check("Abweichender Gaststand zeigt ohne Merge oder Upload direkt kd_personal",
    ergebnis.automatisch && ergebnis.grund === "konto-geladen"
    && calls.join("|") === "laden|bestaetigen");
}

{
  speicher.clear();
  const gastMaster = '{"filme":[{"id":"gast","titel":"Gast bleibt bytegleich"}],"notiz":"äöü"}';
  const gastArtikel = '{"artikel":[{"id":"gast-artikel","titel":"Lokal"}]}';
  const kontoMaster = '{"filme":[{"id":"konto","titel":"kd_personal"}]}';
  localStorage.setItem("kd:master", gastMaster);
  localStorage.setItem("kd:artikel", gastArtikel);
  const gastVorher = Object.fromEntries(PERSONAL_DATA_KEYS.map((key) => [key, localStorage.getItem(key)]));
  const effekte = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: async () => ({
      ok: true, erreichbar: true, fall: "beide-belegt",
      lokaleWerte: gastVorher, vorschau: [{ status: "unterschiedlich" }],
    }),
    kontoLaden: async () => {
      const snap = sichereGebundenenGastRueckholpunkt("konto-A");
      if (!snap?.werte) return { ok: false };
      effekte.push("pull");
      for (const key of PERSONAL_DATA_KEYS) localStorage.removeItem(key);
      localStorage.setItem("kd:master", kontoMaster);
      return { ok: true };
    },
    bestaetigen: () => effekte.push("bestaetigen"),
    merge: () => effekte.push("merge"),
    upload: () => effekte.push("upload"),
  });
  check("Login zeigt ausschließlich den synthetischen kd_personal-Stand",
    ergebnis.automatisch && localStorage.getItem("kd:master") === kontoMaster
    && localStorage.getItem("kd:artikel") === null
    && effekte.join("|") === "pull|bestaetigen");
  const restore = stelleGaststandNachAbmeldungWiederHer("konto-A");
  check("Logout stellt jeden Gasttopf bytegleich wieder her",
    restore.ok && PERSONAL_DATA_KEYS.every((key) => localStorage.getItem(key) === gastVorher[key])
    && localStorage.getItem("kd:master") === gastMaster
    && localStorage.getItem("kd:artikel") === gastArtikel);
}

{
  const calls = [];
  let geworfen = false;
  try {
    await kontoSicherAutomatischLaden("konto-A", {
      inventur: inventur("nur-konto", ["nur-konto"]),
      kontoLaden: async () => ({ ok: false }),
      bestaetigen: () => calls.push("bestaetigen"),
    });
  } catch { geworfen = true; }
  check("Fehlgeschlagener Download aktiviert den Kontospeicher nicht", geworfen && calls.length === 0);
}

console.log(`KONTO-AUTOLADEN-TEST BESTANDEN (${ok}/${ok})`);
