/* ---------- KI-Schalter (Etappe 7, Querschnitt) ----------

   Beim ersten Start wird gefragt, ob die App mit oder ohne KI genutzt wird.
   Ohne KI läuft alles vollständig deterministisch und bleibt vollwertig;
   einzelne KI-Funktionen sind später zuschaltbar, der Schalter bleibt in den
   Einstellungen änderbar.

   Doktrin (Max, 26.07.2026): **KI schärft und erweitert die Deterministik.**
   Ausnahme sind Kern-KI-Tasks — sie werden bei KI=aus ehrlich ausgeblendet,
   nicht simuliert.

   WARUM GERÄTELOKAL UND NICHT IN `kd:einstellungen`
   `kd:einstellungen` ist ein Sync-Topf (ACCOUNT_SYNC_KEYS) und wird von
   Anmeldung, Restore und Übernahme überschrieben. Ein Zweitgerät könnte den
   KI-Schalter damit still umlegen — und der Schalter muss VOR jeder Sitzung
   wirken, weil die Erste-Start-Frage einen Gast trifft. Deshalb ein eigener
   Topf nach dem Muster von `kd:start`, bewusst NICHT im Backup: eine
   Geräteentscheidung soll nicht mitreisen.

   WARUM EINE VERSIONSMARKE
   Wie bei `kd:start`: Nur eine Wahl, die im aktuellen Dialog bewusst
   getroffen wurde, zählt. Ein alter Wert aus einem früheren Build darf die
   ausdrücklich verlangte Entscheidung nicht für immer überspringen.

   WAS DER SCHALTER NICHT KANN
   Er entscheidet rein lokal. Die KI-Verfügbarkeit ist vor der Anmeldung
   prinzipiell nicht abfragbar — `health` verlangt selbst eine Sitzung mit
   `personalAi`. „Mit KI" ist beim Erststart deshalb eine gemerkte Absicht,
   keine sofort nutzbare Funktion; der Anmeldeschritt im Onboarding ist das
   Angebot, sie einzulösen. Der serverseitige Not-Aus (`ai_aktiv`) bleibt
   davon unberührt und wirkt weiterhin unabhängig. */

const KEY = "kd:ki";
const KEY_VERSION = "kd:ki-version";
export const KI_WAHL_VERSION = "e7-v1";

/* Ein fehlgeschlagenes Schreiben darf besonders beim AUSSCHALTEN nicht den
   zuvor gespeicherten An-Stand wirksam lassen. Das lässt sich bei blockiertem
   Storage nicht dauerhaft reparieren; für die laufende App-Sitzung sperren wir
   deshalb genau dieses Storage-Objekt vollständig. WeakSet verhindert, dass
   Test-/Iframe-Speicher oder aufgegebene Window-Objekte festgehalten werden. */
const laufzeitGesperrt = new WeakSet();
function sperre(storage) {
  if (storage && (typeof storage === "object" || typeof storage === "function")) {
    laufzeitGesperrt.add(storage);
  }
}
function entsperre(storage) {
  if (storage && (typeof storage === "object" || typeof storage === "function")) {
    laufzeitGesperrt.delete(storage);
  }
}
function istLaufzeitGesperrt(storage) {
  return !!storage && (typeof storage === "object" || typeof storage === "function")
    && laufzeitGesperrt.has(storage);
}

/* Die einzelnen Funktionen. Der globale Schalter ist das Dach: steht er auf
   „aus", ist jede Funktion aus, unabhängig von ihrem eigenen Wert. */
export const KI_FUNKTIONEN = {
  suche: {
    label: "Suche deuten",
    beschreibung: "Schwierige Suchsätze in Filter übersetzen, wenn die normale Suche nicht weiterkommt.",
    /* Die deterministische Suche ist bereits vollständig gelaufen, bevor der
       Knopf überhaupt erscheint — er ersetzt nur das Signalobjekt. Ohne ihn
       bleibt der Finder vollwertig. */
    beiAus: "ausblenden",
  },
  profil: {
    label: "Profil aus Antworten lesen",
    beschreibung: "Aus deinen Antworten auf die drei Fragen ein Geschmacksprofil ableiten.",
    /* Doktrin-Ausnahmefall: Es gibt kein deterministisches Gegenstück zu
       „Freitext verstehen". Der Ersatz ist ein Formular (Schlagwörter),
       keine simulierte KI. */
    beiAus: "ausblenden",
  },
  diagnose: {
    label: "KI-Verbindung prüfen",
    beschreibung: "Diagnose der Kette Anmeldung → Endpunkt → Limits. Kostet nichts.",
    beiAus: "ausblenden",
  },
};

export function leererStand() {
  return { global: null, funktionen: {}, gefragtAm: null };
}

function lies(storage) {
  try {
    const roh = storage.getItem(KEY);
    if (!roh) return leererStand();
    const s = JSON.parse(roh);
    if (!s || typeof s !== "object") return leererStand();
    return {
      global: s.global === true ? true : s.global === false ? false : null,
      funktionen: (s.funktionen && typeof s.funktionen === "object") ? s.funktionen : {},
      gefragtAm: typeof s.gefragtAm === "string" ? s.gefragtAm : null,
    };
  } catch { return leererStand(); }
}

/* Wurde die Frage im AKTUELLEN Dialog beantwortet? Nur dann gilt sie. */
export function wahlBestaetigt(storage = globalThis.localStorage) {
  try {
    if (!storage) return false;
    return storage.getItem(KEY_VERSION) === KI_WAHL_VERSION && lies(storage).global !== null;
  } catch { return false; }
}

export function ladeStand(storage = globalThis.localStorage) {
  try { return storage ? lies(storage) : leererStand(); } catch { return leererStand(); }
}

/* Rueckgabe `{ stand, gespeichert }`: Bei blockiertem Storage (Privatmodus,
   volle Quote) schluckt der catch den Fehler -- der Lesepfad bleibt richtig
   fail-closed, aber die Rueckgabe behauptete trotzdem `global: true`. Ein
   Aufrufer, der sie in seinen React-State legt (die naheliegende
   Verwendung), zeigte einen eingeschalteten Schalter, waehrend der Nutzer
   keine einzige KI-Funktion fand. */
export function setzeGlobal(an, jetzt, storage = globalThis.localStorage) {
  const stand = { ...ladeStand(storage), global: an === true, gefragtAm: jetzt };
  let gespeichert = false;
  try {
    storage.setItem(KEY, JSON.stringify(stand));
    storage.setItem(KEY_VERSION, KI_WAHL_VERSION);
    gespeichert = true;
    entsperre(storage);
  } catch {
    /* Auch wenn erst der zweite Write scheitert, gilt die Sitzung als gesperrt:
       ein halber KI-Vertrag darf keinen kostenpflichtigen Pfad öffnen. */
    sperre(storage);
  }
  return {
    stand: gespeichert ? stand : { ...ladeStand(storage), global: false },
    gespeichert,
  };
}

export function setzeFunktion(name, an, storage = globalThis.localStorage) {
  if (!Object.prototype.hasOwnProperty.call(KI_FUNKTIONEN, name)) {
    return { stand: ladeStand(storage), gespeichert: false };
  }
  const vorher = ladeStand(storage);
  const stand = { ...vorher, funktionen: { ...vorher.funktionen, [name]: an === true } };
  let gespeichert = false;
  try {
    storage.setItem(KEY, JSON.stringify(stand));
    gespeichert = true;
    entsperre(storage);
  } catch {
    sperre(storage);
  }
  return {
    stand: gespeichert ? stand : { ...ladeStand(storage), global: false },
    gespeichert,
  };
}

/* Die einzige Frage, die der Rest der App stellen muss.

   FAIL-CLOSED: Ohne beantwortete Frage ist KI AUS. Eine unbeantwortete Frage
   darf nie bedeuten „dann halt an" — das würde beim ersten Start einen
   bezahlten Pfad öffnen, bevor der Nutzer überhaupt gefragt wurde.

   Eine einzelne Funktion ist an, wenn der globale Schalter an ist UND sie
   nicht ausdrücklich abgewählt wurde. Der globale Schalter ist das Dach:
   steht er auf aus, hilft kein Einzelwert. */
export function kiGrundsaetzlichAn(storage = globalThis.localStorage) {
  if (istLaufzeitGesperrt(storage)) return false;
  /* K1: Die Versionsmarke wirkt hier, nicht nur im Dialog. Vorher steuerte
     sie allein, OB die Frage noch einmal erscheint -- die alte Wahl blieb
     trotzdem wirksam. Folge: Hebt ein Build `KI_WAHL_VERSION`, weil sich die
     Frage geaendert hat (neue Funktion, neue Kostenaussage), stand der
     bezahlte Knopf schon beim ersten Render da, BEVOR die neue Frage
     beantwortet war. Der Modulkopf verspricht das Gegenteil. */
  if (!wahlBestaetigt(storage)) return false;
  return ladeStand(storage).global === true;
}

/* K2: `name` ist PFLICHT. Vorher galt `!name` als "globale Frage" -- und
   damit lieferten `kiAn()`, `kiAn(undefined)`, `kiAn("")` und `kiAn(null)`
   alle `true`. Ein Aufrufer, der `kiAn(FEATURES.suche)` schreibt und dessen
   Konstante `undefined` ist (falscher Import, umbenanntes Feld), bekam "ja,
   an" und hielt die Funktion fuer geprueft. Ein Tippfehler IM STRING war
   dagegen immer sicher. Fuer die globale Frage gibt es jetzt
   `kiGrundsaetzlichAn()`; ein fehlender Name ist ein Fehler, kein Sonderfall. */
export function kiAn(name, storage = globalThis.localStorage) {
  if (typeof name !== "string" || !name) return false;
  if (!kiGrundsaetzlichAn(storage)) return false;
  if (!Object.prototype.hasOwnProperty.call(KI_FUNKTIONEN, name)) return false;
  return ladeStand(storage).funktionen[name] !== false;
}

/* Für die Oberfläche: Was tut die App bei KI=aus mit dieser Funktion?
   „ausblenden" heißt: Der Knopf existiert nicht. Kein Fehlertext, keine
   Erklärung nach dem Klick — die Funktion ist schlicht nicht da.
   `ai-disabled` aus `services/errors.js` wäre hier die falsche Meldung: Sie
   heißt „der Betreiber hat abgeschaltet", nicht „du hast abgeschaltet". */
export function verhaltenBeiAus(name) {
  return KI_FUNKTIONEN[name]?.beiAus || "ausblenden";
}
