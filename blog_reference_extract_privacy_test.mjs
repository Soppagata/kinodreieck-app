import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { KI_FUNKTIONEN, KI_WAHL_VERSION, kiAn } from "./src/lib/kiSchalter.js";
import { PERSONAL_DATA_ENTRIES } from "./src/lib/personalDataRegistry.js";
import {
  ACCOUNT_EXPORT_REQUIRED_SCOPE,
  PRIVATE_DATA_INVENTORY,
  PRIVATE_PROVIDER_REGISTRY,
  RETENTION_CLASSES,
} from "./src/lib/privatePilotOps.js";

const dateien = Object.fromEntries(await Promise.all([
  "src/tabs/DatenTab.jsx",
  "src/lib/hilfeInhalte.js",
  "src/components/EinstiegsGate.jsx",
  "src/components/PrivatePilotOps.jsx",
  "src/components/DatenschutzDienste.jsx",
].map(async (pfad) => [pfad, await readFile(new URL(`./${pfad}`, import.meta.url), "utf8")])));

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

function storageMitBestandswahl(funktionen = {}) {
  const werte = new Map([
    ["kd:ki-version", "e8-v1"],
    ["kd:ki", JSON.stringify({
      global: true,
      funktionen,
      gefragtAm: "2026-09-17T12:00:00.000Z",
    })],
  ]);
  return {
    getItem: (key) => werte.get(key) ?? null,
    setItem: (key, value) => werte.set(key, String(value)),
  };
}

check("Blogreferenzen sind ein additiver, standardmäßig ausgeschalteter Geräte-Opt-in", () => {
  assert.equal(KI_WAHL_VERSION, "e8-v1");
  assert.deepEqual(KI_FUNKTIONEN.blogReferenzen, {
    label: "Titel aus Blogtexten mit KI erkennen",
    beschreibung: "Auf deinen Klick die Überschrift und den aktuellen Blogtext an Anthropic senden. Du prüfst die Vorschläge und wählst die Referenzen selbst aus.",
    standardAn: false,
    beiAus: "ausblenden",
  });
  assert.equal(kiAn("blogReferenzen", storageMitBestandswahl()), false);
  assert.equal(kiAn("blogReferenzen", storageMitBestandswahl({ blogReferenzen: true })), true);
});

check("Settings zeigen die manuelle Funktion zentral und versprechen keinen Sync des Schalters", () => {
  const text = dateien["src/tabs/DatenTab.jsx"];
  assert.match(text, /Titel in einem Blogtext erkennen/);
  assert.match(text, /Diese Wahl gilt nur für diesen Browser auf diesem Gerät/);
  assert.match(text, /wird weder\s+synchronisiert noch gesichert/);
  assert.match(text, /übernommene Blogreferenzen/);
  assert.doesNotMatch(text, /id !== "blogReferenzen"/);
});

check("Kurzlebige Vorschläge sind als Inhaltsdaten mit exakter Backend-Naht registriert", () => {
  const eintrag = PRIVATE_DATA_INVENTORY.find((item) => item.id === "blogReferenceExtractions");
  assert.ok(eintrag);
  assert.equal(eintrag.legalStatus, "CONTENT_PAYLOAD");
  assert.notEqual(eintrag.legalStatus, "NO_CONTENT_PAYLOAD");
  assert.equal(eintrag.retention, RETENTION_CLASSES.BLOG_REFERENCE_EXTRACTIONS.id);
  assert.match(eintrag.locations.join(" "), /kd_blog_reference_extractions/);
  assert.match(eintrag.export, /kd_private_own_data\.blogReferenceExtractions/);
  assert.match(eintrag.export, /nicht in der Gerätesicherung/);
  assert.match(eintrag.deleteTrigger, /24 Stunden/);
  assert.match(eintrag.deleteTrigger, /stündlicher Purge/);
  assert.match(eintrag.deleteTrigger, /spätestens nach 25 Stunden/);
  assert.match(eintrag.deleteTrigger, /FK-Cascade/);
  assert.equal(eintrag.featureFlag, null);
  assert.ok(ACCOUNT_EXPORT_REQUIRED_SCOPE.some((item) => item.id === "blog-reference-extractions"));
});

check("Nicht übernommene Vorschläge erhalten keinen Geräte-Topf; übernommene Referenzen bleiben im Artikel", () => {
  assert.equal(PERSONAL_DATA_ENTRIES.length, 19);
  assert.equal(PERSONAL_DATA_ENTRIES.some((entry) => /blogReferenceExtractions|blog_reference/i.test(entry.key)), false);
  const artikel = PERSONAL_DATA_ENTRIES.find((entry) => entry.backupField === "artikel");
  assert.match(artikel.label, /übernommener Referenzen/);
  const referenz = { rowId: "row-1", eingabe: "Her", jahr: 2013, typ: "film", ref: "master:her-2013" };
  const backup = artikel.backupAusRoh(JSON.stringify({
    artikel: [{ id: "artikel-1", titel: "Ein Text", liste: [referenz] }],
  }));
  assert.deepEqual(backup[0].liste[0], referenz);
});

check("Anthropic-Registry benennt Klick, vollständigen Blogtext, persönliche Angaben und Vertragsgrenzen", () => {
  const anthropic = PRIVATE_PROVIDER_REGISTRY.find((entry) => entry.id === "anthropic");
  assert.ok(anthropic);
  assert.match(anthropic.data, /nach dem Klick/);
  assert.match(anthropic.data, /Überschrift und der vollständige begrenzte Blogtext/);
  assert.match(anthropic.data, /persönliche Angaben im Text werden mitgesendet/);
  assert.match(anthropic.usage, /„Anonym veröffentlichen“ anonymisiert ihre Eingabe nicht/);
  assert.match(anthropic.retentionNote, /innerhalb von 30 Tagen/);
  assert.match(anthropic.retentionNote, /Ausnahmen/);
  assert.match(anthropic.retentionNote, /weder die konkrete Kinodreieck-Vertragslage noch EU-only, Zero Data Retention oder eine bestimmte Trainingseinstellung/);
  assert.match(anthropic.region, /Speicherung in den USA/);
  assert.equal(anthropic.retrievedAt, "2026-09-18");
  assert.match(anthropic.technicalSource, /where-are-your-servers-located/);
  assert.match(anthropic.termsSource, /data-processing-addendum/);
  assert.ok(anthropic.additionalSources.some((source) => /data-processor-or-controller/.test(source.href)));
});

check("Login- und Langtexte trennen Profilanalyse und Referenzerkennung", () => {
  const text = dateien["src/components/EinstiegsGate.jsx"];
  assert.match(text, /Blog-Geschmacksanalyse[^<]*Titel, Text, Genres und Tags/);
  assert.match(text, /ohne Konto- oder Artikelkennung/);
  assert.match(text, /„Titel im Text erkennen \(KI\)“ erst nach deinem Klick/);
  assert.match(text, /keine Konto- oder Artikelkennung, Mediathek oder Geschmacksdaten hinzugefügt/);
  assert.match(text, /„Anonym veröffentlichen“[^<]*anonymisiert nicht/);
  assert.match(text, /24 Stunden zur erneuten Anzeige/);
  assert.match(text, /spätestens nach 25 Stunden/);
  assert.match(text, /blogReferenceExtractions/);
  assert.doesNotMatch(text, /ausgewählten Artikel mit ID/);
});

check("Kurzfassung und Datenrechte erklären Transfer, Inhaltsklasse und Sicherungsgrenze", () => {
  const text = dateien["src/components/PrivatePilotOps.jsx"];
  assert.match(text, /erst nach deinem Klick die Überschrift und den vollständigen begrenzten Blogtext/);
  assert.match(text, /persönliche Angaben im Text werden mitgesendet/);
  assert.match(text, /spätestens nach 25 Stunden gelöscht/);
  assert.match(text, /Nicht übernommene KI-Vorschläge erhalten keinen eigenen Geräte- oder Backup-Topf/);
  assert.match(text, /serverseitige Vorschläge und kurze Textfundstellen gehören stattdessen zum Konto-\/Rechteweg/);
});

check("Blog- und Settingshilfe lassen Auswahl und manuelles Arbeiten beim Nutzer", () => {
  const text = dateien["src/lib/hilfeInhalte.js"];
  assert.match(text, /vollständigen aktuellen Blogtext an Anthropic/);
  assert.match(text, /Persönliche Angaben im Text werden mitgesendet/);
  assert.match(text, /„Anonym veröffentlichen“ anonymisiert diese KI-Eingabe nicht/);
  assert.match(text, /klärst mehrdeutige Titel und wählst auch mehrere Referenzen selbst aus/);
  assert.match(text, /Kein Vorschlag wird automatisch übernommen oder veröffentlicht/);
  assert.match(text, /Schreiben, Speichern und manuelle Referenzen funktionieren ohne diese KI-Funktion weiter/);
  assert.match(text, /standardmäßig ausgeschalteten Erkennung von Titeln in Blogtexten/);
});

check("Die zentrale Dienstedarstellung rendert alle offiziellen Anthropic-Quellen aus derselben Registry", () => {
  const text = dateien["src/components/DatenschutzDienste.jsx"];
  assert.match(text, /entry\.technicalSourceLabel/);
  assert.match(text, /entry\.termsSourceLabel/);
  assert.match(text, /entry\.additionalSources/);
  assert.equal(/Anthropic API/.test(text), false);
});

console.log(`${checks}/${checks} Blog-Reference-Privacy-Checks grün`);
