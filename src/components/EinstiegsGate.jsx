import { useEffect, useRef, useState } from "react";
import { Logo } from "./ui.jsx";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import { storageOwnerKennung, subscribeStorageContext, K } from "../services/storage.js";
import { errorText } from "../services/errors.js";
import { APP_ENVIRONMENTS, runtimeConfig } from "../config/runtime.js";
import {
  EINSTIEG_VERSION,
  START_WAHL_VERSION,
  einstiegNoetig,
  schliesseEinstieg,
} from "../controllers/onboardingController.js";

const EINSTIEGS_LOGIN_OEFFNEN = "kd:einstieg:login-oeffnen";

export function onlineGastGesperrt(
  appEnvironment = runtimeConfig.appEnvironment,
  protokoll = globalThis.location?.protocol || globalThis.window?.location?.protocol || "",
) {
  const onlineBuild = appEnvironment === APP_ENVIRONMENTS.STAGING
    || appEnvironment === APP_ENVIRONMENTS.PRODUCTION;
  return onlineBuild && ["http:", "https:"].includes(String(protokoll).toLowerCase());
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
  const [offen, setOffen] = useState(() => onlineGastGesperrt() || einstiegNoetig(session));
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
  const onlineLoginPflicht = onlineGastGesperrt();

  useEffect(() => { if (legalOffen) legalRef.current?.focus(); }, [legalOffen]);

  if (konto && storageState === "account-ready") return <div key={storageOwnerKennung()}>{children}</div>;
  if (!konto && !onlineLoginPflicht && !offen && storageState === "guest") return <div key="local">{children}</div>;

  const ohneKonto = () => {
    if (onlineLoginPflicht || loginLaeuftRef.current || konto) return;
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
    catch (error) { setFehler(errorText(error)); }
    finally { loginLaeuftRef.current = false; setLaeuft(false); }
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
            {!onlineLoginPflicht && <button className="kd-secondary kd-entry-skip" type="button" onClick={ohneKonto} disabled={laeuft}>Ohne Konto fortfahren</button>}
          </> : <>
            <p role="status">{laeuft ? "Kontostand wird geladen …" : !freigegeben ? "Angemeldet. Der Kontozugriff ist derzeit nicht freigegeben. Persönliche Daten bleiben geschützt." : "Angemeldet. Der Kontostand ist noch nicht verfügbar."}</p>
            {!freigegeben && <button className="kd-primary" disabled={laeuft} onClick={() => sessionCoordinator.refresh().catch(() => setFehler("Die Kontofreigabe konnte nicht geprüft werden."))}>Freigabe erneut prüfen</button>}
            <button className="kd-secondary kd-entry-skip" disabled={laeuft} onClick={abmelden}>Abmelden</button>
          </>}
          {!konto && laeuft && <p role="status">Anmeldung läuft …</p>}
          {fehler && <p role="alert" className="kd-entry-error">{fehler}</p>}
          <a className="kd-entry-legal-link" href="#datenschutz-rechtliches" ref={legalLinkRef} onClick={(event) => { event.preventDefault(); setLegalOffen(true); }}>Datenschutz &amp; Rechtliches</a>
        </section>
        <section id="datenschutz-rechtliches" ref={legalRef} className="kd-entry-panel" hidden={!legalOffen} tabIndex={-1} aria-labelledby="legal-titel">
          <h2 id="legal-titel">Datenschutz &amp; Rechtliches</h2>
          <p>ENTWURF – rechtliche Prüfung und endgültige Betreiberangaben stehen aus.</p>
          <p>Ohne Konto bleiben eigene Einträge im Browser auf diesem Gerät. Eigene lokale Einträge werden nicht automatisch synchronisiert.</p>
          <p>Kontofunktionen benötigen eine Anmeldung und die entsprechende Freigabe. Dieser Entwurf ersetzt keine endgültige Datenschutzerklärung.</p>
          <button className="kd-secondary" onClick={() => { setLegalOffen(false); requestAnimationFrame(() => legalLinkRef.current?.focus()); }}>Zurück zum Login</button>
        </section>
      </div>
    </main>
  );
}
