import { useEffect, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import {
  ladeProfil, speichereProfil, loescheProfil,
  erteileEinwilligung, widerrufeEinwilligung,
  sammle, uebernimmAlle, vorschlagRahmen, uebernimmRahmen,
  naechsteVersion, pruefeProfil,
} from "../lib/profil.js";
import { GeschmackOnboarding } from "./GeschmackOnboarding.jsx";
import { ProfilAnsicht } from "./ProfilAnsicht.jsx";

/* ---------- Der Profil-Lebenszyklus an einem Ort (Etappe 7, Phase 2c) ----------

   Laden, Schreiben, Einwilligung, Widerruf. Die beiden Kindkomponenten sind
   bewusst schreibfrei: `GeschmackOnboarding` rechnet nur um,
   `ProfilAnsicht` zeigt nur an und meldet Absichten. Alles, was den Topf
   berührt, steht hier.

   WARUM DAS SCHREIBEN NICHT IN DIE OBERFLÄCHENKOMPONENTEN GEHÖRT
   `profil.js` führt eine Zwei-Bühnen-Mechanik: Neues landet in `offen` bzw.
   `rahmenOffen`, erst eine Bestätigung hebt es hinüber. Diese Reihenfolge
   ist die Einlösung des Abnahme-Kriteriums „Extraktion vor Übernahme
   sichtbar". Verteilt man sie über mehrere Komponenten, hat jede die
   Möglichkeit, einen Schritt zu überspringen — und der Scope-Wächter hat in
   Phase 1 genau diese Lücke gefunden (`achsen`, `filme` und `nichtDeutbar`
   umgingen das Gate komplett).

   WARUM ONBOARDING UND BESTÄTIGUNG HIER TROTZDEM ZUSAMMENFALLEN
   Beim deterministischen Weg hat der Nutzer die Vorschau bereits gesehen —
   sie IST der letzte Schritt des Onboardings, mit „Ins Profil übernehmen"
   als ausdrücklicher Bestätigung. Ein zweiter Bestätigungsschritt danach
   fragte dasselbe zweimal. Der Weg läuft trotzdem über `sammle` +
   `uebernimmAlle` und nicht an ihnen vorbei: Die Prüfungen, die Dubletten-
   Erkennung und die Versionsführung sitzen dort, nicht in der Vorschau.
   Beim KI-Weg (Phase 3) fällt das auseinander — dort ist die Vorschau eine
   eigene Bühne, weil der Nutzer die Vorschläge nicht selbst gemacht hat. */

const jetzt = () => new Date().toISOString();

export function GeschmackBereich({
  bekannteTitel = [],
  kiGeraeteweiseAus = false,
  /* Nur für Tests und den Demo-Modus: erlaubt, die Speicher-Schicht zu
     ersetzen, ohne das echte `store` zu berühren. */
  speicher = null,
  onFehler = null,
}) {
  const laden = speicher?.ladeProfil || ladeProfil;
  const schreiben = speicher?.speichereProfil || speichereProfil;
  const loeschen = speicher?.loescheProfil || loescheProfil;

  const [profil, setProfil] = useState(null);
  const [geladen, setGeladen] = useState(false);
  const [erhebe, setErhebe] = useState(false);
  const [meldung, setMeldung] = useState(null);

  useEffect(() => {
    let lebt = true;
    laden().then((p) => { if (lebt) { setProfil(p); setGeladen(true); } })
      .catch((e) => { if (lebt) { setGeladen(true); onFehler?.(e); } });
    return () => { lebt = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Ein Schreibversuch, der `pruefeProfil` nicht besteht, wirft in
     `speichereProfil`. Ohne diesen Fang stünde der Nutzer vor einer
     Oberfläche, die auf seinen Klick gar nicht reagiert — und in Phase 1
     ist genau dieser Fall schon einmal aufgetreten (ein Profil, das
     `uebernimmRahmen` erzeugte und `speichereProfil` abwies). */
  const schreibe = async (neu, erfolgsText) => {
    try {
      await schreiben(neu);
      setProfil(neu);
      setMeldung(erfolgsText || null);
      return true;
    } catch (e) {
      setMeldung("Konnte nicht gespeichert werden: " + (e?.message || e));
      onFehler?.(e);
      return false;
    }
  };

  const uebernehmen = async (ergebnis) => {
    const t = jetzt();
    const startVersion = profil?.version || "p0";
    /* Die Einwilligung wird HIER erteilt, nicht im Onboarding: Sie ist ein
       Schreibvorgang, und Schreibvorgänge gehören in diese Schicht. Sie muss
       außerdem VOR `sammle` stehen — ohne sie lehnt `sammle` ab
       („keine Einwilligung"), und zwar zu Recht. */
    let p = profil && !profil.beschaedigt ? profil : null;
    if (p?.einwilligung?.erteilt !== true) p = erteileEinwilligung(p, t);
    if (!p.erstellt) p = { ...p, erstellt: t };

    if (ergebnis.signale.length) {
      const r = sammle(p, ergebnis.signale, t);
      if (r.abgelehnt) { setMeldung("Nicht übernommen: " + r.abgelehnt); return; }
      p = r.profil;
      /* Der Nutzer hat die Vorschau gesehen und ausdrücklich übernommen —
         `uebernimmAlle` ist hier die Bestätigung, nicht ihre Umgehung. */
      p = uebernimmAlle(p, t).profil;
    }

    if (ergebnis.rahmen) {
      const v = vorschlagRahmen(p, ergebnis.rahmen, t);
      if (v.fehler) { setMeldung("Filme/Achsen nicht übernommen: " + v.fehler); }
      else p = uebernimmRahmen(v.profil, t, true).profil;
    }

    /* Die Fassung steigt um GENAU EINS pro Onboarding-Durchlauf.
       `uebernimmAlle` und `uebernimmRahmen` heben sie jeweils selbst — wer
       Schlagwörter UND Filme wählt, käme also von p0 auf p2, wer nur
       Schlagwörter wählt, auf p1. Damit hinge die Fassungsnummer davon ab,
       wie viele Teilschritte zufällig etwas enthielten, und die Zahl sagte
       nichts mehr über die Zahl der Änderungen aus. Deshalb einmal am Ende
       gesetzt, ausgehend vom Stand VOR dem Durchlauf. */
    p = { ...p, version: naechsteVersion(startVersion), geaendert: t };

    const ok = await schreibe(p, "Profil gespeichert.");
    if (ok) setErhebe(false);
  };

  const richtungAendern = async (index, richtung) => {
    const signale = [...(profil.signale || [])];
    if (!signale[index]) return;
    /* Die Korrektur ist selbst ein Signal-Ereignis: Sie bekommt die Quelle
       `korrektur`, damit die Herkunft ehrlich bleibt. Der ursprüngliche
       Beleg wandert mit — sonst stünde da ein Zug ohne Herkunft, und die
       Belegpflicht wäre über den Korrekturweg aushebelbar. */
    signale[index] = { ...signale[index], richtung, quelle: "korrektur" };
    const t = jetzt();
    const neu = { ...profil, signale, version: naechsteVersion(profil.version), geaendert: t };
    const fehler = pruefeProfil(neu);
    if (fehler.length) { setMeldung("Korrektur nicht möglich: " + fehler.join("; ")); return; }
    await schreibe(neu, "Korrigiert.");
  };

  const entfernen = async (index) => {
    const signale = (profil.signale || []).filter((_, i) => i !== index);
    const t = jetzt();
    await schreibe({ ...profil, signale, version: naechsteVersion(profil.version), geaendert: t }, "Entfernt.");
  };

  const widerrufen = async () => {
    const t = jetzt();
    try {
      /* Erst leeren, dann den Vermerk auf „widerrufen" setzen. Andersherum
         stünde zwischendurch ein Profil MIT Inhalt und OHNE Einwilligung im
         Topf — und genau der Zustand wandert über ACCOUNT_SYNC_KEYS zum
         Server, wenn der Sync dazwischenfunkt. */
      await loeschen(t);
      const leer = await laden();
      const nach = widerrufeEinwilligung(leer && !leer.beschaedigt ? leer : null, t);
      await schreibe(nach, "Profil gelöscht, Einwilligung widerrufen.");
      setErhebe(false);
    } catch (e) {
      setMeldung("Widerruf fehlgeschlagen: " + (e?.message || e));
      onFehler?.(e);
    }
  };

  const klein = { color: T.rauch, fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" };

  if (!geladen) return <p style={klein}>Profil wird geladen…</p>;

  /* Ein beschädigtes Profil wird NICHT überschrieben und nicht als leer
     ausgegeben — `ladeProfil` hat es ausdrücklich als beschädigt markiert,
     damit genau das nicht passiert. Der Nutzer bekommt den ehrlichen
     Befund und die Wahl. */
  if (profil?.beschaedigt) {
    return (
      <div>
        <p style={{ color: T.gefahr, fontSize: 14, lineHeight: 1.6 }}>
          Dein gespeichertes Profil ist nicht lesbar. Es wurde nicht verändert und nicht
          überschrieben. Du kannst es verwerfen und neu anfangen — alles andere bleibt
          unberührt.
        </p>
        <p style={klein}>{(profil.fehler || []).slice(0, 3).join(" · ")}</p>
        <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }}
          onClick={widerrufen}>Profil verwerfen</button>
        {meldung && <p style={klein}>{meldung}</p>}
      </div>
    );
  }

  return (
    <div>
      {erhebe ? (
        <GeschmackOnboarding
          bekannteTitel={bekannteTitel}
          bestehendeAchsen={profil?.achsen || null}
          bereitsEinverstanden={profil?.einwilligung?.erteilt === true}
          onFertig={uebernehmen}
          onAbbruch={() => setErhebe(false)}
        />
      ) : (
        <ProfilAnsicht
          profil={profil}
          kiGeraeteweiseAus={kiGeraeteweiseAus}
          onRichtungAendern={richtungAendern}
          onEntfernen={entfernen}
          onWiderrufen={widerrufen}
          onNeuErheben={() => { setMeldung(null); setErhebe(true); }}
        />
      )}
      {meldung && <p aria-live="polite" style={{ ...klein, marginTop: 12 }}>{meldung}</p>}
    </div>
  );
}
