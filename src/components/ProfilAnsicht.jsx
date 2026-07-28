import { useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { RICHTUNGEN } from "../lib/profil.js";
import { ausSchlagwort } from "../lib/geschmack.js";

/* ---------- Profil ansehen, korrigieren, löschen (Etappe 7, Phase 2c) ----------

   Der Steckbrief verlangt drei Dinge: einsehbar, korrigierbar, löschbar.
   Diese Komponente ist die Einlösung — und sie ist bewusst nüchtern: eine
   Liste, in der jeder Zug seine HERKUNFT trägt.

   WARUM DIE HERKUNFT SICHTBAR IST
   Ein Profil, das nur behauptet „du magst Science-Fiction", ist von einer
   Meinung nicht unterscheidbar. Ein Profil, das sagt „du magst
   Science-Fiction, weil du das Schlagwort angekreuzt hast", ist überprüfbar.
   Der Unterschied wird ab Etappe 8 wichtig, wenn Züge aus der KI-Extraktion
   dazukommen: Dann muss der Nutzer auf einen Blick sehen, was er selbst
   gesagt hat und was ein Modell aus seinen Worten gelesen hat.

   WARUM „LÖSCHEN" HIER SOFORT WIRKT UND NICHT ÜBER DIE ZWEI BÜHNEN LÄUFT
   Die Bestätigungspflicht in `profil.js` schützt davor, dass etwas
   UNGEFRAGT ins Profil kommt. Sie in die Gegenrichtung anzuwenden, wäre eine
   Hürde vor dem eigenen Löschknopf — der Nutzer hat gerade auf „entfernen"
   geklickt, das IST die Bestätigung. Ein zweiter Dialog davor macht Löschen
   mühsamer als Hinzufügen, und das ist bei persönlichen Daten die falsche
   Richtung. Der Widerruf der Einwilligung fragt trotzdem nach, weil er alles
   auf einmal betrifft. */

const RICHTUNG_WORT = { zieht_an: "mag", stoesst_ab: "meidet", ambivalent: "zwiespältig zu" };
const RICHTUNG_FARBE = { zieht_an: "ok", stoesst_ab: "gefahr", ambivalent: "rauch" };

/* Woraus stammt dieser Zug? Kurz und ehrlich — „unbekannt" ist eine
   zulässige Antwort und besser als eine erfundene. */
function herkunft(s) {
  /* `korrektur` ZUERST. Bei einer Korrektur wandert der ursprüngliche Beleg
     ausdrücklich mit — richtig so, sonst wäre die Belegpflicht über den
     Korrekturweg aushebelbar. Genau deshalb trifft `ausSchlagwort` aber
     weiterhin zu, und der Korrektur-Zweig war unerreichbar: Die Ansicht
     sagte „von dir angekreuzt", wo der Nutzer der Angabe gerade
     widersprochen hatte. Im KI-losen Weg gibt es keine andere Signalquelle,
     der Zweig war dort also vollständig tot. */
  if (s.quelle === "korrektur") return "von dir korrigiert";
  if (ausSchlagwort(s)) return "von dir angekreuzt";
  if (s.quelle === "filmwahl") return "aus deiner Filmauswahl";
  if (s.quelle === "bewertung") return "aus deinen Bewertungen";
  if (["K1", "K2", "K4", "vertiefung"].includes(s.quelle)) return "aus deinen Antworten";
  if (s.quelle === "prognose") return "aus einer Prognose-Reaktion";
  return "Quelle: " + String(s.quelle || "unbekannt");
}

export function ProfilAnsicht({
  profil,
  kiGeraeteweiseAus = false,
  onRichtungAendern,
  onEntfernen,
  onWiderrufen,
  onNeuErheben,
  /* Der KI-Weg wird AUSGEBLENDET, wenn er nicht offensteht — nicht erklärt
     und nicht gesperrt angeboten. Ein sichtbarer, aber toter Knopf wäre die
     Einladung, ihn zu drücken und einen Fehler zu ernten; und die einzige
     ehrliche Erklärung („du hast KI abgeschaltet") steht ohnehin in den
     Einstellungen zwei Klappen weiter oben. */
  kiWegOffen = false,
  onKiErheben,
}) {
  const [widerrufOffen, setWiderrufOffen] = useState(false);

  const p = { color: T.leinwand, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" };
  const klein = { ...p, color: T.rauch, fontSize: 13 };

  const einwilligung = profil?.einwilligung?.erteilt === true;
  const signale = Array.isArray(profil?.signale) ? profil.signale : [];
  const offen = Array.isArray(profil?.offen) ? profil.offen : [];
  const filme = Array.isArray(profil?.filme) ? profil.filme : [];
  const achsen = profil?.achsen || {};
  const achsText = ["wie", "was", "warum"]
    .filter((a) => Number.isInteger(achsen[a]))
    .map((a) => a.toUpperCase() + " " + achsen[a]);

  if (!einwilligung) {
    return (
      <div>
        <p style={p}>
          Du hast noch kein Geschmacksprofil. Kinodreieck merkt sich dann nichts über
          deinen Geschmack — Suche, Sammlung und Bewertungen funktionieren unverändert.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnStyle(true)} onClick={() => onNeuErheben?.()}>Profil anlegen</button>
          {kiWegOffen && (
            <button style={btnStyle(false)} onClick={() => onKiErheben?.()}>Mit drei Fragen anlegen</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Der Schalter ist gerätelokal, das Profil hängt am Konto. Ein Konto
          kann also ein gepflegtes Profil haben, während GENAU DIESES Gerät
          auf „ohne KI" steht. Das schweigend zu übergehen wäre irreführend:
          Der Nutzer sähe ein Profil und wunderte sich, warum nichts passiert.
          Und die Umkehrung wäre genauso falsch — das Profil ist nicht
          „inaktiv", es wirkt nur auf diesem Gerät nicht. */}
      {kiGeraeteweiseAus && (
        <p style={{ ...klein, background: T.saal, borderRadius: 6, padding: "10px 12px" }}>
          Dein Profil ist angelegt und bleibt erhalten. Auf diesem Gerät steht der
          KI-Schalter allerdings auf „aus" — hier wirkt es deshalb gerade nicht. Auf
          anderen Geräten und sobald du KI einschaltest, wird es verwendet.
        </p>
      )}

      <p style={klein}>
        Fassung {profil.version || "p0"}
        {profil.geaendert ? " · zuletzt geändert " + String(profil.geaendert).slice(0, 10) : ""}
        {" · "}{signale.length} bestätigte {signale.length === 1 ? "Angabe" : "Angaben"}
      </p>

      {signale.length === 0 && (
        <p style={p}>Im Profil steht noch nichts Bestätigtes.</p>
      )}

      {signale.map((s, i) => (
        <div key={(s.beleg || "") + i}
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
            padding: "8px 0", borderBottom: "1px solid " + T.saal }}>
          <span style={{ color: T[RICHTUNG_FARBE[s.richtung]] || T.rauch, fontFamily: "'Space Mono', monospace", fontSize: 13, minWidth: 92 }}>
            {RICHTUNG_WORT[s.richtung] || s.richtung}
          </span>
          <span style={{ color: T.leinwand, fontSize: 14, flex: "1 1 120px" }}>
            {s.wert} <span style={{ color: T.rauch, fontSize: 12 }}>({s.art})</span>
          </span>
          <span style={{ color: T.rauch, fontSize: 12, flex: "0 1 auto" }}>{herkunft(s)}</span>
          {/* Korrigieren heißt hier: die Richtung umkehren. Das ist der Fall,
              der praktisch vorkommt („das habe ich falsch verstanden") —
              Wert und Art zu ändern hieße, einen anderen Zug zu erzeugen,
              und dafür ist das Entfernen plus Neuanlegen der ehrlichere Weg. */}
          <select
            aria-label={"Richtung für " + s.wert}
            value={s.richtung}
            onChange={(e) => onRichtungAendern?.(i, e.target.value)}
            style={{ background: T.saal, color: T.leinwand, border: "1px solid " + T.rauch,
              borderRadius: 4, fontSize: 12, padding: "3px 6px" }}
          >
            {RICHTUNGEN.map((r) => <option key={r} value={r}>{RICHTUNG_WORT[r]}</option>)}
          </select>
          <button style={{ ...btnStyle(false), fontSize: 12, padding: "4px 9px" }}
            onClick={() => onEntfernen?.(i)}
            aria-label={"„" + RICHTUNG_WORT[s.richtung] + " " + s.wert + "“ entfernen"}>
            entfernen
          </button>
        </div>
      ))}

      {achsText.length > 0 && (
        <p style={{ ...klein, marginTop: 14 }}>Achsen-Tendenz: {achsText.join(", ")} (von 5)</p>
      )}

      {filme.length > 0 && (
        <p style={klein}>
          Filme: {filme.map((f) =>
            (f.richtung === "stoesst_ab" ? "− " : f.richtung === "zieht_an" ? "+ " : "") + f.titel).join(", ")}
        </p>
      )}

      {/* Offene Vorschläge werden GENANNT, auch wenn sie hier nicht bestätigt
          werden können. Ein Nutzer, der weiß, dass etwas wartet, sucht danach;
          einer, der es nicht weiß, hält das Profil für vollständig. */}
      {offen.length > 0 && (
        <p style={{ ...klein, color: T.wolfram }}>
          {offen.length} {offen.length === 1 ? "Vorschlag wartet" : "Vorschläge warten"} auf deine Bestätigung.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button style={btnStyle(false)} onClick={() => onNeuErheben?.()}>Weitere Angaben machen</button>
        {/* Der KI-Weg ERGÄNZT den deterministischen, er ersetzt ihn nie —
            bindende Zusage aus dem Steckbrief („späteres Zuschalten von KI
            verwirft das deterministische Profil nicht"). Deshalb steht er
            hier als gleichrangiges zweites Angebot und nicht als Ersatz. */}
        {kiWegOffen && (
          <button style={btnStyle(false)} onClick={() => onKiErheben?.()}>Drei Fragen beantworten</button>
        )}
        <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => setWiderrufOffen((v) => !v)}>
          Einwilligung widerrufen
        </button>
      </div>

      {widerrufOffen && (
        <div style={{ background: T.saal, borderRadius: 6, padding: "12px 14px", marginTop: 12 }}>
          <p style={{ ...p, margin: "0 0 10px" }}>
            Das löscht dein Geschmacksprofil vollständig — alle {signale.length} bestätigten
            Angaben, offene Vorschläge, Filme und Achsen. Deine Bewertungen, deine Sammlung
            und alles andere bleiben unberührt.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }}
              onClick={() => { setWiderrufOffen(false); onWiderrufen?.(); }}>
              Ja, Profil löschen
            </button>
            <button style={btnStyle(false)} onClick={() => setWiderrufOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
