import { useMemo, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { FRAGEN, ANTWORT_MAX_ZEICHEN, antwortenBrauchbar, frageZu } from "../lib/extraktion.js";

/* ---------- Der KI-Weg: drei offene Fragen (Etappe 7, Phase 3) ----------

   Drei feste Fragen, keine adaptiven Folgefragen — bindende Entscheidung aus
   dem Steckbrief. Danach eine Vorschau, in der JEDER Vorschlag einzeln
   abgewählt werden kann.

   WARUM DIE VORSCHAU HIER ETWAS ANDERES IST ALS BEIM SCHLAGWORT-WEG
   Dort ist die Vorschau die letzte Seite eines Formulars: Der Nutzer sieht,
   was er selbst angekreuzt hat, und ein pauschales „übernehmen" ist ehrlich.
   Hier hat er die Vorschläge NICHT gemacht — ein Modell hat sie aus seinen
   Worten gelesen. Ein pauschales Ja wäre dann kein Bestätigen, sondern ein
   Durchwinken. Deshalb ist jeder Zug einzeln abwählbar, und jeder zeigt
   seinen BELEG: die Stelle im eigenen Text, aus der er stammen soll. Erst
   der Beleg macht die Bestätigung überprüfbar — ohne ihn müsste der Nutzer
   dem Modell glauben.

   WARUM DER BELEG AUCH DANN ANGEZEIGT WIRD, WENN ER SPERRIG IST
   Er ist die einzige Handhabe gegen einen freundlich klingenden, aber
   falschen Vorschlag. Ein Zug mit einem Beleg, der nicht trägt, fällt beim
   Lesen sofort auf; ohne Beleg sieht derselbe Zug plausibel aus.

   WAS DIESE KOMPONENTE NICHT TUT
   Sie ruft die KI nicht selbst auf und schreibt nichts. Sie sammelt die
   Antworten, meldet sie über `onExtrahieren` nach oben und zeigt an, was
   zurückkommt. Der Aufruf gehört in die Schicht, die auch den Schalter, die
   Fehlerbehandlung und die Kosten kennt. */

export function DreiFragen({
  antworten: startAntworten = null,
  laeuft = false,
  fehler = null,
  ergebnis = null,
  onExtrahieren,
  onUebernehmen,
  onAbbruch,
}) {
  const [antworten, setAntworten] = useState(() => ({ ...(startAntworten || {}) }));
  /* Abgewählte Vorschläge, als Menge von Belegen. Der Beleg ist der
     natürliche Schlüssel: Er ist für jedes Signal verschieden (er zeigt auf
     eine andere Textstelle), und `profil.js` führt ihn ohnehin mit. Ein
     Index wäre brüchig, sobald sich die Liste ändert. */
  const [abgewaehlt, setAbgewaehlt] = useState(() => new Set());
  const [filmeAus, setFilmeAus] = useState(() => new Set());
  const [achsenAus, setAchsenAus] = useState(false);

  const brauchbar = antwortenBrauchbar(antworten);

  const auswahl = useMemo(() => {
    if (!ergebnis) return null;
    const signale = ergebnis.signale.filter((s) => !abgewaehlt.has(s.beleg));
    const rahmen = {};
    const filme = (ergebnis.rahmen?.filme || []).filter((f) => !filmeAus.has(f.titel));
    if (filme.length) rahmen.filme = filme;
    if (ergebnis.rahmen?.achsen && !achsenAus) rahmen.achsen = ergebnis.rahmen.achsen;
    /* `nichtDeutbar` ist nicht abwählbar und soll es nicht sein: Es ist die
       ehrliche Liste dessen, was NICHT gedeutet werden konnte. Sie
       wegklicken zu können hieße, die eigene Lücke verstecken zu dürfen. */
    if (ergebnis.rahmen?.nichtDeutbar?.length) rahmen.nichtDeutbar = ergebnis.rahmen.nichtDeutbar;
    return { signale, rahmen: Object.keys(rahmen).length ? rahmen : null };
  }, [ergebnis, abgewaehlt, filmeAus, achsenAus]);

  const nichtsUebrig = auswahl && auswahl.signale.length === 0 && !auswahl.rahmen;

  const p = { color: T.leinwand, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" };
  const klein = { ...p, color: T.rauch, fontSize: 13 };
  const h = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.04em",
    fontSize: 20, color: T.leinwand, margin: "0 0 10px" };

  /* ---------- Vorschau ---------- */
  if (ergebnis) {
    return (
      <div style={{ background: T.saalHoch, borderRadius: 8, padding: "18px 20px" }}>
        <h3 style={h}>Das habe ich aus deinen Antworten gelesen</h3>
        <p style={klein}>
          Nichts davon ist schon gespeichert. Nimm weg, was nicht stimmt — und schau
          dir die Belege an: Das ist die Stelle in deinem Text, aus der der Zug stammen soll.
        </p>

        {ergebnis.signale.length === 0 && (
          <p style={p}>
            Aus deinen Antworten ließ sich nichts Belegbares lesen. Das liegt eher an der
            Frageform als an dir — du kannst es mit ausführlicheren Antworten erneut
            versuchen oder den Schlagwort-Weg nehmen.
          </p>
        )}

        {ergebnis.signale.map((s) => {
          const weg = abgewaehlt.has(s.beleg);
          const frage = frageZu(s.quelle);
          return (
            <div key={s.beleg} style={{ padding: "10px 0", borderBottom: "1px solid " + T.saal, opacity: weg ? 0.45 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: s.richtung === "zieht_an" ? T.ok : s.richtung === "stoesst_ab" ? T.gefahr : T.rauch,
                  fontFamily: "'Space Mono', monospace", fontSize: 13 }}>
                  {s.richtung === "zieht_an" ? "mag" : s.richtung === "stoesst_ab" ? "meidet" : "zwiespältig zu"}
                </span>
                <span style={{ color: T.leinwand, fontSize: 14, flex: "1 1 120px" }}>
                  {s.wert} <span style={{ color: T.rauch, fontSize: 12 }}>({s.art}, Stärke {s.staerke}/5)</span>
                </span>
                {/* Die Sicherheit steht sichtbar dabei — sie ist die
                    Selbsteinschätzung des Modells, und „niedrig" ist genau
                    das, was der Nutzer zuerst prüfen sollte. */}
                <span style={{ color: s.sicherheit === "niedrig" ? T.wolfram : T.rauch, fontSize: 12 }}>
                  Sicherheit {s.sicherheit}
                </span>
                <button style={{ ...btnStyle(false), fontSize: 12, padding: "3px 9px" }}
                  aria-pressed={weg}
                  onClick={() => setAbgewaehlt((v) => {
                    const n = new Set(v);
                    if (n.has(s.beleg)) n.delete(s.beleg); else n.add(s.beleg);
                    return n;
                  })}>
                  {weg ? "doch übernehmen" : "weglassen"}
                </button>
              </div>
              <div style={{ color: T.rauch, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                {frage ? frage.kurz + ": " : ""}„{s.beleg}"
              </div>
            </div>
          );
        })}

        {ergebnis.rahmen?.achsen && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
            <span style={{ ...klein, margin: 0, opacity: achsenAus ? 0.45 : 1 }}>
              Achsen-Tendenz: {Object.entries(ergebnis.rahmen.achsen).map(([k, v]) => k.toUpperCase() + " " + v).join(", ")}
            </span>
            <button style={{ ...btnStyle(false), fontSize: 12, padding: "3px 9px" }} aria-pressed={achsenAus}
              onClick={() => setAchsenAus((v) => !v)}>{achsenAus ? "doch übernehmen" : "weglassen"}</button>
          </div>
        )}

        {ergebnis.rahmen?.filme?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <span style={klein}>Genannte Filme:</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {ergebnis.rahmen.filme.map((f) => {
                const weg = filmeAus.has(f.titel);
                return (
                  <button key={f.titel} aria-pressed={!weg}
                    style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px", opacity: weg ? 0.45 : 1 }}
                    onClick={() => setFilmeAus((v) => {
                      const n = new Set(v);
                      if (n.has(f.titel)) n.delete(f.titel); else n.add(f.titel);
                      return n;
                    })}>
                    {f.titel}{f.jahr ? " (" + f.jahr + ")" : ""}{weg ? " ✕" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Ehrlichkeit über die eigenen Lücken. Beide Zahlen bedeuten
            Verschiedenes und stehen deshalb getrennt da. */}
        {ergebnis.rahmen?.nichtDeutbar?.length > 0 && (
          <p style={{ ...klein, marginTop: 12 }}>
            Nicht gedeutet: {ergebnis.rahmen.nichtDeutbar.join(" · ")}
          </p>
        )}
        {ergebnis.ohneBeleg > 0 && (
          <p style={{ ...klein, color: T.wolfram }}>
            {ergebnis.ohneBeleg} weitere {ergebnis.ohneBeleg === 1 ? "Angabe wurde" : "Angaben wurden"} verworfen,
            weil sich die genannte Textstelle nicht in deiner Antwort fand.
          </p>
        )}
        {ergebnis.verworfen.length > 0 && (
          <p style={{ ...klein, color: T.gefahr }}>
            {ergebnis.verworfen.length} {ergebnis.verworfen.length === 1 ? "Angabe passte" : "Angaben passten"} nicht
            ins Datenmodell und {ergebnis.verworfen.length === 1 ? "wurde" : "wurden"} verworfen.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <button style={btnStyle(true)} disabled={nichtsUebrig}
            title={nichtsUebrig ? "Es ist nichts mehr ausgewählt" : undefined}
            onClick={() => onUebernehmen?.(auswahl)}>Ausgewähltes übernehmen</button>
          <button style={btnStyle(false)} onClick={() => onAbbruch?.()}>Verwerfen</button>
        </div>
      </div>
    );
  }

  /* ---------- Die Fragen ---------- */
  return (
    <div style={{ background: T.saalHoch, borderRadius: 8, padding: "18px 20px" }}>
      <h3 style={h}>Drei Fragen</h3>
      <p style={p}>
        Antworte so, wie du es einem Menschen erzählen würdest — Halbsätze sind in Ordnung.
        Du musst nicht alle drei beantworten. Was du schreibst, geht einmal an das Modell und
        wird nicht gespeichert; gespeichert wird nur, was du danach ausdrücklich übernimmst.
      </p>

      {FRAGEN.map((f) => {
        const wert = antworten[f.id] || "";
        const zuLang = wert.length > ANTWORT_MAX_ZEICHEN;
        return (
          <div key={f.id} style={{ marginBottom: 18 }}>
            <label htmlFor={"frage-" + f.id} style={{ display: "block", color: T.leinwand, fontSize: 14, marginBottom: 4 }}>
              {f.frage}
            </label>
            <p style={{ ...klein, margin: "0 0 6px" }}>{f.hilfe}</p>
            <textarea id={"frage-" + f.id} value={wert} rows={4} disabled={laeuft}
              aria-label={f.frage}
              onChange={(e) => setAntworten((v) => ({ ...v, [f.id]: e.target.value }))}
              style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            {/* Der Zähler erscheint erst, wenn er gebraucht wird. Über der
                Grenze KÜRZT der Server, und die Belegprüfung liefe danach
                gegen einen anderen Text — die Signale aus dem
                abgeschnittenen Teil fielen durch, ohne dass jemand sagen
                könnte warum. */}
            {wert.length > ANTWORT_MAX_ZEICHEN * 0.8 && (
              <p style={{ ...klein, margin: "4px 0 0", color: zuLang ? T.gefahr : T.rauch }}>
                {wert.length} von {ANTWORT_MAX_ZEICHEN} Zeichen
                {zuLang ? " — alles darüber wird abgeschnitten und nicht ausgewertet." : ""}
              </p>
            )}
          </div>
        );
      })}

      {fehler && <p style={{ ...klein, color: T.gefahr }}>{fehler}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btnStyle(true)} disabled={!brauchbar || laeuft}
          title={!brauchbar ? "Beantworte mindestens eine Frage" : undefined}
          onClick={() => onExtrahieren?.(antworten)}>
          {laeuft ? "Wird gelesen …" : "Antworten auswerten"}
        </button>
        <button style={btnStyle(false)} disabled={laeuft} onClick={() => onAbbruch?.()}>Abbrechen</button>
        <span aria-live="polite" style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch }}>
          {laeuft ? "läuft" : brauchbar ? "bereit" : "noch keine Antwort"}
        </span>
      </div>
    </div>
  );
}
