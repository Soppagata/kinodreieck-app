import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/components/EinstiegsGate.jsx", import.meta.url), "utf8");
const settingsSource = await readFile(new URL("./src/components/PrivatePilotOps.jsx", import.meta.url), "utf8");
const registry = await readFile(new URL("./src/lib/privatePilotOps.js", import.meta.url), "utf8");
const disclosure = await readFile(new URL("./src/components/DatenschutzDienste.jsx", import.meta.url), "utf8");
const sharedDisclosure = `${registry}\n${disclosure}`;
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
  assert.equal((source.match(/<DatenschutzDienste\s*\/>/g) || []).length, 2);
  assert.match(disclosure, /PRIVATE_PROVIDER_REGISTRY\.map/);
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

check("Resend-, Kontakt- und MotN-Attribution sind eng und ohne private Adresse", () => {
  assert.doesNotMatch(`${source}\n${sharedDisclosure}`, /@hotmail\.com/i);
  assert.match(sharedDisclosure, /https:\/\/www\.movieofthenight\.com\/privacy-policy/);
  assert.match(sharedDisclosure, /direkte API von Movie of the Night/);
  assert.doesNotMatch(sharedDisclosure, /RapidAPI/);
  assert.match(sharedDisclosure, /https:\/\/resend\.com\/legal\/privacy-policy/);
  assert.match(sharedDisclosure, /Konto-ID und Zeitstempel/);
  assert.match(source, /privaten Kontaktweg, über den du deinen Zugang erhalten hast/);
  assert.match(source, /privaten Feedbackweg in der App senden, sofern dieser Weg verfügbar ist/);
  assert.match(source, /Resend in den USA/);
  assert.match(source, /technischen Metadaten standardmäßig 30 Tage/);
  assert.match(source, /interne Empfänger bleibt serverseitig gebunden und wird nicht veröffentlicht/);
});

check("Kein Kontoexport oder Restore wird versprochen", () => {
  assert.match(source, /vollständiger Download aller Konto- und Serverdaten ist derzeit nicht verfügbar/);
  assert.match(source, /Datei lässt sich derzeit nicht direkt wieder in die App einlesen/);
  assert.match(source, /löscht nicht sofort automatisch/);
});

check("Zentrales Register nennt alle produktiven Datenwege ohne interne Freigabeflags", () => {
  for (const name of ["Supabase", "Cloudflare Pages", "GitHub und GitHub Actions", "Anthropic API", "Watchmode", "Movie of the Night", "Österreichisches Filminstitut", "Netflix Top 10", "FlixPatrol API", "Wikidata", "Library of Congress", "film.at", "nonstopkino.at", "Resend"]) {
    assert.ok(registry.includes(`name: "${name}"`));
  }
  assert.match(registry, /automatischer Radar-Lauf[\s\S]*unabhängig vom lokalen KI-Schalter/);
  assert.doesNotMatch(disclosure, /serverFlag|enabledByDefault|legalStatus/);
  assert.doesNotMatch(disclosure, /geprüft am/);
});

check("Kurzfassungen nennen manuelle KI-Aufträge und automatischen Server-Radar getrennt", () => {
  for (const text of [source, settingsSource]) {
    assert.match(text, /bewusst gestarteten? KI-(?:Funktion|Funktionen|Aufgaben)/);
    assert.match(text, /automatische[nr]? Radar-(?:Lauf|Prüfung)/);
    assert.match(text, /lokale KI-Schalter stoppt diesen Server-Radar nicht/);
    assert.doesNotMatch(text, /Anthropic erhält nur den begrenzten Inhalt einer bewusst gestarteten/);
  }
});

check("Analytics- und Bannerentscheidung bleibt auf den privaten Release begrenzt", () => {
  assert.match(source, /Web-Analytics, Werbetracking und Profiling zu Analysezwecken sind für diesen Release ausgeschaltet/);
  assert.match(source, /nur technisch notwendige Speicherungen/);
  assert.match(source, /kein Cookie-Banner eingesetzt/);
});

console.log(`${checks}/${checks} private-release Legal-Checks grün`);
