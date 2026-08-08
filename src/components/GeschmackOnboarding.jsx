import { useMemo, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { DreieckRegler } from "./DreieckRegler.jsx";
import {
  gruppen, filmAuswahl, onboardingErgebnis,
} from "../lib/geschmack.js";

/* ---------- Geschmacks-Onboarding, deterministischer Weg (Etappe 7, 2c) ----------

   Vier Schritte: Einwilligung → Schlagwörter → Filme → Achsen, danach eine
   Vorschau, die bestätigt werden muss. Läuft VOLLSTÄNDIG ohne KI; das ist
   der Abnahme-Anker der Etappe („ein KI-loser Start ist vollwertig").

   WARUM DIE EINWILLIGUNG DER ERSTE SCHRITT IST UND NICHT DER LETZTE
   Der bequeme Bau wäre: erst alles einsammeln, am Ende fragen. Genau das
   verbietet die Zusage „ohne Zustimmung kein Profil" — sie gilt für die
   DATEN, nicht nur für den Prompt. In Phase 1 war das schon einmal falsch
   herum gebaut (Befund P2: das Opt-in-Gate saß nur am Ausgang, `sammle`
   legte ohne Einwilligung ein vollständiges Profil an, und weil der Topf in
   `ACCOUNT_SYNC_KEYS` steht, wären diese Signale auf den Server gewandert).
   Hier ist die Reihenfolge die Abwehr: Vor der Zustimmung gibt es nichts
   einzusammeln, weil die Schritte gar nicht erscheinen.

   WARUM DIE AUSWAHL ALS ABBILDUNG `id -> richtung` GEFÜHRT WIRD
   Damit ein Schlagwort nie gleichzeitig angezogen und abgestoßen sein kann.
   `profil.js` nimmt die Richtung in die Signal-Identität auf, widerspricht
   also nicht — die Exklusivität muss hier entstehen. Als Datenform statt
   als Prüfung, damit sie nicht vergessen werden kann.

   WAS DIESE KOMPONENTE NICHT TUT
   Sie schreibt nichts. Sie liefert das Ergebnis an `onFertig` und überlässt
   dem Aufrufer die Zwei-Bühnen-Mechanik aus `profil.js` (`sammle` →
   `uebernimm`, `vorschlagRahmen` → `uebernimmRahmen`). Ein Bau, der hier
   direkt speicherte, hätte die Bestätigungspflicht umgangen. */

const SCHRITTE = ["einwilligung", "schlagwoerter", "filme", "achsen", "vorschau"];

/* Drei Zustände je Eintrag, im Kreis: aus → zieht_an → stoesst_ab → aus.
   Bewusst EIN Knopf statt zweier Radiogruppen: Die Liste hat 21 Einträge,
   und 42 Radioknöpfe wären am Handy unbedienbar. Der Zustand steht im
   `aria-pressed` und zusätzlich im sichtbaren Text, damit er nicht allein
   an der Farbe hängt. */
const NAECHSTE_RICHTUNG = { undefined: "zieht_an", null: "zieht_an", zieht_an: "stoesst_ab", stoesst_ab: null };

function WahlChip({ beschriftung, richtung, onWechsel, titel }) {
  const an = richtung === "zieht_an";
  const ab = richtung === "stoesst_ab";
  const farbe = an ? T.ok : ab ? T.gefahr : null;
  return (
    <button
      onClick={onWechsel}
      title={titel}
      aria-pressed={an || ab}
      style={{
        fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "6px 11px",
        borderRadius: 999, border: "1px solid " + (farbe || T.rauch),
        background: farbe || "transparent", color: farbe ? T.tinte : T.rauch,
        cursor: "pointer", margin: "0 6px 6px 0",
      }}
    >
      {/* Der Zustand steht im TEXT, nicht nur in der Farbe. Ein rot/grün
          unterscheidungsschwacher Nutzer sähe sonst 21 gleich aussehende
          Chips und keine Möglichkeit, seine eigene Eingabe zu prüfen. */}
      {an ? "+ " : ab ? "− " : ""}{beschriftung}
    </button>
  );
}

export function GeschmackOnboarding({
  bekannteTitel = [],
  bestehendeAchsen = null,
  optInText = null,
  /* Hat der Nutzer bereits zugestimmt? Dann ist der Einwilligungsschritt
     keine Frage mehr, sondern eine Klickstrecke: „Weitere Angaben machen"
     legte einem zustimmenden Nutzer denselben Text samt Knopf
     „Einverstanden -- Profil anlegen" erneut vor. Kein Datenfehler, aber
     eine Zustimmung, die man immer wieder abnickt, ist keine mehr wert. */
  bereitsEinverstanden = false,
  onFertig,
  onAbbruch,
}) {
  const [schritt, setSchritt] = useState(bereitsEinverstanden ? 1 : 0);
  const [wahl, setWahl] = useState({});          // schlagwortId -> richtung|null
  const [filmwahl, setFilmwahl] = useState({});  // filmId -> richtung|null
  /* Achsen starten auf dem BESTEHENDEN Profilwert, nicht auf einer Mitte.
     Ein Onboarding, das eine vorhandene Angabe stillschweigend auf 3/3/3
     zurücksetzt, nimmt dem Nutzer eine Aussage weg, die er einmal gemacht
     hat — und die Bestätigung am Ende zeigte ihm den Verlust nicht als
     Verlust, sondern als normale Eingabe. */
  const [achsen, setAchsen] = useState(() => ({
    wie: Number.isInteger(bestehendeAchsen?.wie) ? bestehendeAchsen.wie : 3,
    was: Number.isInteger(bestehendeAchsen?.was) ? bestehendeAchsen.was : 3,
    warum: Number.isInteger(bestehendeAchsen?.warum) ? bestehendeAchsen.warum : 3,
  }));
  /* Eine MENGE der berührten Achsen, kein einzelner Merker. Mit einem Merker
     für alle drei galt: Wer nur WIE anfasst, bestätigt am Ende auch WAS 3
     und WARUM 3 — Werte, die er nie gewählt hat, sondern die nur die Stelle
     sind, an der ein Regler stehen musste. Der Modulkopf benennt genau das
     als Fehler; die Abwehr griff für den Durchlauf, nicht für die einzelne
     Achse. `pickRahmen` liest eine fehlende Achse ohnehin als „unbekannt,
     nicht ändern" — sie darf also einfach wegbleiben. */
  const [beruehrt, setBeruehrt] = useState(() => new Set());

  const angebot = useMemo(() => filmAuswahl(bekannteTitel), [bekannteTitel]);
  const gruppenListe = useMemo(() => gruppen(), []);

  const ergebnis = useMemo(() => onboardingErgebnis({
    schlagwoerter: wahl,
    filme: filmwahl,
    angebot,
    /* Nur die tatsächlich bewegten Achsen. Siehe `beruehrt` oben. */
    achsen: Object.fromEntries([...beruehrt].map((k) => [k, achsen[k]])),
  }), [wahl, filmwahl, angebot, achsen, beruehrt]);

  const gewaehlteChips = Object.values(wahl).filter(Boolean).length;
  const gewaehlteFilme = Object.values(filmwahl).filter(Boolean).length;
  const nichtsGewaehlt = ergebnis.signale.length === 0 && !ergebnis.rahmen;

  const name = SCHRITTE[schritt];
  const weiter = () => setSchritt((s) => Math.min(s + 1, SCHRITTE.length - 1));
  /* Untergrenze ist der Einstiegsschritt, nicht 0: Sonst führte „Zurück"
     einen bereits zustimmenden Nutzer doch wieder in die Einwilligungsfrage. */
  const ersterSchritt = bereitsEinverstanden ? 1 : 0;
  const zurueck = () => setSchritt((s) => Math.max(s - 1, ersterSchritt));

  const p = { color: T.leinwand, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" };
  const h = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.04em",
    fontSize: 20, color: T.leinwand, margin: "0 0 10px" };

  return (
    <div style={{ background: T.saalHoch, borderRadius: 8, padding: "18px 20px" }}
      role="group" aria-label={"Geschmacksprofil anlegen — Schritt " + (schritt + 1) + " von " + SCHRITTE.length}>

      {/* ---------- 1. Einwilligung ---------- */}
      {name === "einwilligung" && (
        <div>
          <h3 style={h}>Dein Geschmacksprofil</h3>
          <p style={p}>
            Kinodreieck kann sich merken, was dich an Filmen anzieht und was dich abstößt,
            und Vorschläge daran ausrichten. Dafür legt die App ein Profil an: eine Liste
            von Zügen wie „mag Science-Fiction" oder „meidet Horror", jeder mit der Angabe,
            woraus er stammt.
          </p>
          <p style={p}>
            Im Gastmodus bleibt das Profil auf diesem Gerät; mit einem Konto gehört es zu
            deinem Konto. Du kannst es jederzeit ansehen, einzelne Züge korrigieren oder
            löschen und die Einwilligung widerrufen — dann wird es gelöscht. Ohne deine
            Zustimmung entsteht kein Profil.
          </p>
          {optInText && <p style={{ ...p, color: T.rauch, fontSize: 13 }}>{optInText}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button style={btnStyle(true)} onClick={weiter}>Einverstanden — Profil anlegen</button>
            <button style={btnStyle(false)} onClick={() => onAbbruch?.()}>Jetzt nicht</button>
          </div>
        </div>
      )}

      {/* ---------- 2. Schlagwörter ---------- */}
      {name === "schlagwoerter" && (
        <div>
          <h3 style={h}>Was zieht dich an, was stößt dich ab?</h3>
          <p style={p}>
            Einmal antippen heißt <span style={{ color: T.ok }}>zieht mich an</span>,
            zweimal <span style={{ color: T.gefahr }}>stößt mich ab</span>, dreimal wieder aus.
            Lass ruhig vieles leer — nur was du wirklich meinst, hilft.
          </p>
          {gruppenListe.map((g) => (
            <div key={g.id} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch, marginBottom: 8 }}>
                {g.titel}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {g.eintraege.map((e) => (
                  <WahlChip key={e.id} beschriftung={e.anzeige} richtung={wahl[e.id]}
                    /* Die datierte Trefferzahl als Tooltip: Sie belegt die
                       Kuration, ist aber kein Live-Zähler des täglich
                       wechselnden Kino-/Streamingbestands. */
                    titel={e.treffer ? "traf bei der letzten Belegmessung " + (e.treffer.gesamt || 0) + " Filme" : undefined}
                    onWechsel={() => setWahl((v) => ({ ...v, [e.id]: NAECHSTE_RICHTUNG[String(v[e.id])] }))} />
                ))}
              </div>
            </div>
          ))}
          <Fussleiste zurueck={zurueck} weiter={weiter}
            stand={gewaehlteChips === 0 ? "noch nichts gewählt" : gewaehlteChips + " gewählt"} />
        </div>
      )}

      {/* ---------- 3. Filme ---------- */}
      {name === "filme" && (
        <div>
          <h3 style={h}>Welche Filme treffen dich?</h3>
          <p style={p}>
            Dieselbe Bedienung. <span style={{ color: T.gefahr }}>Abgelehnte</span> Filme sagen
            oft mehr als gemochte — trau dich.
          </p>
          {angebot.length === 0 ? (
            <p style={{ ...p, color: T.rauch }}>
              Für diesen Schritt fehlen noch bewertete Filme im Bestand. Du kannst ihn
              überspringen; das Profil funktioniert auch ohne.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {angebot.map((f) => (
                <WahlChip key={f.id} beschriftung={f.titel + (f.jahr ? " (" + f.jahr + ")" : "")}
                  richtung={filmwahl[f.id]}
                  onWechsel={() => setFilmwahl((v) => ({ ...v, [f.id]: NAECHSTE_RICHTUNG[String(v[f.id])] }))} />
              ))}
            </div>
          )}
          <Fussleiste zurueck={zurueck} weiter={weiter}
            stand={gewaehlteFilme === 0 ? "noch nichts gewählt" : gewaehlteFilme + " gewählt"} />
        </div>
      )}

      {/* ---------- 4. Achsen ---------- */}
      {name === "achsen" && (
        <div>
          <h3 style={h}>Worauf achtest du?</h3>
          <p style={p}>
            WIE ein Film gemacht ist, WAS er erzählt, WARUM er dich angeht. Zieh die Regler
            dorthin, wo du dich wiederfindest. Rührst du sie nicht an, bleibt die Frage offen —
            das ist eine gültige Antwort.
          </p>
          {/* Derselbe Regler wie in der Willkommens-Box — dort erklärt er das
              Dreieck, hier erhebt er. Genau die „echte Funktion für das
              bewegliche Element", die der Steckbrief vorsieht. */}
          <DreieckRegler wert={achsen} onChange={(w) => {
            /* Welche Achse hat sich bewegt? Der Regler meldet den ganzen
               Satz, also wird verglichen. Ein Regler, den der Nutzer auf
               seinen alten Wert zurückzieht, gilt dabei weiterhin als
               berührt — er hat sich mit dem Wert befasst und ihn bestätigt. */
            setBeruehrt((b) => {
              const neu = new Set(b);
              for (const k of ["wie", "was", "warum"]) if (w[k] !== achsen[k]) neu.add(k);
              return neu;
            });
            setAchsen(w);
          }} />
          {beruehrt.size < 3 && (
            <p style={{ ...p, color: T.rauch, fontSize: 13, marginTop: 12 }}>
              {beruehrt.size === 0
                ? "Noch unberührt — so wandert keine Achsen-Angabe ins Profil."
                : "Nur bewegte Regler wandern ins Profil: " + [...beruehrt].map((k) => k.toUpperCase()).join(", ") + "."}
            </p>
          )}
          <Fussleiste zurueck={zurueck} weiter={weiter} weiterText="Zur Übersicht"
            stand={beruehrt.size === 0 ? "bleibt offen" : beruehrt.size + " von 3 wird übernommen"} />
        </div>
      )}

      {/* ---------- 5. Vorschau ---------- */}
      {name === "vorschau" && (
        <div>
          <h3 style={h}>Das käme ins Profil</h3>
          {nichtsGewaehlt ? (
            <p style={p}>
              Du hast nichts ausgewählt — es gibt nichts zu übernehmen. Geh zurück und
              wähle etwas, oder brich ab; beides ist in Ordnung.
            </p>
          ) : (
            <>
              {ergebnis.signale.length > 0 && (
                <ul style={{ ...p, paddingLeft: 20 }}>
                  {ergebnis.signale.map((s) => (
                    <li key={s.beleg} style={{ marginBottom: 4 }}>
                      <span style={{ color: s.richtung === "zieht_an" ? T.ok : T.gefahr }}>
                        {s.richtung === "zieht_an" ? "mag" : "meidet"}
                      </span>{" "}{s.wert} <span style={{ color: T.rauch, fontSize: 12 }}>({s.art})</span>
                    </li>
                  ))}
                </ul>
              )}
              {ergebnis.rahmen?.filme?.length > 0 && (
                <p style={p}>
                  <span style={{ color: T.rauch }}>Filme:</span>{" "}
                  {ergebnis.rahmen.filme.map((f) =>
                    (f.richtung === "stoesst_ab" ? "− " : "+ ") + f.titel).join(", ")}
                </p>
              )}
              {ergebnis.rahmen?.achsen && (
                <p style={p}>
                  <span style={{ color: T.rauch }}>Achsen:</span>{" "}
                  {Object.entries(ergebnis.rahmen.achsen).map(([k, v]) => k.toUpperCase() + " " + v).join(", ")}
                </p>
              )}
              {/* Übergangene Einträge werden GENANNT, nicht geschluckt. Ein
                  Schlagwort aus einem alten Build verschwände sonst
                  wortlos — und der Nutzer glaubte, es sei übernommen. */}
              {ergebnis.uebergangen.length > 0 && (
                <p style={{ ...p, color: T.gefahr, fontSize: 13 }}>
                  Nicht übernommen: {ergebnis.uebergangen.map((u) => u.id + " (" + u.grund + ")").join(", ")}
                </p>
              )}
            </>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
            <button style={btnStyle(false)} onClick={zurueck}>Zurück</button>
            <button style={btnStyle(true)} disabled={nichtsGewaehlt}
              title={nichtsGewaehlt ? "Es ist nichts ausgewählt" : undefined}
              onClick={() => onFertig?.(ergebnis)}>Ins Profil übernehmen</button>
            <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => onAbbruch?.()}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Fussleiste({ zurueck, weiter, weiterText = "Weiter", stand }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
      <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={zurueck}>Zurück</button>
      <button style={btnStyle(true)} onClick={weiter}>{weiterText}</button>
      {/* aria-live, weil der Stand die einzige Rückmeldung auf das Antippen
          ist — ohne Ansage bekommt ein Screenreader-Nutzer nie mit, dass
          seine Auswahl angekommen ist. */}
      <span aria-live="polite" style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch }}>
        {stand}
      </span>
    </div>
  );
}
