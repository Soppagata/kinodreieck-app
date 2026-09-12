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
    "Katalogquellen und FlixPatrol",
    "revisionsbasiert",
    "KI- und Suchanbieter",
    "Diagnose, Support und Feedback",
    "Download, Rechte und Löschung",
  ]) assert.match(source, new RegExp(text));
});

check("FlixPatrol-Transparenz bildet den zentralen Cache und seine belegten Grenzen ab", () => {
  assert.match(source, /ausschließlich serverseitig mit dem Betreiber-API-Key/);
  assert.match(source, /Browser liest begrenzte, gemeinsam gecachte Fakten aus dem eigenen Supabase-Projekt/);
  assert.match(source, /Profile, Bewertungen, Notizen, ausgewählte Streaming-Abos[\s\S]*nicht an FlixPatrol gesendet/);
  assert.match(source, /Chartplatz ist kein Geschmacks- oder Qualitätsurteil und belegt keine Verfügbarkeit/);
  assert.match(source, /keine verlässliche API-Aufbewahrungsfrist, Transferregion oder DPA-Aussage/);
  assert.match(source, /Frischezeitraum[\s\S]*keine Aussage über die Löschung beim Anbieter/);
});

check("KI-Hinweise begrenzen FlixPatrol auf Forecast, strukturiertes Radar und nachgelagerten Profilabgleich", () => {
  assert.match(source, /Filmprognose[\s\S]*FlixPatrol-Cachetreffer/);
  assert.match(source, /autorisierten strukturierten Film- oder Serienziel[\s\S]*nicht Personen-, Titelgruppen- oder Freitextzielen/);
  assert.match(source, /Profil-Extraktion erhält Anthropic keine FlixPatrol-Daten/);
  assert.match(source, /Andere KI-Funktionen erhalten keinen FlixPatrol-Kontext/);
  assert.match(source, /FlixPatrol-Nachprüfung bei Import und Kataloganreicherung[\s\S]*keine zusätzlichen FlixPatrol- oder KI-Anfragen/);
});

check("Resend- und Kontaktinformation ist eng und ohne private Adresse", () => {
  assert.doesNotMatch(source, /@hotmail\.com/i);
  assert.equal((source.match(/<a\b/g) || []).length, 1);
  assert.match(source, /privaten Kontaktweg, über den du deinen Zugang erhalten hast/);
  assert.match(source, /privaten Feedbackweg unter Settings → Datenschutz &amp; Rechtliches/);
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
