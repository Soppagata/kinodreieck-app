import { useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { Logo } from "./ui.jsx";
import { DreieckRegler } from "./DreieckRegler.jsx";

/* ================= Erklärstücke (Etappe 4, ausgelagert aus StartTab) =================
   Hero („LOKALE FILM-PLATTFORM"), Dreieck-Erklärung (eine Karte pro Ecke)
   und die eingebaute Anleitung (DokuAnsicht). Zwei Orte rendern sie:
   · Beta-Landing (StartTab, PERSONAL_MODE=false) — wie bisher.
   · „Über"-Einstieg in den Einstellungen (PERSONAL_MODE=true), weil das
     Start-Dashboard die Erklärinhalte nicht mehr trägt.
   Styles werden pro Render berechnet (T ist theme-reaktiv). */

const h2Of = () => ({ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" });
const monoOf = () => ({ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch });

export const ECKEN = [
  {
    achse: "WIE", frage: "Wie ist es gemacht?",
    farbe: (t) => t.wie,
    text: "Das Handwerk: Regie, Kamera, Schnitt, Schauspiel, Ton. Ein Film kann inhaltlich banal sein und trotzdem meisterhaft gebaut — das WIE misst genau das, unabhängig vom Stoff.",
  },
  {
    achse: "WAS", frage: "Was erzählt es?",
    farbe: (t) => t.was,
    text: "Die Substanz: Stoff, Ideen, Themen, Fallhöhe. Trägt die Geschichte? Hat sie etwas zu sagen? Das WAS bewertet den Gehalt — auch wenn die Umsetzung wackelt.",
  },
  {
    achse: "WARUM", frage: "Warum sollte man ihn gesehen haben?",
    farbe: (t) => t.warum,
    text: "Die Relevanz: Einfluss auf spätere Filme, Genres, Karrieren und Bildsprachen — oder darauf, was Popkultur bis heute zitiert und weitererzählt. Persönliche Bedeutung darf ergänzen, ersetzt diese Wirkung aber nicht.",
  },
];

/* ---- Hero ---- */
export function ErklaerHero() {
  const mono = monoOf();
  return (
    <div style={{ textAlign: "center", padding: "34px 16px 10px", position: "relative" }}>
      <div style={{ display: "inline-block", margin: "8px 0 30px", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.45))" }}>
        <Logo size={132} />
      </div>
      <div style={{ ...mono, letterSpacing: "0.3em", color: T.rauch, marginBottom: 8 }}>LOKALE FILM-PLATTFORM</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "clamp(38px, 8vw, 46px)", letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1 }}>
        Kinodreieck
      </div>
      <div style={{ width: 120, height: 2, margin: "16px auto 0", background: "linear-gradient(90deg, transparent, " + T.wolfram + ", transparent)" }} />
      <p style={{ fontSize: 15, color: T.leinwandTief, maxWidth: 520, margin: "18px auto 0", lineHeight: 1.65 }}>
        Deine Filme, dein Kino, dein Urteil — eine persönliche Plattform für Programm,
        Mediathek, Streaming und Blog. Deine Daten bleiben im Browser und können optional
        zwischen Geräten synchronisiert werden. Keine Telemetrie, kein Verkaufsalgorithmus.
      </p>
    </div>
  );
}

/* ---- Das Dreieck: eine Karte pro Ecke ---- */
export function DreieckErklaerung() {
  const h2 = h2Of(); const mono = monoOf();
  return (
    <div>
      <h2 style={h2}>Das Dreieck</h2>
      <p style={{ fontSize: 14, color: T.leinwandTief, margin: "0 0 12px", lineHeight: 1.6 }}>
        Jeder Film wird auf drei Achsen bewertet (je 0–5). Die Form des Dreiecks
        IST das Urteil — ein Blick zeigt, ob ein Film Können, Gehalt oder Relevanz ist.
      </p>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 330px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {ECKEN.map((e) => (
            <div key={e.achse} style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", borderLeft: "3px solid " + e.farbe(T) }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "0.08em", color: e.farbe(T) }}>
                {e.achse}
              </div>
              <div style={{ ...mono, margin: "2px 0 8px", color: T.leinwandTief }}>{e.frage}</div>
              <p style={{ fontSize: 13, fontWeight: 400, color: T.leinwand, lineHeight: 1.6, margin: 0 }}>{e.text}</p>
            </div>
          ))}
        </div>
        {/* Rechts: interaktives Dreieck — Regler ziehen, Schlagseite in der Form sehen */}
        <div style={{ flex: "1 1 320px", minWidth: 280, alignSelf: "stretch", background: T.saalHoch, borderRadius: 6, padding: "18px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
          <DreieckRegler start={{ wie: 5, was: 2, warum: 4 }} scale={1.7} size={44} />
          <div style={{ ...mono, textAlign: "center", lineHeight: 1.6 }}>Zieh die Regler — die Schlagseite steckt in der Form.</div>
        </div>
      </div>
      <p style={{ ...mono, marginTop: 8 }}>
        Schlagseite = eine Achse liegt 2+ Punkte vor den anderen — die Karte sagt dir dann, WOFÜR du den Film schaust.
      </p>
    </div>
  );
}

/* ---- „Über"-Einstieg für die Einstellungen (PERSONAL_MODE): Hero + Dreieck +
   Anleitung, hinter demselben Knopf-Wortlaut wie auf der Landing. ---- */
export function UeberKinodreieck({ onTutorialNeu }) {
  const [dokuOffen, setDokuOffen] = useState(false);
  const h2 = h2Of(); const mono = monoOf();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 16 }}>
      <ErklaerHero />
      <DreieckErklaerung />
      <div>
        <button style={btnStyle(false)} onClick={() => setDokuOffen(!dokuOffen)}>
          {dokuOffen ? "Anleitung zuklappen" : "Anleitung & Hilfe öffnen"}
        </button>
        {dokuOffen && <DokuAnsicht h2={h2} mono={mono} onTutorialNeu={onTutorialNeu} />}
      </div>
    </div>
  );
}

/* ---------- Eingebaute Anleitung ---------- */
export function DokuAnsicht({ h2, mono, onTutorialNeu }) {
  const block = { background: T.saalHoch, borderRadius: 6, padding: "14px 16px" };
  const p = { fontSize: 13, color: T.leinwandTief, lineHeight: 1.65, margin: "0 0 8px" };
  const code = { fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.wolfram };
  const [popup, setPopup] = useState(null);
  const BEREICHE = [
    { id: "kino", titel: "Kino", text: [
      "Das Wiener Kinoprogramm der nächsten ~2 Wochen (film.at + Abo-Abgleich mit Nonstop). „Läuft & passt zu dir” zeigt Filme aus deiner Mediathek, die gerade laufen; „Läuft auch” den Rest des Programms.",
      "Vor jeder Uhrzeit steht ein ◇ — anklicken pinnt den Termin. Angepinntes sammelt sich oben, übersteht den täglichen Programm-Wechsel und erscheint auch im Dashboard. Ein Klick auf einen angepinnten Titel springt zum Film.",
      "Der einklappbare Filter grenzt nach Kino, Tag, Abo und Fassung ein. „Nur Abo” zeigt, was in deinen Abo-Kinos ohne Aufpreis läuft.",
    ] },
    { id: "mediathek", titel: "Mediathek", text: [
      "Dein Bestand: Filme, Serien, Musik und Sonstiges (inkl. Persönlichkeiten/Studios). Filme tragen die Dreieck-Bewertung (WIE/WAS/WARUM, je 0–5). Karte antippen öffnet Details und Bearbeiten.",
      "Der Filter grenzt nach Besitz (DVD/Prime/Apple/Wunschliste), Schlagseite (WIE/WAS/WARUM-lastig), Kategorie und Genre ein. „Unbewerteter Besitz” listet Titel aus DVD/Prime ohne Dreieck.",
      "Deine Masterliste importierst oder exportierst du im gleichnamigen Bereich der Einstellungen. Blog-Artikel besitzen ihre eigenen Werkzeuge direkt im Blog.",
    ] },
    { id: "streaming", titel: "Streaming", text: [
      "„Mein Programm” zeigt, welche deiner Filme gerade auf deinen Diensten laufen; „Entdecken” liefert Vorschläge aus den Watchmode-Katalogen, nach Relevanz sortiert. Einträge in Mein Programm sind editierbar.",
      "Der Schnellfilter grenzt temporär auf einen deiner Dienste ein — welche Dienste du hast, stellst du in den Einstellungen ein. Im Entdecken merkst du dir Titel mit ★ (erscheinen im Dashboard).",
      "Kein Live-API-Call in der App — es werden nur vorberechnete Kataloge gelesen. Credits kostet ausschließlich der geplante Fetch-Job.",
    ] },
    { id: "blog", titel: "Blog", text: [
      "Eigene Artikel schreiben und Filme oder Personen aus deiner Mediathek referenzieren. Referenzen werden per Titel gegen deinen Bestand abgeglichen — die ID ist der stabile Schlüssel, nicht der Titel.",
      "Nicht auflösbare Referenzen bleiben „Rotlinks” (rot); sie blockieren die Freigabe nie und heilen automatisch, sobald du den passenden Eintrag anlegst.",
      "Freigegebene Artikel tauchen als „Kommt vor in” bei den referenzierten Einträgen in der Mediathek auf.",
    ] },
    { id: "finder", titel: "Suche", text: [
      "Natürlichsprachige Suche über deinen Bestand: „traurige Komödie auf Netflix”, „Kult aus den 80ern”. Deterministisch — kein LLM, keine geratenen Treffer.",
      "Eigene Stimmungswörter hinterlegst du in den Einstellungen (Vokabular), damit die Suche deinen Wortschatz kennt.",
    ] },
    { id: "daten", titel: "Einstellungen", text: [
      "Darstellung (Saal/Foyer, Schriftgröße, Startbereich), Datenmodus, Masterliste, Gesamt-Backup, Such-Vokabular, Streaming-Quellen und Katalog-Status.",
      "Unter „Erweitert” kannst du den Datenbank-Katalog manuell neu laden, Notfall-Importe ausführen und den Programm-Cache leeren.",
      "Ein unbeschriftetes Detail liegt hinter dem „Max”-Link unter „Über & Rechtliches”.",
    ] },
  ];
  const offen = BEREICHE.find((b) => b.id === popup);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
      {onTutorialNeu && (
        <div style={block}>
          <h2 style={h2}>Tutorial</h2>
          <p style={{ ...p, margin: "0 0 10px" }}>Die Willkommens-Erklärung und die Just-in-Time-Hinweise noch einmal von vorn — im echten Betrieb, ohne Screenshots.</p>
          <button style={btnStyle(false)} onClick={onTutorialNeu}>Tutorial neu starten</button>
        </div>
      )}
      <div style={block}>
        <h2 style={h2}>Verzeichnis der Bereiche</h2>
        <p style={{ ...p, margin: "0 0 10px" }}>Klick auf einen Bereich für die ausführliche Beschreibung.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {BEREICHE.map((b) => (
            <button key={b.id} onClick={() => setPopup(b.id)}
              style={{ ...btnStyle(false), fontSize: 13, padding: "9px 10px" }}>{b.titel}</button>
          ))}
        </div>
      </div>
      {offen && (
        <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(23,21,26,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 8, maxWidth: 540, maxHeight: "82dvh", overflowY: "auto", overscrollBehavior: "contain", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <h2 style={{ ...h2, margin: 0 }}>{offen.titel}</h2>
              <button onClick={() => setPopup(null)} style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}>Schließen</button>
            </div>
            <div style={{ marginTop: 12 }}>
              {offen.text.map((txt, i) => <p key={i} style={{ ...p, fontWeight: 400, color: T.leinwand }}>{txt}</p>)}
            </div>
          </div>
        </div>
      )}
      <div style={block}>
        <h2 style={h2}>Alltag</h2>
        <p style={p}>Kinodreieck läuft als PWA im Browser und kann auf dem Startbildschirm
          installiert werden. Bewertungen, Artikel und Einstellungen liegen zunächst im
          Browser. Der gemeinsame Programm-Katalog enthält keine persönlichen Änderungen.</p>
        <p style={{ ...p, margin: 0 }}>Der Browser ist kein vollständiges Backup. Lade deshalb
          regelmäßig unter Einstellungen ein Gesamt-Backup herunter.
          Programm- und Katalog-Stand zeigen, wie frisch die separat gelieferten Daten sind.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Automatik</h2>
        <p style={p}>Die Datenerfassung läuft außerhalb der PWA im separaten Datenordner:
          <span style={code}> kino_auto.mjs</span> liest das Kinoprogramm über den inoffiziellen
          Seitenabruf von film.at und gleicht Abo-Daten ab;
          <span style={code}> streaming_auto.mjs</span> erstellt die Watchmode-Kataloge mit Quota-Schutz.</p>
        <p style={{ ...p, margin: 0 }}><span style={code}>liefere_an_supabase.mjs</span> übergibt danach nur
          geprüfte JSON-Daten an den zentralen Katalog. Kinodreieck selbst ruft weder die Kino-Seite noch
          die Streaming-API live auf.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Teilen & Sichern</h2>
        <p style={p}>Blog-Artikel importierst, exportierst oder veröffentlichst du direkt im Blog.
          Die Masterliste besitzt ihren eigenen Import und Export in den Einstellungen.</p>
        <p style={{ ...p, margin: 0 }}>Das Gesamt-Backup ist dagegen deine vollständige private
          Sicherung und nicht zum Weitergeben gedacht. Teile keine Sync-Zugangsdaten,
          Leseschlüssel oder persönlichen Backup-Dateien.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Wenn etwas klemmt</h2>
        <p style={{ ...p, margin: 0 }}>App neu laden und zuerst Programm- bzw. Katalog-Stand
          prüfen. Sind die gelieferten Daten leer oder veraltet, läuft die Diagnose im
          separaten Datenordner: dort <span style={code}>node kino_auto.mjs</span> oder
          <span style={code}> node streaming_auto.mjs</span> starten und das jeweilige
          <span style={code}> auto_log.txt</span> prüfen. Die PWA enthält keine API-Schlüssel.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Rechtliches</h2>
        <p style={{ ...p, margin: 0 }}>Privates, nicht-kommerzielles Projekt. Persönliche Daten
          liegen im Browser und können optional über den gewählten Geräte-Sync übertragen
          werden; Kinodreieck verwendet keine Telemetrie. Programmdaten: film.at & nonstopkino.at ·
          Streaming: Watchmode. Alle Angaben ohne Gewähr; verbindlich sind Kino- und
          Anbieterseiten. Marken gehören ihren Eigentümern. © {new Date().getFullYear()} Max —
          Nutzung auf eigene Verantwortung.</p>
      </div>
    </div>
  );
}
