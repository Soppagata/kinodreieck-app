import { useEffect, useState } from "react";
import { Logo } from "./ui.jsx";
import { InstallationCard } from "./InstallationCard.jsx";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { errorText } from "../services/errors.js";
import { K } from "../services/storage.js";
import {
  EINSTIEG_VERSION,
  START_WAHL_VERSION,
  einstiegNoetig,
  hatBestehendenLokalenStand,
  liesEinstieg,
  schliesseEinstieg,
} from "../controllers/onboardingController.js";
import { getTutorial, setWillkommen, setupUeberspringen } from "../lib/tutorial.js";
import { setzeGlobal as setzeKiGlobal } from "../lib/kiSchalter.js";
import { kontoSicherAutomatischLaden } from "../services/uebernahme.js";

function Fortschritt({ schritt }) {
  return (
    <div className="kd-entry-fortschritt" aria-label={`Schritt ${schritt} von 3`}>
      {[1, 2, 3].map((nummer) => <span key={nummer} className={nummer <= schritt ? "aktiv" : ""} />)}
    </div>
  );
}
function KurzeEinfuehrung({ weg, onFertig }) {
  const [seite, setSeite] = useState(1);
  const [fehler, setFehler] = useState("");

  if (seite === 1) {
    return (
      <EntryPage schritt={2} titel="Drei Wege zu deinem Film">
        <div className="kd-dreieck" aria-hidden="true"><span>Kino</span><span>Streaming</span><span>Mediathek</span></div>
        <p className="kd-entry-lead">Kinodreieck verbindet das aktuelle Kinoprogramm, deine Streamingdienste und deine persönliche Mediathek.</p>
        <p>Bewertungen und Listen bleiben dabei dein eigener Bestand. Ein Konto ist nur für den Abgleich zwischen Geräten nötig.</p>
        <div className="kd-entry-actions"><button className="kd-primary" onClick={() => setSeite(2)}>Weiter</button></div>
      </EntryPage>
    );
  }

  const abschliessen = (kiAn) => {
    const ergebnis = setzeKiGlobal(kiAn, new Date().toISOString());
    if (ergebnis?.gespeichert === false) {
      setFehler("Die Auswahl konnte auf diesem Gerät nicht gespeichert werden. Bitte prüfe den Browser-Speicher.");
      return;
    }
    try { setWillkommen(true); } catch { /* kompatibler Altmarker ist optional */ }
    schliesseEinstieg(weg);
    onFertig();
  };

  return (
    <EntryPage schritt={3} titel="Du entscheidest über KI">
      <p className="kd-entry-lead">Alle Grundfunktionen laufen ohne KI. Wenn du KI aktivierst, kannst du zusätzliche persönliche Vorschläge und Analysen nutzen.</p>
      <div className="kd-entry-choicegrid">
        <button className="kd-choice" onClick={() => abschliessen(true)}><strong>Mit KI</strong><span>Zusatzfunktionen bewusst aktivieren</span></button>
        <button className="kd-choice" onClick={() => abschliessen(false)}><strong>Ohne KI</strong><span>Nur die deterministischen Funktionen nutzen</span></button>
      </div>
      {fehler && <p role="alert" className="kd-entry-error">{fehler}</p>}
      <button className="kd-textbutton" onClick={() => setSeite(1)}>Zurück</button>
    </EntryPage>
  );
}

function EntryPage({ schritt, titel, children }) {
  return (
    <main className="kd-entry" data-entry-version={EINSTIEG_VERSION}>
      <div className="kd-entry-shell">
        <header className="kd-entry-head"><Logo size={34} /><span>Kinodreieck</span></header>
        <Fortschritt schritt={schritt} />
        <section className="kd-entry-panel"><h1>{titel}</h1>{children}</section>
      </div>
    </main>
  );
}

export function EinstiegsGate({ children }) {
  const [session, setSession] = useState(() => sessionCoordinator.getSnapshot());
  const [offen, setOffen] = useState(() => einstiegNoetig(sessionCoordinator.getSnapshot()));
  const [seite, setSeite] = useState("zugang");
  const [weg, setWeg] = useState("gast");
  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => sessionCoordinator.subscribe((neu) => {
    setSession(neu);
    if (neu?.mode !== "account" && einstiegNoetig(neu)) {
      setOffen(true);
      setSeite("zugang");
      setWeg("gast");
    }
  }), []);

  if (!offen) return children;

  if (seite === "willkommen") {
    return <KurzeEinfuehrung weg={weg} onFertig={() => setOffen(false)} />;
  }

  if (seite === "start") {
    const waehle = (wahl) => {
      setFehler("");
      try {
        localStorage.setItem(K.start, wahl);
        localStorage.setItem(K.startVersion, START_WAHL_VERSION);
        setupUeberspringen();
        setWeg("gast");
        setSeite("willkommen");
      } catch {
        setFehler("Die Startwahl konnte nicht gespeichert werden. Bitte erlaube lokalen Website-Speicher.");
      }
    };
    return (
      <EntryPage schritt={2} titel="Wie möchtest du starten?">
        <p className="kd-entry-lead">Deine Auswahl löscht niemals vorhandene persönliche Daten.</p>
        <div className="kd-entry-choicegrid">
          <button className="kd-choice" onClick={() => waehle("demo")}><strong>Demo ansehen</strong><span>Mit Beispielen erst einmal umsehen</span></button>
          <button className="kd-choice" onClick={() => waehle("clean")}><strong>Leer starten</strong><span>Die eigene Mediathek selbst aufbauen</span></button>
        </div>
        {fehler && <p role="alert" className="kd-entry-error">{fehler}</p>}
        <button className="kd-textbutton" onClick={() => setSeite("zugang")}>Zurück</button>
      </EntryPage>
    );
  }

  const ohneKonto = () => {
    setFehler("");
    const erzwungen = liesEinstieg()?.grund === "abmeldung";
    if (erzwungen && hatBestehendenLokalenStand()) {
      schliesseEinstieg("gast");
      setOffen(false);
      return;
    }
    setWeg("gast");
    setSeite("start");
  };

  const anmelden = async (event) => {
    event.preventDefault();
    setFehler(""); setLaeuft(true);
    try {
      await sessionCoordinator.signIn(benutzer, passwort);
      const angemeldet = sessionCoordinator.getSnapshot();
      if (angemeldet?.account?.id && sessionCoordinator.getStorageState() !== "account-ready") {
        /* Die Anmeldung selbst bleibt erfolgreich, auch wenn der Datenabgleich
           kurz nicht erreichbar ist. In diesem Fall bleibt der Kontotreiber
           sicher im Übernahme-Zustand und die Einstellungen bieten den
           bestehenden Vergleich an. */
        try { await kontoSicherAutomatischLaden(angemeldet.account.id); }
        catch { /* später in den Einstellungen erneut möglich */ }
      }
      setPasswort("");
      setWeg("konto");
      if (getTutorial().willkommen) {
        schliesseEinstieg("konto");
        setOffen(false);
      } else {
        setSeite("willkommen");
      }
    } catch (err) {
      setFehler(errorText(err));
    } finally { setLaeuft(false); }
  };

  return (
    <EntryPage schritt={1} titel="Willkommen bei Kinodreieck">
      <p className="kd-entry-lead">Melde dich mit einem eingeladenen Konto an oder nutze die App ohne Konto direkt auf diesem Gerät.</p>
      <form className="kd-entry-login" onSubmit={anmelden}>
        <label>Benutzername<input value={benutzer} onChange={(e) => setBenutzer(e.target.value)} autoComplete="username" /></label>
        <label>Passwort<input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" /></label>
        {fehler && <p role="alert" className="kd-entry-error">{fehler}</p>}
        <button className="kd-primary" type="submit" disabled={laeuft || !benutzer || !passwort}>{laeuft ? "Meldet an …" : "Anmelden"}</button>
      </form>
      <button className="kd-secondary kd-entry-skip" type="button" onClick={ohneKonto}>Ohne Konto fortfahren</button>
      <InstallationCard />
      {session?.error && <p className="kd-inline-meldung">Die Kontoverbindung ist gerade nicht erreichbar. Ohne Konto kannst du lokal fortfahren.</p>}
    </EntryPage>
  );
}
