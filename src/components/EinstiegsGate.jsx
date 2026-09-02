import { useEffect, useRef, useState } from "react";
import { Logo } from "./ui.jsx";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { storageOwnerKennung, subscribeStorageContext, K } from "../services/storage.js";
import { errorText } from "../services/errors.js";
import {
  EINSTIEG_VERSION,
  START_WAHL_VERSION,
  einstiegNoetig,
  schliesseEinstieg,
} from "../controllers/onboardingController.js";

const EINSTIEGS_LOGIN_OEFFNEN = "kd:einstieg:login-oeffnen";
const RECHTLICHER_KONTAKT = "max.rinke@hotmail.com";

function LegalAbschnitt({ titel, children }) {
  return <section aria-label={titel}><h3>{titel}</h3>{children}</section>;
}

export function oeffneEinstiegsLogin() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return false;
  window.dispatchEvent(new Event(EINSTIEGS_LOGIN_OEFFNEN));
  return true;
}

/* Gastdaten sind nie ein vorläufiger Kontostand und werden nie hochgeladen.
   Erst die bestätigte Kontobindung hängt die persönliche App wieder ein. */
export function EinstiegsGate({ children }) {
  const [session, setSession] = useState(() => sessionCoordinator.getSnapshot());
  const [offen, setOffen] = useState(() => einstiegNoetig(session));
  const [storageState, setStorageState] = useState(() => sessionCoordinator.getStorageState());
  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const [legalOffen, setLegalOffen] = useState(false);
  const legalRef = useRef(null), legalLinkRef = useRef(null), loginLaeuftRef = useRef(false);
  useEffect(() => {
    const aktualisiere = () => {
      setSession(sessionCoordinator.getSnapshot());
      setStorageState(sessionCoordinator.getStorageState());
    };
    const stopSession = sessionCoordinator.subscribe(aktualisiere);
    const stopStorage = subscribeStorageContext(aktualisiere);
    return () => { stopSession(); stopStorage(); };
  }, []);
  useEffect(() => {
    const oeffneLogin = () => {
      const aktuell = sessionCoordinator.getSnapshot();
      if (aktuell?.mode !== "guest" || sessionCoordinator.getStorageState() !== "guest"
        || loginLaeuftRef.current) return;
      setLegalOffen(false);
      setFehler("");
      setOffen(true);
    };
    window.addEventListener(EINSTIEGS_LOGIN_OEFFNEN, oeffneLogin);
    return () => window.removeEventListener(EINSTIEGS_LOGIN_OEFFNEN, oeffneLogin);
  }, []);
  const konto = session?.mode === "account";
  const freigegeben = konto && session.state === "ready" && session.capabilities?.remoteStorage === true;

  useEffect(() => { if (legalOffen) legalRef.current?.focus(); }, [legalOffen]);

  /* Der Storage-Marker ist nur eine zweite, lokale Zustandsquelle. Er darf eine
     fehlende, inaktive oder unlesbare serverseitige Kontofreigabe niemals
     ueberstimmen. Erst beide Grenzen zusammen haengen die App ein. */
  if (freigegeben && storageState === "account-ready") return <div key={storageOwnerKennung()}>{children}</div>;
  if (!konto && !offen && storageState === "guest") return <div key="local">{children}</div>;

  const ohneKonto = () => {
    if (loginLaeuftRef.current || konto) return;
    try {
      localStorage.setItem(K.start, "clean");
      localStorage.setItem(K.startVersion, START_WAHL_VERSION);
      if (localStorage.getItem(K.start) !== "clean"
        || localStorage.getItem(K.startVersion) !== START_WAHL_VERSION) throw new Error();
      if (!schliesseEinstieg("gast").gespeichert) throw new Error();
      setOffen(false);
    } catch { setFehler("Der lokale Start konnte nicht gespeichert werden. Bitte prüfe den Browser-Speicher."); }
  };
  const anmelden = async (event) => {
    event.preventDefault();
    if (loginLaeuftRef.current) return;
    loginLaeuftRef.current = true;
    setLaeuft(true); setFehler("");
    try { await sessionCoordinator.signIn(benutzer, passwort); setPasswort(""); }
    catch (error) {
      setFehler(errorText(error));
      if (error?.code === "ACCOUNT_LOAD_FAILED") {
        setFehler("Der Kontostand konnte nicht sicher geladen werden. Bitte versuche es erneut.");
      }
    }
    finally { loginLaeuftRef.current = false; setLaeuft(false); }
  };
  const kontoLadenWiederholen = async () => {
    if (laeuft) return;
    setLaeuft(true); setFehler("");
    try { await sessionCoordinator.refresh(); }
    catch (error) {
      setFehler(error?.code === "PERSONAL_DATA_PRIVACY_LOCKED"
        ? "Der Kontostand konnte nicht sicher geladen werden. Persönliche Daten bleiben geschützt. Bitte versuche es erneut."
        : "Der Kontostand konnte nicht sicher geladen werden. Bitte versuche es erneut.");
    } finally { setLaeuft(false); }
  };
  const abmelden = async () => {
    if (laeuft) return;
    setLaeuft(true); setFehler("");
    try { await sessionCoordinator.signOut(); schliesseEinstieg("gast"); setOffen(false); }
    catch { setFehler("Die Kontotrennung konnte nicht sicher abgeschlossen werden. Die Daten bleiben geschützt."); }
    finally { setLaeuft(false); }
  };
  return (
    <main className="kd-entry" data-entry-version={EINSTIEG_VERSION}>
      <div className="kd-entry-shell">
        <header className="kd-entry-head"><Logo size={34} /><h1>Kinodreieck</h1></header>
        <section className="kd-entry-panel" hidden={legalOffen} aria-label="Anmeldung">
          {!konto ? <>
            <form className="kd-entry-login" onSubmit={anmelden} aria-busy={laeuft}>
              <label>Benutzername<input value={benutzer} onChange={(e) => setBenutzer(e.target.value)} autoComplete="username" required /></label>
              <label>Passwort<input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" required /></label>
              <button className="kd-primary" type="submit" disabled={laeuft || !benutzer || !passwort}>{laeuft ? "Meldet an …" : "Anmelden"}</button>
            </form>
            <button className="kd-secondary kd-entry-skip" type="button" onClick={ohneKonto} disabled={laeuft}>Ohne Konto fortfahren</button>
          </> : <>
            <p role="status">{laeuft ? "Kontostand wird geladen …" : !freigegeben ? "Angemeldet. Der Kontozugriff ist derzeit nicht freigegeben. Persönliche Daten bleiben geschützt." : "Angemeldet. Der Kontostand ist noch nicht verfügbar."}</p>
            {!freigegeben && <button className="kd-primary" disabled={laeuft} onClick={() => sessionCoordinator.refresh().catch(() => setFehler("Die Kontofreigabe konnte nicht geprüft werden."))}>Freigabe erneut prüfen</button>}
            {freigegeben && storageState !== "account-ready" && <button className="kd-primary" disabled={laeuft} onClick={kontoLadenWiederholen}>Kontostand erneut laden</button>}
            <button className="kd-secondary kd-entry-skip" disabled={laeuft} onClick={abmelden}>Abmelden</button>
          </>}
          {!konto && laeuft && <p role="status">Anmeldung läuft …</p>}
          {fehler && <p role="alert" className="kd-entry-error">{fehler}</p>}
          <a className="kd-entry-legal-link" href="#datenschutz-rechtliches" ref={legalLinkRef} onClick={(event) => { event.preventDefault(); setLegalOffen(true); }}>Datenschutz &amp; Rechtliches</a>
        </section>
        <section id="datenschutz-rechtliches" ref={legalRef} className="kd-entry-panel" hidden={!legalOffen} tabIndex={-1} aria-labelledby="legal-titel">
          <h2 id="legal-titel">Datenschutz &amp; Rechtliches</h2>
          <p><strong>Stand: privater Release.</strong> Dieser ENTWURF beschreibt die derzeitigen Datenwege der Staging-Fassung. Eine formelle rechtliche Endprüfung und noch fehlende gesetzlich erforderliche Betreiberangaben werden dadurch nicht ersetzt.</p>

          <LegalAbschnitt titel="Kontakt und Geltungsbereich">
            <p>Kinodreieck ist ein privates, nicht-kommerzielles Filmprojekt ohne öffentliche Registrierung. Für Datenschutzfragen, Auskunft, Berichtigung, Einschränkung oder andere rechtliche Anliegen erreichst du Max Rinke unter <strong>{RECHTLICHER_KONTAKT}</strong>.</p>
          </LegalAbschnitt>

          <LegalAbschnitt titel="Daten im Browser und auf diesem Gerät">
            <p>Im Modus ohne Konto bleiben deine eigenen Einträge, Listen, Bewertungen, Einstellungen und KI-Präferenzen im Browser auf diesem Gerät. Sie werden nicht als Kontodaten synchronisiert. Bei einem angemeldeten Konto dient der Browser als Offline-Arbeitskopie des eindeutig gebundenen Kontostands. Kurzfristige lokale Sicherheits- und Übergangskopien werden für Kontowechsel oder Löschvorgänge verwendet und sind technisch auf höchstens sieben Tage angelegt.</p>
            <p>Der Service Worker speichert nur die App-Shell und statische Dateien für Installation und Offline-Start. API-, Authentifizierungs-, Download- und Inhaltsdaten werden nicht in seinem Cache gespeichert; alte Kinodreieck-Shell-Caches werden bei einer neuen Version entfernt.</p>
          </LegalAbschnitt>

          <LegalAbschnitt titel="Anmeldung, Konto und Synchronisation">
            <p>Benutzername und Passwort werden zur Anmeldung an Supabase Auth übertragen. Im Browser wird eine gerätebezogene Sitzung verwaltet. Bei Logout, Ablauf oder fehlender Kontofreigabe bleibt der persönliche Kontocache gesperrt und wird nicht als Gastbestand angezeigt.</p>
            <p>Bei freigegebenem Kontospeicher werden die persönlichen Kinodreieck-Daten über Supabase synchronisiert. Dazu gehören insbesondere Mediathek und Bewertungen, eigene Artikel, Kino-Pins, Wochenplan, Radarziele und -funde, Merk- und Must-Watch-Listen, Streaming-Auswahl, Einstellungen, KI-Vokabular und Geschmacksprofil. Die Synchronisation ist kontogebunden und revisionsbasiert; konkurrierende oder veraltete Revisionen werden als Konflikt behandelt, nicht still überschrieben.</p>
          </LegalAbschnitt>

          <LegalAbschnitt titel="KI- und Suchanbieter">
            <p>KI-Funktionen werden nur für angemeldete und serverseitig berechtigte Konten ausgeführt. Der Browser sendet den Sitzungstoken zunächst ausschließlich an die eigene Supabase Function; die Konto-ID wird daraus serverseitig abgeleitet und nicht als frei gesetztes Feld an den KI-Anbieter übertragen. Die Funktion übermittelt an Anthropic nur die Daten der jeweils bewusst gestarteten Aufgabe:</p>
            <ul>
              <li>bei intelligenter Suche den eingegebenen Such- oder Beschreibungstext sowie vorhandene Wertelisten wie Genres, Kategorien, Stimmungen, Quellen und Zeitangaben;</li>
              <li>bei Geschmacks- und Filmprognosen die beantworteten Geschmacksfragen beziehungsweise Filmtitel, Originaltitel, Jahr, Typ, Genres und Tags sowie begrenzte bestätigte Profilsignale und Profilachsen;</li>
              <li>bei Stapel- oder Bloganalyse die eingegebene Titelliste und gegebenenfalls Kurzbewertungen beziehungsweise den ausdrücklich ausgewählten Artikel mit ID, Titel, Text, Genres und Tags;</li>
              <li>bei Filmwissen nur eine starke Werkkennung; bei Radar-Websuche die Zielkennung und bei einem Freitextziel zusätzlich genau diesen Zieltext.</li>
            </ul>
            <p>Die übrige Mediathek, Notizen, Passwörter und die öffentliche Kontaktadresse gehören nicht zu diesen Anbieteraufträgen. Ohne Berechtigung oder aktivierte Funktion wird der Anbieterpfad geschlossen abgewiesen.</p>
          </LegalAbschnitt>

          <LegalAbschnitt titel="Diagnose, Support und Feedback">
            <p>Kinodreieck versendet keine Support- oder Diagnosedaten ungefragt. Eine bewusst erzeugte Supportdatei enthält nur technische Statuscodes, Build- und Umgebungsangaben sowie inhaltsarme lokale Diagnosen, nicht aber Konto-ID, Titel, Bewertungen, URLs oder gespeicherte Inhalte.</p>
            <p>Beim Feedback wird nur dein eingegebener Text übertragen; Name, Kontaktadresse, Konto-, Profil-, Diagnose- oder sonstige Browserdaten werden nicht ergänzt. Eine authentifizierte Kontolöschanfrage übermittelt den Anfragetyp und wird dem angemeldeten Konto serverseitig zugeordnet. Der interne Empfänger bleibt serverseitig gebunden und wird nicht veröffentlicht.</p>
            <p>Für diesen Mailversand verarbeitet Resend in den USA den jeweiligen Nachrichteninhalt und technische Zustellmetadaten. Resend bewahrt diese technischen Metadaten standardmäßig 30 Tage auf.</p>
          </LegalAbschnitt>

          <LegalAbschnitt titel="Download, Rechte und Löschung">
            <p>Der lokale JSON-Sicherheitsdownload bildet den Stand dieses Geräts ab. Er ist kein bestätigter vollständiger Server- oder Kontoexport und keine Zusage, dass eine Wiederherstellung oder ein Reimport verfügbar ist. Ein Kontoexport wird nur angezeigt, wenn sein vollständiger Umfang technisch verifiziert ist; andernfalls kannst du deine Betroffenenrechte über den oben genannten Kontakt manuell ausüben.</p>
            <p>Eine Kontolöschung beginnt in der App ausschließlich mit einer authentifizierten Anfrage. Sie löscht nicht sofort automatisch. Die Anfrage wird manuell geprüft; Konto und betroffene Daten werden anschließend im vereinbarten Einzelfall deaktiviert, archiviert und/oder gelöscht. Für eine manuelle Anfrage außerhalb dieses App-Wegs oder für Auskunft und Berichtigung nutze den öffentlichen Kontakt oben.</p>
          </LegalAbschnitt>

          <LegalAbschnitt titel="Technisch notwendige Speicherung">
            <p>Web-Analytics, Werbetracking und Profiling zu Analysezwecken sind für diesen Release ausgeschaltet. Vorgesehen sind nur technisch notwendige Speicherungen für Anmeldung, Sicherheit, lokale Nutzung, Synchronisation und die installierbare App. Deshalb wird derzeit kein Cookie-Banner eingesetzt. Eine spätere Analyse-, Tracking- oder Werbefunktion wäre eine neue Entscheidung und ist von diesem Stand nicht umfasst.</p>
          </LegalAbschnitt>

          <button className="kd-secondary" onClick={() => { setLegalOffen(false); requestAnimationFrame(() => legalLinkRef.current?.focus()); }}>Zurück zum Login</button>
        </section>
      </div>
    </main>
  );
}
