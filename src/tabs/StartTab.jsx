import { useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { store, K } from "../lib/storage.js";
import { IconDelete, Logo } from "../components/ui.jsx";
import { DreieckRegler } from "../components/DreieckRegler.jsx";

/* ================= START (Dashboard, Phase E) =================
   Hero + Dreieck-Erklärung (eine Karte pro Ecke), Pinboard (angepinnte
   Kinotermine + Entdecken-Merkliste), eingebaute Anleitung (visuell,
   inkl. Rechtliches) und Quicklinks in alle Bereiche. Reine Anzeige-
   Schicht — alle Daten kommen aus App-State bzw. Storage. */

const ECKEN = [
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
    achse: "WARUM", frage: "Warum gerade für dich?",
    farbe: (t) => t.warum,
    text: "Der persönliche Zünder: das, was kein Kritiker messen kann. Nostalgie, Nerv, Timing, Herz. Das WARUM erklärt, weshalb ein objektiv mittelmäßiger Film trotzdem ein Lieblingsfilm sein darf.",
  },
];

export function StartTab({ kinoPins = [], toggleKinoPin, merkliste = [], toggleMerk, onNavigiere, onTutorialNeu }) {
  const [dokuOffen, setDokuOffen] = useState(false);
  /* Merkliste kommt jetzt als Prop (in App-State geliftet) — live synchron mit dem Streaming-Tab. */
  const pinSort = (p) => {
    const d = /(\d{1,2})\.(\d{1,2})\./.exec(String(p.z));
    const u = /(\d{1,2}):(\d{2})/.exec(String(p.z));
    return (d ? Number(d[2]) * 1000000 + Number(d[1]) * 10000 : 99999999) + (u ? Number(u[1]) * 100 + Number(u[2]) : 0);
  };
  const pins = [...kinoPins].sort((a, b) => pinSort(a) - pinSort(b));

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ---- Hero ---- */}
      <div style={{ textAlign: "center", padding: "34px 16px 10px", position: "relative" }}>
        <div style={{ display: "inline-block", margin: "8px 0 30px", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.45))" }}>
          <Logo size={132} />
        </div>
        <div style={{ ...mono, letterSpacing: "0.3em", color: T.rauch, marginBottom: 8 }}>LOKALE FILM-PLATTFORM</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 54, letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1 }}>
          Kinodreieck
        </div>
        <div style={{ width: 120, height: 2, margin: "16px auto 0", background: "linear-gradient(90deg, transparent, " + T.wolfram + ", transparent)" }} />
        <p style={{ fontSize: 15, color: T.leinwandTief, maxWidth: 520, margin: "18px auto 0", lineHeight: 1.65 }}>
          Deine Filme, dein Kino, dein Urteil — eine lokale Plattform für Programm,
          Mediathek, Streaming und Blog. Keine Cloud, keine Konten, kein Algorithmus,
          der dir etwas verkaufen will.
        </p>
      </div>

      {/* ---- Das Dreieck: eine Karte pro Ecke ---- */}
      <div>
        <h2 style={h2}>Das Dreieck</h2>
        <p style={{ fontSize: 14, color: T.leinwandTief, margin: "0 0 12px", lineHeight: 1.6 }}>
          Jeder Film wird auf drei Achsen bewertet (je 0–5). Die Form des Dreiecks
          IST das Urteil — ein Blick zeigt, ob ein Film Können, Gehalt oder Herz ist.
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

      {/* ---- Pinboard ---- */}
      <div data-tour="pinboard">
        <h2 style={h2}>Pinboard</h2>
        {pins.length === 0 && merkliste.length === 0 && (
          <p style={{ fontSize: 13, color: T.rauch, margin: 0, lineHeight: 1.6 }}>
            Noch leer. Termine pinnst du im Kino-Tab (◇ vor der Uhrzeit),
            Filme und Serien merkst du dir im Entdecken-Bereich (★).
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {pins.length > 0 && (
            <div style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px", borderLeft: "3px solid " + T.wolfram }}>
              <div style={{ ...mono, textTransform: "uppercase", letterSpacing: "0.06em", color: T.wolfram, marginBottom: 6 }}>Kinotermine ({pins.length})</div>
              {pins.map((p) => (
                <div key={p.t + "|" + p.z} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, padding: "3px 0" }}>
                  <span onClick={() => onNavigiere && onNavigiere("kino")} title="Zum Kino-Programm"
                    style={{ color: T.leinwand, fontWeight: 700, cursor: "pointer" }}>{p.t}</span>
                  <span style={{ flex: 1 }}>{p.z}</span>
                  {toggleKinoPin && (
                    <button onClick={() => toggleKinoPin(p.t, p.j, p.z)} title="Pin lösen" className="kd-del"
                      style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13 }}><IconDelete size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
          {merkliste.length > 0 && (
            <div style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px", borderLeft: "3px solid " + T.rauch }}>
              <div style={{ ...mono, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Gemerkt im Entdecken ({merkliste.length})</div>
              {merkliste.map((m) => (
                <div key={m.watchmode_id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, padding: "3px 0" }}>
                  <span onClick={() => onNavigiere && onNavigiere("streaming")} title="Zum Entdecken-Bereich"
                    style={{ color: T.leinwand, flex: 1, cursor: "pointer" }}>★ {m.titel}{m.jahr ? " (" + m.jahr + ")" : ""}</span>
                  <button onClick={() => toggleMerk(m)} title="Von der Merkliste nehmen" className="kd-del"
                    style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13 }}><IconDelete size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Quicklinks ---- */}
      <div>
        <h2 style={h2}>Direkt hinein</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            ["kino", "Kino", "Wiener Programm mit Abo-Wahrheit, Pins und deinen Treffern"],
            ["mediathek", "Mediathek", "Bestand, Bewertungen, Nachtrag — und Daten & Teilen"],
            ["streaming", "Streaming", "Was läuft auf deinen Diensten? Plus Entdecken"],
            ["blog", "Blog", "Artikel schreiben, Filme verlinken, freigeben"],
            ["finder", "Suche", "»Traurige Komödie auf Netflix« — frag einfach"],
            ["daten", "Einstellungen", "Darstellung, Import/Export, Backup, Vokabular"],
          ].map(([id, label, be]) => (
            <button key={id} onClick={() => onNavigiere && onNavigiere(id)}
              style={{ background: T.saalHoch, border: "1px solid transparent", borderRadius: 6, padding: "12px 14px", cursor: "pointer", textAlign: "left", color: T.leinwand }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.wolfram }}>{label}</div>
              <div style={{ fontSize: 12, color: T.rauch, marginTop: 3, lineHeight: 1.5 }}>{be}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ---- Doku ---- */}
      <div>
        <button style={btnStyle(false)} onClick={() => setDokuOffen(!dokuOffen)}>
          {dokuOffen ? "Anleitung zuklappen" : "Anleitung & Hilfe öffnen"}
        </button>
        {dokuOffen && <DokuAnsicht h2={h2} mono={mono} onTutorialNeu={onTutorialNeu} />}
      </div>
    </section>
  );
}

/* ---------- Eingebaute Anleitung — deckungsgleich mit ANLEITUNG.md ---------- */
function DokuAnsicht({ h2, mono, onTutorialNeu }) {
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
      "Ganz unten liegt „Daten & Teilen”: Export/Import deiner Liste und der Paket-Austausch mit anderen.",
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
      "Darstellung (Saal/Foyer, Schriftgröße, Startbereich), Import/Export/Backup deiner Daten, das Such-Vokabular und die Streaming-Quellen (Katalog-Status, Config-Export, Refresh).",
      "Der Export-Wächter warnt, sobald ungesicherte Änderungen im Browser liegen — der Browser ist kein Backup. „Browser-Stand verwerfen” lädt die Projektdatei neu, falls die App alte Daten zeigt.",
      "Die Modi Kurosawa & Grindhouse liegen als Easter-Egg hinter dem „Max”-Link unter „Über & Rechtliches”.",
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
        <p style={p}>Doppelklick auf <span style={code}>Kinodreieck.html</span> — mehr braucht es nicht.
          Bewertungen und Artikel merkt sich der Browser. Der ist <strong>kein Backup</strong>:
          Sobald der Wächter in den Einstellungen ungesicherte Änderungen meldet, exportieren —
          die Filmliste ersetzt <span style={code}>System/src/data/masterliste.json</span>,
          Artikel legst du als <span style={code}>artikel.json</span> neben die App.</p>
        <p style={{ ...p, margin: 0 }}>Zeigt die App plötzlich alte Daten: Einstellungen → „Browser-Stand verwerfen".</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Automatik</h2>
        <p style={p}><strong>Kino</strong> täglich 12:45 (frisches Programm, Abo-Abgleich, Tages-Backup nach
          <span style={code}> Archiv/</span>) · <strong>Streaming</strong> Mo/Mi/Fr + 1. des Monats, 13:00
          (Watchmode-Kataloge, Quota-Guard schützt das Budget).</p>
        <p style={{ ...p, margin: 0 }}>Eingerichtet über <span style={code}>Installation-Mac.command</span> (Mac) bzw.
          <span style={code}> Installation-Windows.bat</span>. Reparieren: einfach erneut ausführen.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Teilen & Ordner weitergeben</h2>
        <p style={p}>Pakete (Bewertungen, Blog) exportierst und importierst du in der Mediathek
          unter „Daten & Teilen" oder in den Einstellungen — Fremdes behält seinen Autor,
          Eigenes wird nie überschrieben.</p>
        <p style={{ ...p, margin: 0 }}>Vor der Weitergabe des Ordners IMMER entfernen:
          <span style={code}> System/.env</span> (API-Key!), <span style={code}>System/streaming-daten/</span>,
          <span style={code}> System/kino-daten/</span>, <span style={code}>Archiv/</span>.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Wenn etwas klemmt</h2>
        <p style={{ ...p, margin: 0 }}>App geht nicht auf → Installer erneut ausführen (baut neu).
          Automatik prüfen: <span style={code}>launchctl list | grep kinodreieck</span> (Mac) bzw.
          Aufgabenplanung „Kinodreieck" (Windows). Streaming-Tab leer → Key fehlt
          (<span style={code}>System/.env</span>) oder noch kein Lauf.</p>
      </div>
      <div style={block}>
        <h2 style={h2}>Rechtliches</h2>
        <p style={{ ...p, margin: 0 }}>Privates, nicht-kommerzielles Projekt — läuft vollständig lokal.
          Programmdaten: film.at & nonstopkino.at · Streaming: Watchmode. Alle Angaben ohne
          Gewähr; verbindlich sind Kino- und Anbieterseiten. Marken gehören ihren Eigentümern.
          © {new Date().getFullYear()} Max — Nutzung auf eigene Verantwortung.</p>
      </div>
      <p style={mono}>Die vollständige Anleitung liegt als ANLEITUNG.md im Ordner Programmdateien.</p>
    </div>
  );
}
