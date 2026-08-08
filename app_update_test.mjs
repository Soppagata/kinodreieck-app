import {
  aktualisiereServiceWorker,
  buildMetaUrl,
  ladeBuildMeta,
  neuerBuild,
  pruefbareUmgebung,
  sichtbarerUpdateBuild,
} from "./src/lib/appUpdate.js";
import { readFileSync } from "node:fs";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

check("Nur ausgelieferte Umgebungen prüfen auf neue Builds",
  pruefbareUmgebung("staging") && pruefbareUmgebung("production")
  && !pruefbareUmgebung("local"));
check("Eine ausgelieferte Konfiguration pollt unter file:// keine Build-Metadaten",
  !pruefbareUmgebung("staging", "file:")
  && !pruefbareUmgebung("production", "FILE:"));
check("Build-Metadaten werden mit Cache-Buster relativ zur App geladen",
  buildMetaUrl("./", 123) === "./build-meta.json?kd-check=123");
check("Nur eine tatsächlich abweichende gültige Version löst ein Update aus",
  neuerBuild({ format: 1, buildVersion: "neu" }, "alt") === "neu"
  && neuerBuild({ format: 1, buildVersion: "gleich" }, "gleich") === null
  && neuerBuild({ format: 2, buildVersion: "neu" }, "alt") === null
  && neuerBuild({ format: 1, buildVersion: "neu" }, "dev") === null);
check("Ein geschlossener Build bleibt für die Sitzung verborgen, ein anderer erscheint wieder",
  sichtbarerUpdateBuild("build-b", "build-b") === ""
  && sichtbarerUpdateBuild("build-c", "build-b") === "build-c");

const hinweisCode = readFileSync("src/components/AppUpdateHinweis.jsx", "utf8");
check("Das Update-Banner bietet einen klaren, nur im Komponentenleben gemerkten Schließenknopf",
  /geschlossenerBuildRef\s*=\s*useRef\(""\)/.test(hinweisCode)
  && /aria-label="Update-Hinweis für diese Sitzung schließen"/.test(hinweisCode)
  && !/localStorage|sessionStorage/.test(hinweisCode));

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

let dateiFetches = 0;
const dateiMeta = await ladeBuildMeta({
  protokoll: "file:",
  fetchFn: async () => { dateiFetches++; return { ok: true }; },
});
check("Auch ein direkter Versionsabruf bleibt unter file:// netzfrei",
  dateiMeta === null && dateiFetches === 0);

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
