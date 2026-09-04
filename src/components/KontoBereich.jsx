import { useState, useEffect, useRef } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import {
  accountSync, istKontoTreiberAktiv, istKontoTreiberVorbereitet,
} from "../services/storage.js";
import { istUebernommen, kontoSicherAutomatischLaden } from "../services/uebernahme.js";
import { topfLabel } from "../services/uebernahme.js";
import { KontoUebernahme } from "./KontoUebernahme.jsx";
import { errorText } from "../services/errors.js";
import { aiService } from "../services/ai.js";
import { kiAn } from "../lib/kiSchalter.js";
import { ladeKontostandNachDemo } from "../services/demoAccountWechsel.js";
import { fordereEinstiegNachAbmeldung } from "../controllers/onboardingController.js";
import { hatBestaetigteOwnerRolle } from "../lib/accountAccess.js";
import { formatPresentationDate } from "../lib/presentationDate.js";

/* Konto & Geräte-Sync. Der Kern der Etappe aus Nutzersicht:
   anmelden, Bestand übernehmen, auf mehreren Geräten weiterarbeiten.

   Bewusste Zusagen, die hier sichtbar werden:
   - Ohne Konto funktioniert alles weiter. Anmelden ist ein Angebot, kein Tor.
   - Abmelden entfernt den Kontocache und stellt einen früheren Gaststand wieder her.
   - Offline ist kein Abmeldegrund; nicht Gesendetes bleibt in der Warteschlange. */

function Statuszeile({ status }) {
  if (!status?.configured) return null;
  const teile = [];
  if (status.conflict?.length) teile.push({ text: status.conflict.length + " Konflikt(e)", farbe: T.gefahr });
  if (status.zuGross?.length) teile.push({ text: status.zuGross.length + " zu groß", farbe: T.gefahr });
  if (status.schemaVeraltet?.length) teile.push({ text: status.schemaVeraltet.length + " wartet auf Migration", farbe: T.gefahr });
  if (status.pending?.length) teile.push({ text: status.pending.length + " ausstehend", farbe: T.wolfram });
  if (status.stale?.length) teile.push({ text: "nicht aktuell", farbe: T.wolfram });
  if (!teile.length) teile.push({ text: "synchron", farbe: T.ok });
  return (
    <p style={{ margin: "0 0 10px", fontSize: 13 }}>
      {teile.map((t, i) => (
        <span key={i} style={{ color: t.farbe, marginRight: 10 }}>● {t.text}</span>
      ))}
      {status.lastPull && (
        <span style={{ color: T.rauch, opacity: 0.65, fontSize: 12 }}>
          zuletzt abgeglichen: {formatPresentationDate(status.lastPull, { includeTime: true })}
        </span>
      )}
    </p>
  );
}

function freigabeHinweis(status) {
  if (status === "missing") {
    return "Für dieses Konto ist noch keine Freigabe hinterlegt. Die Anmeldung bleibt bestehen; Kontodaten auf diesem Gerät bleiben geschützt und werden nicht synchronisiert.";
  }
  if (status === "unavailable") {
    return "Die Kontofreigabe konnte gerade nicht verlässlich geprüft werden. Bis zur nächsten erfolgreichen Prüfung bleiben Kontodaten geschützt und jeder Abgleich ist gestoppt.";
  }
  if (status === "invalid") {
    return "Die hinterlegte Kontofreigabe ist widersprüchlich. Der Kontospeicher bleibt deshalb vorsorglich gesperrt.";
  }
  return "Dieses Konto ist derzeit nicht für den Kontospeicher freigeschaltet. Lokale Kontodaten und offene Änderungen bleiben geschützt; es wird nichts gesendet oder gelöscht.";
}

export function KontoBereich({ onDatenGeaendert, onBackupWunsch, demoAktiv = false }) {
  const [session, setSession] = useState(() => sessionCoordinator.getSnapshot());
  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [status, setStatus] = useState(null);
  const [zeigeUebernahme, setZeigeUebernahme] = useState(false);
  const [pwOffen, setPwOffen] = useState(false);
  const [pwNeu, setPwNeu] = useState("");
  const [pwMeldung, setPwMeldung] = useState(null);
  const [meldung, setMeldung] = useState(null);
  const [kiMeldung, setKiMeldung] = useState(null);
  const loginPruefung = useRef(false);

  useEffect(() => sessionCoordinator.subscribe(setSession), []);

  const angemeldet = session.mode === "account";
  const degradiert = angemeldet && session.state === "degraded";
  const remoteFreigegeben = angemeldet && session.state === "ready"
    && session.capabilities?.remoteStorage === true;
  const personalAiFreigegeben = remoteFreigegeben
    && session.capabilities?.personalAi === true;
  const ownerTechnikBestaetigt = hatBestaetigteOwnerRolle(session);
  const kontoSpeicherAktiv = remoteFreigegeben && istKontoTreiberAktiv();

  useEffect(() => {
    if (!remoteFreigegeben) { setStatus(null); return undefined; }
    const tick = () => { try { setStatus(accountSync.status()); } catch { /* best effort */ } };
    tick();
    const iv = setInterval(tick, 4000);
    return () => clearInterval(iv);
  }, [remoteFreigegeben]);

  /* Nach dem Anmelden einmalig prüfen, ob ein Bestand zu übernehmen ist. */
  useEffect(() => {
    if (remoteFreigegeben && !demoAktiv && session.account?.id
        && !istUebernommen(session.account.id) && !loginPruefung.current) setZeigeUebernahme(true);
  }, [remoteFreigegeben, demoAktiv, session.account?.id]);

  async function ladeDemoKonto(accountId) {
    await ladeKontostandNachDemo({ accountId });
    setStatus(accountSync.status());
    setZeigeUebernahme(false);
    setMeldung("Aktueller Kontostand geladen. Demo-Daten wurden entfernt.");
    onDatenGeaendert?.();
  }

  async function anmelden(e) {
    e?.preventDefault?.();
    loginPruefung.current = true;
    setFehler(null); setLaeuft(true);
    try {
      const neu = await sessionCoordinator.signIn(benutzer, passwort);
      setPasswort("");
      if (neu.account?.id) {
        if (neu.state !== "ready" || neu.capabilities?.remoteStorage !== true) {
          setZeigeUebernahme(false);
          setMeldung("Angemeldet. Der Kontospeicher bleibt bis zu einer bestätigten Freigabe geschützt.");
        } else if (demoAktiv) await ladeDemoKonto(neu.account.id);
        else if (sessionCoordinator.getStorageState() === "account-ready") {
          const geladen = await accountSync.pull();
          if (geladen?.ok === false) throw new Error("Der Kontostand konnte nicht geladen werden.");
          setStatus(accountSync.status());
          setMeldung("Angemeldet. Dein aktueller Kontostand wurde geladen.");
          onDatenGeaendert?.();
        } else {
          const automatisch = await kontoSicherAutomatischLaden(neu.account.id);
          if (automatisch.automatisch) {
            setZeigeUebernahme(false);
            setStatus(accountSync.status());
            setMeldung("Angemeldet. Dein aktueller Kontostand wurde automatisch geladen.");
            onDatenGeaendert?.();
          } else {
            setZeigeUebernahme(true);
            setMeldung("Lokaler Bestand und Kontostand unterscheiden sich. Bitte entscheide einmal, welcher Stand gelten soll.");
          }
        }
      }
    } catch (err) {
      setFehler(err?.message || errorText(err));
      const aktuell = sessionCoordinator.getSnapshot();
      if (aktuell?.mode === "account" && aktuell.capabilities?.remoteStorage === true) setZeigeUebernahme(true);
    } finally { loginPruefung.current = false; setLaeuft(false); }
  }

  async function abmelden() {
    setFehler(null);
    setLaeuft(true);
    try {
      const logout = await sessionCoordinator.signOut();
      fordereEinstiegNachAbmeldung();
      setZeigeUebernahme(false);
      if (logout?.gaststand?.quelle === "konto-cache-quarantaene") {
        setMeldung(null);
        setFehler(logout.gaststand.warnung
          || "Abgemeldet. Der frühere Gaststand konnte nicht wiederhergestellt werden; der lokale Kontocache wurde zum Schutz entfernt.");
      } else {
        setMeldung("Abgemeldet. Kontodaten wurden von diesem Gerät entfernt; ein früherer Gaststand wurde wiederhergestellt.");
      }
      onDatenGeaendert?.();
    }
    catch (error) { setFehler(error?.message || errorText(error)); }
    finally { setLaeuft(false); }
  }

  /* ---------- Gast ---------- */
  if (!angemeldet) {
    return (
      <div>
        {session.error && (
          <div style={{ border: "1px solid " + T.wolfram, background: "rgba(227,166,59,0.12)", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
            <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>{session.error.message}</p>
          </div>
        )}
        {meldung && <p style={{ color: T.ok, fontSize: 13 }}>{meldung}</p>}
        <p style={{ color: T.rauch, fontSize: 13, margin: "0 0 10px" }}>
          Mit einem Konto gleichst du deine Mediathek zwischen Handy und Rechner ab.
          Ohne Konto bleibt alles wie bisher auf diesem Gerät — nutzbar, exportierbar, offline.
        </p>
        <form onSubmit={anmelden} style={{ display: "grid", gap: 8, maxWidth: 340 }}>
          <label style={{ fontSize: 12, color: T.rauch }}>
            Benutzername
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: 3 }} value={benutzer} autoComplete="username"
              onChange={(e) => setBenutzer(e.target.value)} placeholder="z.B. max" />
          </label>
          <label style={{ fontSize: 12, color: T.rauch }}>
            Passwort
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: 3 }} type="password" value={passwort} autoComplete="current-password"
              onChange={(e) => setPasswort(e.target.value)} />
          </label>
          {fehler && <p style={{ color: T.gefahr, fontSize: 13, margin: 0 }}>{fehler}</p>}
          <div>
            <button type="submit" style={btnStyle(true)} disabled={laeuft || !benutzer || !passwort}>
              {laeuft ? "Meldet an …" : "Anmelden"}
            </button>
          </div>
        </form>
        <p style={{ color: T.rauch, fontSize: 12, opacity: 0.75, marginTop: 10 }}>
          Konten werden nicht selbst angelegt — du bekommst deinen Zugang von Max und änderst
          das Startpasswort danach hier. Passwort vergessen? Ebenfalls über Max: es gibt bewusst
          keine E-Mail-Adressen und damit auch keinen automatischen Zurücksetzen-Link.
        </p>
      </div>
    );
  }

  /* ---------- Angemeldet ---------- */
  return (
    <div>
      {degradiert && remoteFreigegeben && (
        <div style={{ border: "1px solid " + T.wolfram, background: "rgba(227,166,59,0.12)", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>
            Konto gerade nicht erreichbar. Du bleibst angemeldet und kannst normal weiterarbeiten —
            Änderungen werden nachgetragen, sobald die Verbindung wieder steht.
          </p>
        </div>
      )}

      <p style={{ color: T.leinwand, fontSize: 14, margin: "0 0 4px" }}>
        Angemeldet als <strong>{session.account?.displayName || session.account?.id}</strong>
        {session.account?.role && (
          <span style={{ color: T.rauch, fontSize: 12, marginLeft: 8 }}>
            Rolle: {session.account.role === "owner" ? "Owner" : "Mitglied"}
          </span>
        )}
      </p>
      <Statuszeile status={kontoSpeicherAktiv ? status : null} />
      {fehler && <p role="alert" style={{ color: T.gefahr, fontSize: 13 }}>{fehler}</p>}

      {!remoteFreigegeben && (
        <div style={{ border: "1px solid " + T.wolfram, background: "rgba(227,166,59,0.12)", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>
            {freigabeHinweis(session.access?.status)}
          </p>
        </div>
      )}

      {remoteFreigegeben && !kontoSpeicherAktiv && !demoAktiv && (
        <div style={{ border: "1px solid " + T.wolfram, background: "rgba(227,166,59,0.12)", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <p style={{ margin: "0 0 8px", color: T.rauch, fontSize: 13 }}>
            Dein Konto ist angemeldet, aber der Datenbestand dieses Geräts ist noch nicht zugeordnet.
            Bis zu deiner Entscheidung bleibt jede Änderung ausschließlich lokal und wird nicht ins Konto gesendet.
          </p>
          {!zeigeUebernahme && (
            <button style={{ ...btnStyle(false), fontSize: 12 }} onClick={() => setZeigeUebernahme(true)}>
              Bestand jetzt vergleichen
            </button>
          )}
        </div>
      )}

      {kontoSpeicherAktiv && status?.zuGross?.length > 0 && (
        <div style={{ border: "1px solid " + T.gefahr, background: "rgba(217,106,90,0.12)", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>
            Zu groß für die Datenbank: {status.zuGross.map(topfLabel).join(", ")}.
            Dieser Bereich wird nicht mehr abgeglichen, bis er kleiner ist. Der lokale Stand bleibt vollständig
            erhalten — lade die Sicherheitskopie dieses Geräts herunter und räume dann auf.
          </p>
        </div>
      )}

      {/* Eigener Text für den 23514-Key-Fall — vorher lief er fälschlich als
          „zu groß" und schickte auf die Aufräum-Fährte (Audit Probe f). */}
      {kontoSpeicherAktiv && status?.schemaVeraltet?.length > 0 && (
        <div style={{ border: "1px solid " + T.gefahr, background: "rgba(217,106,90,0.12)", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <p style={{ margin: 0, color: T.rauch, fontSize: 13 }}>
            Der Server kennt einen Datentopf noch nicht: {status.schemaVeraltet.map(topfLabel).join(", ")}.
            Vermutlich fehlt eine Datenbank-Migration. Deine Daten bleiben lokal vollständig erhalten;
            sobald die Migration eingespielt ist, überträgt die nächste Änderung den Bereich von selbst.
          </p>
        </div>
      )}

      {kontoSpeicherAktiv && status?.conflict?.length > 0 && (
        <div style={{ border: "1px solid " + T.gefahr, borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <p style={{ margin: "0 0 8px", color: T.rauch, fontSize: 13 }}>
            Auf zwei Geräten gleichzeitig geändert. Entscheide je Bereich, welcher Stand gilt:
          </p>
          {status.conflict.map((key) => (
            <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ color: T.leinwand, fontSize: 13, minWidth: 150 }}>{topfLabel(key)}</span>
              <button style={{ ...btnStyle(false), fontSize: 12 }} disabled={laeuft} onClick={async () => {
                setLaeuft(true);
                try { await accountSync.resolveKeepLocal(key); setStatus(accountSync.status()); onDatenGeaendert?.(); }
                finally { setLaeuft(false); }
              }}>Diesen Gerätestand behalten</button>
              <button style={{ ...btnStyle(false), fontSize: 12 }} disabled={laeuft} onClick={async () => {
                setLaeuft(true);
                try { await accountSync.resolveKeepRemote(key); setStatus(accountSync.status()); onDatenGeaendert?.(); }
                finally { setLaeuft(false); }
              }}>Kontostand übernehmen</button>
            </div>
          ))}
        </div>
      )}

      {remoteFreigegeben && zeigeUebernahme && !demoAktiv && istKontoTreiberVorbereitet() && (
        <div style={{ border: "1px solid " + T.rauch, borderRadius: 8, padding: "12px", marginBottom: 12 }}>
          <h4 style={{ margin: "0 0 8px", color: T.leinwand, fontSize: 14 }}>Bestand übernehmen</h4>
          <KontoUebernahme
            accountId={session.account?.id}
            onBackupWunsch={onBackupWunsch}
            onFertig={() => { setZeigeUebernahme(false); onDatenGeaendert?.(); }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {remoteFreigegeben && (demoAktiv || status?.stale?.length > 0) && <button style={btnStyle(false)} disabled={laeuft || (!demoAktiv && !kontoSpeicherAktiv)} onClick={async () => {
          setLaeuft(true); setMeldung(null); setFehler(null);
          try {
            if (demoAktiv) await ladeDemoKonto(session.account?.id);
            else {
              await accountSync.pull();
              setStatus(accountSync.status());
              onDatenGeaendert?.();
              setMeldung("Abgeglichen.");
            }
          } catch (err) {
            setFehler(err?.message || errorText(err));
          }
          finally { setLaeuft(false); }
        }}>{demoAktiv ? "Aktuellen Kontostand laden" : "Kontostand erneut laden"}</button>}
        {remoteFreigegeben && status?.pending?.length > 0 && <button style={btnStyle(false)} disabled={laeuft || !kontoSpeicherAktiv} onClick={async () => {
          setLaeuft(true);
          try { await accountSync.flush(); setStatus(accountSync.status()); }
          finally { setLaeuft(false); }
        }}>Ausstehende Änderungen erneut senden</button>}
        <button style={btnStyle(false)} disabled={laeuft} onClick={abmelden}>Abmelden</button>
      </div>
      {meldung && <p style={{ color: T.ok, fontSize: 13 }}>{meldung}</p>}

      <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => setPwOffen((v) => !v)}>
        {pwOffen ? "Passwort ändern schließen" : "Passwort ändern"}
      </button>
      {pwOffen && (
        <div style={{ marginTop: 8, display: "grid", gap: 8, maxWidth: 340 }}>
          <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} type="password" value={pwNeu} autoComplete="new-password"
            placeholder="Neues Passwort (mind. 8 Zeichen)" onChange={(e) => setPwNeu(e.target.value)} />
          <div>
            <button style={btnStyle(true)} disabled={laeuft || pwNeu.length < 8} onClick={async () => {
              setLaeuft(true); setPwMeldung(null);
              try { await sessionCoordinator.changePassword(pwNeu); setPwNeu(""); setPwMeldung({ ok: true, text: "Passwort geändert." }); }
              catch (e) { setPwMeldung({ ok: false, text: e?.message || errorText(e) }); }
              finally { setLaeuft(false); }
            }}>Passwort setzen</button>
          </div>
          {pwMeldung && <p style={{ color: pwMeldung.ok ? T.ok : T.gefahr, fontSize: 13, margin: 0 }}>{pwMeldung.text}</p>}
        </div>
      )}

      {/* Diagnose, kein Produktmerkmal: prüft die Kette Anmeldung -> Endpunkt ->
          Limits, ohne ein Modell aufzurufen. Deshalb entstehen keine Kosten.
          Etappe 7: hinter dem KI-Schalter. Eine reine KI-Diagnose hat bei
          KI=aus kein deterministisches Gegenstueck -- es gaebe sie nur als
          Luege. Deshalb ausblenden, nicht ersetzen. */}
      {ownerTechnikBestaetigt && personalAiFreigegeben && kiAn("diagnose") && (
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid " + T.saalHoch }}>
        <button style={{ ...btnStyle(false), fontSize: 13 }} disabled={laeuft} onClick={async () => {
          setLaeuft(true); setKiMeldung(null);
          try {
            const bericht = await aiService.runTask("health", {});
            /* Der Endpunkt antwortet auch dann, wenn die KI abgeschaltet ist —
               eine Diagnose, die das verschweigt, meldet gruen und der naechste
               echte Aufruf scheitert. */
            if (bericht?.betrieb?.aiAktiv === false) {
              setKiMeldung({ ok: false, text: "Endpunkt erreichbar, aber die KI-Funktionen sind derzeit abgeschaltet." });
            } else if (bericht?.betrieb?.stand?.budgetErschoepft) {
              setKiMeldung({ ok: false, text: "Endpunkt erreichbar, aber das Monatsbudget ist ausgeschöpft." });
            } else {
              setKiMeldung({ ok: true, text: "KI-Endpunkt erreichbar und deine Anmeldung wird akzeptiert." });
            }
          } catch (e) {
            setKiMeldung({ ok: false, text: errorText(e) });
          } finally { setLaeuft(false); }
        }}>KI-Verbindung prüfen</button>
        {kiMeldung && (
          <p style={{ color: kiMeldung.ok ? T.ok : T.gefahr, fontSize: 13, margin: "8px 0 0" }}>{kiMeldung.text}</p>
        )}
        <p style={{ color: T.rauch, fontSize: 12, opacity: 0.75, margin: "6px 0 0" }}>
          Reine Diagnose — es wird kein Modell befragt und es entstehen keine Kosten.
        </p>
      </div>
      )}

      <p style={{ color: T.rauch, fontSize: 12, opacity: 0.75, marginTop: 12 }}>
        Beim Abmelden werden die geladenen Kontodaten von diesem Gerät entfernt.
        Ein lokaler Gaststand von vor der Anmeldung wird wiederhergestellt; dein Kontostand in der Datenbank bleibt erhalten.
      </p>
    </div>
  );
}
