import { useState, useEffect, useRef } from "react"; // KD-028
import { createPortal } from "react-dom";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { DreieckRegler } from "./DreieckRegler.jsx";
import { setzeGlobal } from "../lib/kiSchalter.js";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { errorText } from "../services/errors.js";

/* ---------- Willkommen (Tutorial Teil A) ----------
   Einmalig nach abgeschlossener Einrichtung, mittig, kein Spotlight.

   Drei Schritte:
     1. Was die App tut
     2. Das Dreieck — das Modell, auf dem alles steht. Interaktiv: drei Regler
        verziehen live das Dreieck, darunter folgt die Kategorie.
     3. Die KI-Frage (Etappe 7). Sie steht bewusst HINTER der Dreieck-Karte:
        erst dort weiß der Nutzer, wofür KI in dieser App überhaupt gut wäre.
        Wer „mit KI" wählt, bekommt das Anmelde-Angebot gleich hier — mit
        sichtbarem „Später", das in den deterministischen Weg führt.

   Die Schrittfolge ist eine LISTE, kein verschachtelter Ternär. Vorher stand
   hier `karte === 1 ? … : …`; ein dritter Schritt hätte daraus eine
   unlesbare Verschachtelung gemacht, und jeder weitere wäre schlimmer. */

/* Startwerte des Erklär-Reglers auf Karte 2. Eine Quelle — der Default in
   DreieckRegler ist bewusst derselbe Wert, driftet aber sonst auseinander. */
const REGLER_START = { wie: 4, was: 2, warum: 5 };

/* Fangbare Elemente der Fokus-Falle. `select`/`textarea`/`area[href]` waren
   nicht gelistet; auf Karte 1–2 gibt es sie heute nicht, ein weiterer
   Onboarding-Schritt mit Auswahlfeld ließe die Falle aber still auseinander-
   fallen. */
const FOKUS_SELEKTOR = "button, [href], input, select, textarea, area[href], [tabindex]";

export const SCHRITTE = ["was", "dreieck", "ki"];

export function Willkommen({
  onClose,
  onAnmelden = (benutzer, passwort) => sessionCoordinator.signIn(benutzer, passwort),
  jetzt = null,
}) {
  const [karte, setKarte] = useState(1);          // 1-basiert, wie gehabt
  const [kiWahl, setKiWahl] = useState(null);     // null = noch nicht gewählt
  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [anmeldeFehler, setAnmeldeFehler] = useState(null);
  const [anmeldeLaeuft, setAnmeldeLaeuft] = useState(false);
  /* Die Zusage der Box muss GENAU das spiegeln, was der KI-Pfad spaeter
     verlangt: `aiService` ruft `requireAccount("personalAi")`, und diese
     Wache prueft drei Dinge — Modus, Zustand und Faehigkeit
     (`services/auth.js`, `requireAccount`). Jede Bedingung, die hier fehlt,
     erzeugt dieselbe Sorte Luege: Die Box sagt „steht dir zur Verfuegung",
     der erste Klick laeuft in genau den Fehler, den sie ausgeschlossen
     hatte. Deshalb wird die Wache nachgebaut und nicht abgekuerzt — `state`
     gehoert dazu, denn `accountSession` kennt „degraded", und ein
     degradiertes Konto faellt bei `requireAccount` durch. */
  const kiFaehig = (s) => !!s && s.mode === "account" && s.state === "ready"
    && s.capabilities?.personalAi === true;
  /* Der ganze Snapshot, nicht nur ein Ja/Nein: Erst damit ist der dritte
     Fall unterscheidbar — angemeldet, aber ohne KI-Freischaltung. Als
     Boolean sah der aus wie „nicht angemeldet", und die Box stellte dem
     Nutzer wortlos wieder das Formular hin, das er gerade erfolgreich
     ausgefuellt hatte. Ein Snapshot beantwortet beide Fragen aus einer
     Quelle — auf dem Init-Weg wie nach `signIn`. */
  const [sitzung, setSitzung] = useState(() => sessionCoordinator.getSnapshot());
  const angemeldet = kiFaehig(sitzung);
  /* Angemeldet, aber der KI-Pfad bleibt zu. Weder Nutzerfehler noch
     gescheiterte Anmeldung — deshalb ein Hinweis, keine Fehlerzeile. */
  const kontoOhneKi = !!sitzung && sitzung.mode === "account" && !angemeldet;
  const dialogRef = useRef(null); // KD-028
  // KD-028: Fokus-Falle + Escape + Fokus-Rückgabe (Muster aus TourOverlay).
  // Läuft einmal: Handler und Rückgabe hängen nicht an der Karte.
  useEffect(() => {
    const el = dialogRef.current; if (!el) return;
    const vorherFokus = document.activeElement;
    const focusables = () => [...el.querySelectorAll(FOKUS_SELEKTOR)].filter((n) => !n.disabled);
    const onKey = (e) => {
      // Escape = abgebrochen, NICHT durchgeklickt. Vorher markierte ein
      // versehentliches Escape auf Karte 1 die einmalige Erklärung dauerhaft
      // als gesehen; zurück ging es nur über StartTab → Doku → „Tutorial neu
      // starten". Der einzige Einmal-Dialog der App ohne Rückfrage.
      if (e.key === "Escape") { e.preventDefault(); if (onClose) onClose({ durchgeklickt: false }); return; }
      if (e.key === "Tab") {
        const list = focusables(); if (!list.length) return;
        const erst = list[0], letzt = list[list.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); erst.focus(); return; }
        if (e.shiftKey && document.activeElement === erst) { e.preventDefault(); letzt.focus(); }
        else if (!e.shiftKey && document.activeElement === letzt) { e.preventDefault(); erst.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (vorherFokus && vorherFokus.focus) vorherFokus.focus(); // Fokus-Rückgabe
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fokus-Eintritt je Karte: Der Kartenwechsel tauscht den kompletten Inhalt
  // aus und zerstört dabei den fokussierten Knopf — ohne diesen Effekt fällt
  // der Fokus auf document.body, und Tastatur-/Screenreader-Nutzer landen im
  // Nichts. Deshalb hängt er an `karte`, nicht an [].
  useEffect(() => {
    const el = dialogRef.current; if (!el) return;
    const f = [...el.querySelectorAll(FOKUS_SELEKTOR)].filter((n) => !n.disabled);
    if (f.length) f[0].focus();
  }, [karte]);

  const overlay = {
    position: "fixed", inset: 0, zIndex: 10001, background: "rgba(23,21,26,0.9)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto",
  };
  const box = {
    background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 8,
    maxWidth: 560, width: "100%", padding: "26px 28px", boxSizing: "border-box", boxShadow: "0 10px 48px rgba(0,0,0,0.6)",
    maxHeight: "90dvh", overflowY: "auto", overscrollBehavior: "contain",
  };
  const h = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 14px" };
  const p = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, color: T.leinwand, lineHeight: 1.7, margin: "0 0 12px" };

  return createPortal(
    <div ref={dialogRef} style={overlay} role="dialog" aria-modal="true"
         aria-label={["Willkommen bei Kinodreieck", "Das Dreieck", "Mit oder ohne KI"][karte - 1]}>
      <div style={box}>
        {karte === 1 ? (
          <>
            <h2 style={h}>Willkommen bei Kinodreieck.</h2>
            <p style={p}>Die App gleicht das Wiener Kinoprogramm gegen deine Liste ab, verwaltet deinen Bestand und schlägt dir vor, was zu dir passt.</p>
            <p style={p}>Bevor du losläufst, ein Blick auf das Modell dahinter — es steckt im Namen und taucht überall wieder auf. Danach erklärt sich die App von selbst: Hinweise erscheinen genau dann, wenn du das erste Mal an der passenden Stelle stehst.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btnStyle(true)} onClick={() => setKarte(2)}>Weiter</button>
            </div>
          </>
        ) : karte === 2 ? (
          <>
            <h2 style={h}>Das Dreieck</h2>
            <p style={p}>Jeder Eintrag bekommt drei Werte von 0 bis 5. Zusammen ergeben sie kein Urteil, sondern ein Profil.</p>

            <div style={{ background: T.saal, borderRadius: 6, padding: "18px 18px 14px", margin: "4px 0 16px" }}>
              <DreieckRegler start={REGLER_START} scale={2.1} size={54} />
            </div>

            <p style={{ ...p, margin: "0 0 10px" }}><strong style={{ color: T.wie }}>WIE — wie ist es gemacht?</strong><br />Alles Handwerkliche und Ästhetische. Kameraarbeit, Schnitt, Szenenbild, Ton, Licht. Wie sich der Film anfühlt, bevor er irgendetwas erzählt hat. Ein Film kann hier stark sein und sonst fast nichts anbieten — das ist kein Widerspruch, das ist eine Schlagseite.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong style={{ color: T.was }}>WAS — was erzählt es?</strong><br />Der Stoff selbst. Handlung, Figuren, Dialoge, das Universum, das aufgemacht wird, und wie tief es trägt. Hier entscheidet sich, ob ein Film etwas zu sagen hat — nicht, ob er es schön sagt.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong style={{ color: T.warum }}>WARUM — warum sollte man ihn gesehen haben?</strong><br />Seine filmhistorische und popkulturelle Relevanz: Was hat er geprägt, ermöglicht oder ikonisch gemacht? Wie oft wird er zitiert, weitergedacht oder als Bezugspunkt gebraucht? Persönliche Bedeutung darf mitschwingen, bleibt aber ein Nebenfaktor.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong>Wichtig:</strong> Eine 0 heißt nicht „schlecht“. Sie heißt nur, dass diese Achse kaum ausgeprägt ist. Beim WARUM reicht die Skala von keiner erkennbaren Folgewirkung bis zum grundlegenden, kanonischen Werk.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong>Und: Schlagseite schlägt Ausgewogenheit.</strong> Ein Film mit 1/1/5 kann als kultureller Bezugspunkt entscheidender sein als ein rundes 3/3/3.</p>
            <p style={{ ...p, margin: "0 0 10px" }}>Eine Schlagseite zählt erst, wenn die stärkste Achse <strong>mindestens 3</strong> erreicht. Liegt sie darunter, heißt die Kategorie <strong>„Ohne Schlagseite“</strong>: Eine Achse kann vorn liegen, ist aber noch nicht stark genug für eine Aussage.</p>
            <p style={p}>Die <strong>Kategorie</strong> darunter tippst du nicht ein — sie folgt aus den drei Werten. Zieh die Regler und sieh zu.</p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button style={{ ...btnStyle(false), fontSize: 13, padding: "8px 14px" }} onClick={() => setKarte(1)}>Zurück</button>
              <button style={btnStyle(true)} onClick={() => setKarte(3)}>Weiter</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={h}>Mit oder ohne KI?</h2>
            <p style={p}>
              Möchtest du Kinodreieck mit KI-Funktionen nutzen? Ohne KI funktioniert alles —
              Suche, Sammlung, Bewertungen — vollständig und kostenlos auf deinem Gerät.
              Mit KI kommen Deutungs- und Profil-Funktionen dazu; jede einzelne kannst du
              in den Einstellungen an- und abschalten.
            </p>

            <div style={{ display: "flex", gap: 10, margin: "16px 0 8px", flexWrap: "wrap" }}>
              <button style={btnStyle(kiWahl === true)} aria-pressed={kiWahl === true}
                onClick={() => setKiWahl(true)}>Mit KI</button>
              <button style={btnStyle(kiWahl === false)} aria-pressed={kiWahl === false}
                onClick={() => { setKiWahl(false); setAnmeldeFehler(null); }}>Ohne KI</button>
            </div>

            {kiWahl === false && (
              <p style={{ ...p, color: T.rauch, fontSize: 14 }}>
                Gut. Du kannst KI jederzeit in den Einstellungen einschalten — dort ist auch
                jede Funktion einzeln schaltbar.
              </p>
            )}

            {/* Anmelde-ANGEBOT, kein Tor (Entscheidung Max, 28.07.2026). Die
                KI-Funktionen brauchen ein Konto — `aiService` verlangt hart
                `requireAccount("personalAi")`, und beim ersten Start ist die
                Sitzung immer ein Gast. Ohne dieses Angebot müsste selbst ein
                Beta-Freund die Anmeldung erst in den Einstellungen suchen.
                Das sichtbare „Später" wahrt die Zusage aus KontoBereich.jsx:
                „Anmelden ist ein Angebot, kein Tor." Es gibt keine
                Selbstregistrierung — ein Pflicht-Login würde ab Etappe 9a
                jeden Demo-Besucher vor eine verschlossene Tür stellen. */}
            {kiWahl === true && !angemeldet && !kontoOhneKi && (
              <div style={{ background: T.saal, borderRadius: 6, padding: "14px 16px", margin: "4px 0 12px" }}>
                <p style={{ ...p, margin: "0 0 10px", fontSize: 14 }}>
                  KI-Funktionen laufen über dein Konto — so bleiben deine Daten deinem Konto
                  zugeordnet und die Kosten im Rahmen. Du kannst dich gleich hier anmelden
                  oder später in den Einstellungen.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input style={{ ...inputStyle, flex: "1 1 140px" }} value={benutzer} autoComplete="username"
                    onChange={(e) => setBenutzer(e.target.value)} placeholder="Benutzername" aria-label="Benutzername" />
                  <input style={{ ...inputStyle, flex: "1 1 140px" }} value={passwort} type="password" autoComplete="current-password"
                    onChange={(e) => setPasswort(e.target.value)} placeholder="Passwort" aria-label="Passwort" />
                  <button style={btnStyle(false)} disabled={anmeldeLaeuft || !benutzer || !passwort}
                    onClick={async () => {
                      setAnmeldeLaeuft(true); setAnmeldeFehler(null);
                      try {
                        const s = await onAnmelden(benutzer, passwort);
                        setSitzung(s || sessionCoordinator.getSnapshot()); setPasswort("");
                      } catch (f) { setAnmeldeFehler(errorText(f)); }
                      finally { setAnmeldeLaeuft(false); }
                    }}>{anmeldeLaeuft ? "…" : "Anmelden"}</button>
                </div>
                {anmeldeFehler && (
                  <p style={{ color: T.gefahr, fontSize: 13, margin: "8px 0 0" }}>{anmeldeFehler}</p>
                )}
                <p style={{ color: T.rauch, fontSize: 12, opacity: 0.8, margin: "8px 0 0" }}>
                  Ohne Anmeldung bleibt alles nutzbar — nur die KI-Funktionen warten dann,
                  bis du dich anmeldest.
                </p>
              </div>
            )}

            {/* Der dritte Fall: Die Anmeldung hat GEKLAPPT, aber das Konto
                traegt `personalAi` nicht (oder die Sitzung ist degradiert).
                Ohne diesen Zweig stand hier wieder das Anmeldeformular —
                mit geleertem Passwortfeld, gesperrtem Knopf und ohne ein
                Wort Erklaerung. Eine geglueckte Anmeldung sah damit aus wie
                ein stiller Fehlschlag, und der zweite Versuch endete
                zwangslaeufig genauso. Ein zweites Formular hilft hier
                nichts: Es fehlen keine Zugangsdaten, es fehlt eine
                Freischaltung. Deshalb Hinweis statt Fehlerzeile — und der
                ausdrueckliche Satz, dass alles andere weiterlaeuft.

                ZWEI URSACHEN, ZWEI SAETZE: `kiFaehig` haelt die Zusage aus
                zwei verschiedenen Gruenden zurueck, und die duerfen nicht
                denselben Text bekommen. Fehlt `personalAi`, ist das Konto
                nicht freigeschaltet — dagegen hilft nur der Betreiber. Ist
                die Sitzung dagegen degradiert, HAT das Konto die
                Freischaltung; laut `services/auth.js` heisst „degraded" nur,
                dass der Server gerade nicht erreichbar ist, und das gibt
                sich von selbst. Ein gemeinsamer Text haette den zweiten
                Nutzer um eine Berechtigung bitten lassen, die er laengst
                besitzt.

                VORRANG: Treffen beide Gruende zusammen, gewinnt „degraded".
                Nicht aus Bequemlichkeit — in einer degradierten Sitzung ist
                der Server gerade nicht erreichbar, also sind auch die
                Faehigkeiten im Snapshot moeglicherweise nicht auf Stand. Die
                Aussage „gerade nicht erreichbar" bleibt in diesem Fall wahr;
                „dein Konto ist nicht freigeschaltet" waere eine Behauptung
                ueber eine Berechtigung, die wir genau jetzt nicht pruefen
                koennen. Im Zweifel die Aussage, die nichts behauptet, was
                wir nicht wissen. */}
            {kiWahl === true && kontoOhneKi && (
              <div style={{ background: T.saal, borderRadius: 6, padding: "14px 16px", margin: "4px 0 12px" }}>
                <p style={{ ...p, margin: 0, fontSize: 14 }}>
                  {sitzung.state === "degraded"
                    ? "Angemeldet — die KI-Funktionen sind gerade nicht erreichbar. Das liegt an der Verbindung zum Dienst, nicht an deinem Konto, und gibt sich meist von selbst. Alles andere funktioniert unverändert weiter; du kannst hier ohne Weiteres fortfahren."
                    : "Angemeldet — dein Konto ist für die KI-Funktionen aber noch nicht freigeschaltet. Alles andere funktioniert unverändert weiter. Du kannst hier ohne Weiteres fortfahren; die KI-Funktionen schalten sich frei, sobald dein Konto sie erhält."}
                </p>
              </div>
            )}

            {kiWahl === true && angemeldet && (
              <p style={{ ...p, color: T.ok, fontSize: 14 }}>Angemeldet — die KI-Funktionen stehen dir zur Verfügung.</p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button style={{ ...btnStyle(false), fontSize: 13, padding: "8px 14px" }} onClick={() => setKarte(2)}>Zurück</button>
              {/* Explizites Argument statt onClick={onClose}: React hätte dort
                  das SyntheticEvent durchgereicht, während der Escape-Pfad leer
                  ruft — zwei Verträge für denselben Callback. Jetzt sagt das
                  Argument, WIE geschlossen wurde; nur der Knopf gilt als
                  durchgeklickt und markiert die Erklärung als gesehen. */}
              <button style={btnStyle(true)} disabled={kiWahl === null}
                title={kiWahl === null ? "Bitte zuerst mit oder ohne KI wählen" : undefined}
                onClick={() => {
                  /* Die Wahl wird HIER geschrieben, nicht beim Klick auf die
                     Knöpfe: Wer zurückgeht und die Box abbricht, soll nichts
                     hinterlassen haben. Erst „Los geht's" ist die Entscheidung.

                     `gespeichert` reist mit: Im Privatmodus oder bei voller
                     Quote schreibt der Schalter nichts, bleibt also
                     fail-closed aus. Ohne diese Meldung haette die App die
                     Box trotzdem als gesehen markiert -- der Nutzer haette
                     ausdruecklich „Mit KI" gewaehlt, danach keine einzige
                     KI-Funktion vorgefunden und keine zweite Chance gehabt,
                     weil die einzige Stelle, an der gefragt wird, abgehakt
                     war. Jetzt fragt die Box beim naechsten Start erneut. */
                  const { gespeichert } = setzeGlobal(kiWahl === true, jetzt || new Date().toISOString());
                  if (onClose) onClose({ durchgeklickt: true, ki: kiWahl === true, gespeichert });
                }}>Los geht's</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
