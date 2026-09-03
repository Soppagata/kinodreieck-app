import { useEffect, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import {
  ladeProfil, speichereProfil, loescheProfil,
  erteileEinwilligung, widerrufeEinwilligung,
  sammle, uebernimm, vorschlagRahmen, uebernimmRahmen,
  naechsteVersion, pruefeProfil, signalId,
} from "../lib/profil.js";
import { GeschmackOnboarding } from "./GeschmackOnboarding.jsx";
import { ProfilAnsicht } from "./ProfilAnsicht.jsx";
import { BlogProfilAnalyse } from "./BlogProfilAnalyse.jsx";
import { DreiFragen } from "./DreiFragen.jsx";
import { bauePayload, ausExtraktion } from "../lib/extraktion.js";
import { aiService } from "../services/ai.js";
import { errorText } from "../services/errors.js";

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
const blogMetaFelder = ["articleId", "contentHash", "analyzedAt", "promptVersion"];
const accountUuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sichereFehlerNachricht = (wert) => {
  if (typeof wert === "string") return wert;
  if (wert && typeof wert.message === "string") return wert.message;
  if (wert && typeof wert.meldung === "string") return wert.meldung;
  return "Ein Fehler ist aufgetreten.";
};

export function GeschmackBereich({
  bekannteTitel = [],
  kiGeraeteweiseAus = false,
  /* Die Genre-Werteliste aus dem eigenen Bestand. Sie geht als `listen` an
     den Endpunkt, damit das Modell Genres auf ECHTE Schreibweisen abbildet
     statt sie zu erfinden -- ohne sie weist der Endpunkt ab, bevor er zahlt. */
  bekannteGenres = [],
  bekannteTags = [],
  /* Fuer Tests: der KI-Dienst und der Schalter sind einsetzbar, damit die
     Pruefung ohne Netz und ohne echten localStorage laufen kann. */
  ai = aiService,
  kiAktiv = false,
  artikelListe = [],
  vokabular = [],
  kontoId = "",
  onVokabularSpeichern,
  blogProfilAnalyseSichtbar = true,
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
  /* Der KI-Weg als eigener Zustand, nicht als weiterer Schritt im
     deterministischen Ablauf: Die beiden Wege sind gleichwertig, und der
     KI-lose muss vollstaendig ohne den anderen funktionieren. Ein
     gemeinsamer Ablauf haette den Abnahme-Anker der Etappe an eine
     Verzweigung geknuepft. */
  const [frage, setFrage] = useState(false);
  const [extraktLaeuft, setExtraktLaeuft] = useState(false);
  const [extraktFehler, setExtraktFehler] = useState(null);
  const [extrakt, setExtrakt] = useState(null);

  /* FAIL-CLOSED wie ueberall beim Schalter: Ohne beantwortete Frage, ohne
     Konto und ohne eingeschaltete Funktion gibt es den KI-Weg nicht -- er
     wird AUSGEBLENDET, nicht erklaert. `ai-disabled` waere die falsche
     Meldung; sie heisst "der Betreiber hat abgeschaltet", nicht "du hast
     abgeschaltet". */
  const kiWegOffen = kiAktiv === true;
  const kontoBereit = accountUuidRe.test(String(kontoId || "")) && !!kontoId;
  const profilGueltig = () => profil && pruefeProfil(profil).length === 0;
  const onProfilSchreiben = async (neu, erfolgText) => {
    const ok = await schreibe(neu, erfolgText);
    if (ok !== true) return false;
    return true;
  };
  const vokabularWriter = typeof onVokabularSpeichern === "function" ? onVokabularSpeichern : async () => false;
  const blogAktiv = kiWegOffen && kontoBereit
    && profil?.einwilligung?.erteilt === true
    && profilGueltig()
    && typeof onVokabularSpeichern === "function";
  const onFehlerText = (fehler) => onFehler?.(sichereFehlerNachricht(fehler));

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

    let hinweis = "";

    if (ergebnis.signale.length) {
      const r = sammle(p, ergebnis.signale, t);
      if (r.abgelehnt) { setMeldung("Nicht übernommen: " + r.abgelehnt); return false; }
      p = r.profil;
      /* NUR die Signale bestätigen, die der Nutzer GERADE gesehen hat.
         Vorher stand hier `uebernimmAlle` — und das bestätigt alles, was in
         `offen` liegt, auch Vorschläge aus einem früheren Lauf, die nie
         jemand angezeigt bekommen hat. Der Nutzer klickt „übernehmen" für
         drei Züge und bestätigt vier. Das ist keine Kleinigkeit, sondern der
         Bruch der Zusage, auf der die ganze Zwei-Bühnen-Mechanik steht:
         nichts wandert ins Profil, was nicht vorher gezeigt wurde.

         Zugeordnet wird über dieselbe fachliche Identität wie in `sammle`:
         Art, Wert und Richtung. Ein Beleg ist KEIN eindeutiger Schlüssel —
         derselbe Satz kann gleichzeitig ein Genre und einen Ton tragen.
         Indizes wären ebenfalls falsch, weil `sammle` Dubletten
         zusammenführt. */
      const gezeigt = new Set(ergebnis.signale.map(signalId));
      const auswahl = (p.offen || [])
        .map((s, i) => (gezeigt.has(signalId(s)) ? i : -1))
        .filter((i) => i >= 0);
      const u = uebernimm(p, t, auswahl);
      if (u.fehler) { setMeldung("Nicht übernommen: " + u.fehler); return false; }
      p = u.profil;
    }

    if (ergebnis.rahmen) {
      const v = vorschlagRahmen(p, ergebnis.rahmen, t);
      /* Ein gescheiterter Rahmen darf nicht hinter „Profil gespeichert."
         verschwinden. Vorher wurde die Meldung gesetzt und gleich darauf vom
         Erfolgstext überschrieben: Der Nutzer sah seine Filme in der
         Vorschau, dann „gespeichert", und im Profil stand keiner — ohne
         jeden Hinweis, dass etwas schiefging. */
      if (v.fehler) hinweis = " Filme/Achsen konnten nicht übernommen werden: " + v.fehler;
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

    const ok = await schreibe(p, "Profil gespeichert." + hinweis);
    if (ok) setErhebe(false);
    /* Der Rückgabewert reist mit, damit der KI-Weg weiß, ob er seine
       Vorschau schließen darf. Schlägt das Schreiben fehl, muss sie
       stehenbleiben — sonst wäre die Extraktion weg und der Nutzer müsste
       den bezahlten Aufruf wiederholen, um an dieselben Vorschläge zu
       kommen. */
    return ok;
  };

  /* ---------- Der KI-Weg ---------- */

  const extrahiere = async (antworten) => {
    setExtraktLaeuft(true);
    setExtraktFehler(null);
    try {
      const antwort = await ai.runTask(
        "profile-extract",
        bauePayload(antworten, { genres: bekannteGenres }),
        { profilVersion: profil?.version || null },
      );
      /* `daten` ist die Hülle des Endpunkts. Fehlt sie, ist die Antwort
         nicht die erwartete — dann lieber ehrlich melden als eine leere
         Extraktion anzeigen, die wie „deine Antworten geben nichts her"
         aussieht. Das ist ein anderer Satz als die Wahrheit. */
      /* `data` — so heißt die Hülle des Endpunkts (`jsonAntwort({ ok, task,
         vorgangId, modellAlias, data, verbrauch })`). Vorher stand hier
         `daten`, der deutsche Name, den der Rest dieser Datei benutzt. Der
         KI-Weg hätte damit AUSNAHMSLOS „nicht die erwartete Form" gemeldet:
         ein bezahlter Aufruf, ein korrektes Ergebnis, und der Client wirft es
         weg, weil er unter dem falschen Namen nachsieht. Gefunden hat es die
         Testhand, nicht der Build und nicht der Rauchtest — beide sprechen
         nie mit dem echten Endpunkt.

         `Array.isArray` gehört dazu: Ein Feld ist ein `object`, und ein
         `data: []` wäre sonst als „leere Extraktion" durchgegangen. Das ist
         ein anderer Satz als die Wahrheit — der Nutzer läse „deine Antworten
         geben nichts her", wo in Wirklichkeit die Form nicht stimmt. */
      /* Ein degradierter Lauf ist ein sichtbares, aber schreibfreies Ergebnis:
         `displayText` wird getrennt von Signalen/Rahmen gehalten. Selbst ein
         fehlerhaft injizierter Dienst kann ihn dadurch nicht als Profilmerkmal
         in den Übernahmepfad schmuggeln. */
      if (antwort?.responseMode === "degraded") {
        setExtrakt(ausExtraktion({}, antwort));
        return;
      }
      const daten = antwort?.data ?? null;
      if (!daten || typeof daten !== "object" || Array.isArray(daten)) {
        setExtraktFehler("Die Antwort des Dienstes hatte nicht die erwartete Form.");
        return;
      }
      setExtrakt(ausExtraktion(daten, antwort));
    } catch (e) {
      /* `errorText` statt `e.message`: Die Fehlercodes dieses Pfads haben
         eigene, verständliche Texte (LIMIT, AI_DISABLED, FORBIDDEN …), und
         eine rohe Ausnahmemeldung wäre hier die schlechteste Auskunft. */
      setExtraktFehler(errorText(e));
      onFehler?.(e);
    } finally {
      setExtraktLaeuft(false);
    }
  };

  /* Die Übernahme läuft über GENAU denselben Weg wie der deterministische —
     `sammle` + `uebernimmAlle`, `vorschlagRahmen` + `uebernimmRahmen`. Das
     ist kein Zufall und keine Bequemlichkeit: Der Scope-Wächter hat in
     Phase 1 gefunden, dass ein zweiter Schreibweg das Bestätigungs-Gate
     umgeht, und ein eigener Pfad für die Extraktion wäre genau das gewesen.
     Der Unterschied zwischen den Wegen liegt in der VORSCHAU, nicht im
     Schreiben. */
  const uebernehmeExtrakt = async (auswahl) => {
    const ok = await uebernehmen(auswahl);
    if (ok !== false) { setFrage(false); setExtrakt(null); }
  };

  const richtungAendern = async (index, richtung) => {
    const signale = [...(profil.signale || [])];
    if (!signale[index]) return;
    /* Die Korrektur ist selbst ein Signal-Ereignis: Sie bekommt die Quelle
       `korrektur`, damit die Herkunft ehrlich bleibt. Der ursprüngliche
       Beleg wandert mit — sonst stünde da ein Zug ohne Herkunft, und die
       Belegpflicht wäre über den Korrekturweg aushebelbar. */
    const korrigiert = { ...signale[index], richtung, quelle: "korrektur" };
    if (signale[index].quelle === "bloganalyse") {
      for (const feld of blogMetaFelder) delete korrigiert[feld];
    }
    signale[index] = korrigiert;
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

  const nichtDeutbarEntfernen = async (index) => {
    const nichtDeutbar = (profil.nichtDeutbar || []).filter((_, i) => i !== index);
    const t = jetzt();
    await schreibe(
      { ...profil, nichtDeutbar, version: naechsteVersion(profil.version), geaendert: t },
      "Nicht gedeutete Angabe entfernt.",
    );
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
      {frage ? (
        <DreiFragen
          laeuft={extraktLaeuft}
          fehler={extraktFehler}
          ergebnis={extrakt}
          onExtrahieren={extrahiere}
          onUebernehmen={uebernehmeExtrakt}
          onAbbruch={() => { setFrage(false); setExtrakt(null); setExtraktFehler(null); }}
        />
      ) : erhebe ? (
        <GeschmackOnboarding
          bekannteTitel={bekannteTitel}
          bestehendeAchsen={profil?.achsen || null}
          bereitsEinverstanden={profil?.einwilligung?.erteilt === true}
          onFertig={uebernehmen}
          onAbbruch={() => setErhebe(false)}
        />
      ) : (
        <>
          <ProfilAnsicht
            profil={profil}
            kiGeraeteweiseAus={kiGeraeteweiseAus}
            onRichtungAendern={richtungAendern}
            onEntfernen={entfernen}
            onNichtDeutbarEntfernen={nichtDeutbarEntfernen}
            onWiderrufen={widerrufen}
            onNeuErheben={() => { setMeldung(null); setErhebe(true); }}
            kiWegOffen={kiWegOffen}
            onKiErheben={() => { setMeldung(null); setExtrakt(null); setExtraktFehler(null); setFrage(true); }}
          />
          {blogProfilAnalyseSichtbar && <BlogProfilAnalyse
            artikelListe={artikelListe}
            bekannteGenres={bekannteGenres}
            bekannteTags={bekannteTags}
            profil={profil}
            vokabular={vokabular}
            accountId={kontoId}
            aktiv={blogAktiv}
            ai={ai}
            onProfilSpeichern={(neu) => onProfilSchreiben(neu, "Blogprofil gespeichert.")}
            onVokabularSpeichern={vokabularWriter}
            onFehler={onFehlerText}
          />}
        </>
      )}
      {meldung && <p aria-live="polite" style={{ ...klein, marginTop: 12 }}>{meldung}</p>}
    </div>
  );
}
