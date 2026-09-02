import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/components/EinstiegsGate.jsx", import.meta.url), "utf8");
let checks = 0;
const check = (name, assertion) => {
  assertion();
  checks += 1;
  console.log(`✓ ${name}`);
};

check("Login behält genau einen sichtbaren Legal-Einstieg", () => {
  assert.equal((source.match(/className="kd-entry-legal-link"/g) || []).length, 1);
  assert.match(source, />Datenschutz &amp; Rechtliches<\/a>/);
});

check("Datenübersicht deckt die tatsächlichen Speicher- und Transportgrenzen ab", () => {
  for (const text of [
    "Daten im Browser und auf diesem Gerät",
    "Service Worker",
    "Anmeldung, Konto und Synchronisation",
    "revisionsbasiert",
    "KI- und Suchanbieter",
    "Diagnose, Support und Feedback",
    "Download, Rechte und Löschung",
  ]) assert.match(source, new RegExp(text));
});

check("Resend- und Kontaktinformation ist eng und ausdrücklich", () => {
  assert.equal((source.match(/max\.rinke@hotmail\.com/g) || []).length, 1);
  assert.equal((source.match(/<a\b/g) || []).length, 1);
  assert.match(source, /Resend in den USA/);
  assert.match(source, /technischen Metadaten standardmäßig 30 Tage/);
  assert.match(source, /interne Empfänger bleibt serverseitig gebunden und wird nicht veröffentlicht/);
});

check("Kein Kontoexport oder Restore wird versprochen", () => {
  assert.match(source, /kein bestätigter vollständiger Server- oder Kontoexport/);
  assert.match(source, /keine Zusage, dass eine Wiederherstellung oder ein Reimport verfügbar ist/);
  assert.match(source, /löscht nicht sofort automatisch/);
});

check("Analytics- und Bannerentscheidung bleibt auf den privaten Release begrenzt", () => {
  assert.match(source, /Web-Analytics, Werbetracking und Profiling zu Analysezwecken sind für diesen Release ausgeschaltet/);
  assert.match(source, /nur technisch notwendige Speicherungen/);
  assert.match(source, /kein Cookie-Banner eingesetzt/);
});

console.log(`${checks}/${checks} private-release Legal-Checks grün`);
