import {
  aktualisiereServiceWorker,
  buildMetaUrl,
  ladeBuildMeta,
  neuerBuild,
  pruefbareUmgebung,
} from "./src/lib/appUpdate.js";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

check("Nur ausgelieferte Umgebungen prüfen auf neue Builds",
  pruefbareUmgebung("staging") && pruefbareUmgebung("production")
  && !pruefbareUmgebung("local"));
check("Build-Metadaten werden mit Cache-Buster relativ zur App geladen",
  buildMetaUrl("./", 123) === "./build-meta.json?kd-check=123");
check("Nur eine tatsächlich abweichende gültige Version löst ein Update aus",
  neuerBuild({ format: 1, buildVersion: "neu" }, "alt") === "neu"
  && neuerBuild({ format: 1, buildVersion: "gleich" }, "gleich") === null
  && neuerBuild({ format: 2, buildVersion: "neu" }, "alt") === null
  && neuerBuild({ format: 1, buildVersion: "neu" }, "dev") === null);

let fetchAufruf = null;
const meta = await ladeBuildMeta({
  baseUrl: "/app/",
  zeit: 456,
  fetchFn: async (url, optionen) => {
    fetchAufruf = { url, optionen };
    return { ok: true, json: async () => ({ format: 1, buildVersion: "abc" }) };
  },
});
check("Versionsabruf umgeht Browser- und Worker-Cache",
  meta.buildVersion === "abc"
  && fetchAufruf.url === "/app/build-meta.json?kd-check=456"
  && fetchAufruf.optionen.cache === "no-store");

let updates = 0;
const registrierung = {
  async update() { updates++; },
};
const serviceWorker = { async getRegistration(scope) {
  check("Service Worker wird im App-Scope gesucht", scope === "./");
  return registrierung;
} };
await aktualisiereServiceWorker({ serviceWorker, baseUrl: "./" });
check("Hintergrundprüfung fordert genau eine Worker-Aktualisierung an", updates === 1);

console.log(`APP-UPDATE-TEST BESTANDEN (${ok}/${ok})`);
