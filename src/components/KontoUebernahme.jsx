import { useState, useEffect, useRef } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import {
  inventurLaden, uebernahmeStarten, uebernahmeBestaetigen, uebernahmeZuruecknehmen,
  kontoUebernehmen,
} from "../services/uebernahme.js";

/* Übernahme-Assistent: bringt einen lokal gewachsenen Bestand in ein Konto.
   Grundregeln, die hier sichtbar werden müssen:
   - Es wird nichts überschrieben, bevor der Nutzer entschieden hat.
   - Der lokale Stand bleibt bis zur Bestätigung erhalten.
   - Der Abgleich wird über Prüfsummen belegt, nicht über Stückzahlen. */

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(".", ",") + " KB";
  return (n / (1024 * 1024)).toFixed(2).replace(".", ",") + " MB";
}

function Zeile({ z }) {
  const farbe = z.status === "unterschiedlich" ? T.wolfram : z.status === "identisch" ? T.ok : T.rauch;
  return (
    <tr>
      <td style={{ padding: "5px 8px 5px 0", color: T.rauch }}>{z.label}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
        {z.lokalVorhanden ? z.lokalAnzahl : "—"}
        <span style={{ opacity: 0.55, marginLeft: 5 }}>{fmtBytes(z.lokalBytes)}</span>
      </td>
      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
        {z.remoteVorhanden ? z.remoteAnzahl : "—"}
      </td>
      <td style={{ padding: "5px 0 5px 8px", fontSize: 12, color: farbe }}>
        {z.status === "beide-leer" ? "" : z.status === "nur-lokal" ? "nur hier"
          : z.status === "nur-konto" ? "nur im Konto" : z.status === "identisch" ? "gleich" : "verschieden"}
      </td>
    </tr>
  );
}

export function KontoUebernahme({ accountId, onFertig, onBackupWunsch, services = null }) {
  const inventur = services?.inventurLaden || inventurLaden;
  const starten = services?.uebernahmeStarten || uebernahmeStarten;
  const bestaetigen = services?.uebernahmeBestaetigen || uebernahmeBestaetigen;
  const zuruecknehmen = services?.uebernahmeZuruecknehmen || uebernahmeZuruecknehmen;
  const kontoLaden = services?.kontoUebernehmen || kontoUebernehmen;
  const [laden, setLaden] = useState(true);
  const [inv, setInv] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const [warnungBestaetigt, setWarnungBestaetigt] = useState(false);
  const laeuftRef = useRef(false);

  useEffect(() => {
    let aktiv = true;
    inventur(accountId)
      .then((r) => { if (aktiv) { setInv(r); setLaden(false); } })
      .catch((e) => { if (aktiv) { setFehler(e?.message || "Bestandsaufnahme fehlgeschlagen."); setLaden(false); } });
    return () => { aktiv = false; };
  }, [accountId, inventur]);

  if (laden) return <p style={{ color: T.rauch, fontSize: 13 }}>Bestand wird verglichen …</p>;
  if (fehler && !inv) return <p style={{ color: T.gefahr, fontSize: 13 }}>{fehler}</p>;
  if (!inv) return null;

  /* Nichts zu tun: weder hier noch im Konto liegt etwas. */
  if (inv.fall === "beide-leer") {
    return (
      <div>
        <p style={{ color: T.rauch, fontSize: 13 }}>
          Auf diesem Gerät und im Konto liegen noch keine Daten. Alles, was du ab jetzt einträgst,
          landet automatisch in deinem Konto.
        </p>
        {fehler && <p role="alert" style={{ color: T.gefahr, fontSize: 13 }}>{fehler}</p>}
        <button style={btnStyle(true)} disabled={laeuft} onClick={async () => {
          if (laeuftRef.current) return;
          laeuftRef.current = true;
          setLaeuft(true); setFehler(null);
          try { await bestaetigen(accountId, inv.accountBindung); onFertig?.(); }
          catch (e) { setFehler(e?.message || "Kontoaktivierung fehlgeschlagen."); }
          finally { laeuftRef.current = false; setLaeuft(false); }
        }}>{laeuft ? "Aktiviert …" : "Alles klar"}</button>
      </div>
    );
  }

  /* Konto voll, Gerät leer: einfach holen. */
  if (inv.fall === "nur-konto") {
    return (
      <div>
        <p style={{ color: T.rauch, fontSize: 13 }}>
          Dein Konto enthält bereits Daten, dieses Gerät noch nicht. Sie werden jetzt geladen.
        </p>
        {fehler && <p role="alert" style={{ color: T.gefahr, fontSize: 13 }}>{fehler}</p>}
        <button style={btnStyle(true)} disabled={laeuft} onClick={async () => {
          if (laeuftRef.current) return;
          laeuftRef.current = true;
          setLaeuft(true);
          try { await kontoLaden(inv.lokaleWerte, { accountBindung: inv.accountBindung }); await bestaetigen(accountId, inv.accountBindung); onFertig?.(); }
          catch (e) { setFehler(e?.message || "Laden fehlgeschlagen."); }
          finally { laeuftRef.current = false; setLaeuft(false); }
        }}>{laeuft ? "Lädt …" : "Daten aus dem Konto laden"}</button>
      </div>
    );
  }

  const fremd = inv.fall === "fremdes-konto";
  const beideBelegt = inv.fall === "beide-belegt";

  /* Nach dem Lauf: Prüfbericht. */
  if (ergebnis) {
    const v = ergebnis.verifikation;
    return (
      <div>
        <h4 style={{ margin: "0 0 8px", color: T.leinwand, fontSize: 14 }}>Prüfbericht</h4>
        <p style={{ color: v.allesGleich ? T.ok : T.gefahr, fontSize: 13, margin: "0 0 10px" }}>
          {v.allesGleich
            ? "Alle übernommenen Bereiche wurden im Konto bitgenau wiedergefunden."
            : "Achtung: mindestens ein Bereich stimmt nicht überein. Der lokale Stand ist unverändert erhalten."}
        </p>
        {fehler && <p role="alert" style={{ color: T.gefahr, fontSize: 13 }}>{fehler}</p>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: T.rauch, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={{ textAlign: "left", padding: "0 8px 4px 0" }}>Bereich</th>
              <th style={{ textAlign: "right", padding: "0 8px 4px" }}>Anzahl</th>
              <th style={{ textAlign: "right", padding: "0 8px 4px" }}>Hier</th>
              <th style={{ textAlign: "right", padding: "0 0 4px 8px" }}>Konto</th>
            </tr>
          </thead>
          <tbody>
            {v.zeilen.map((z) => (
              <tr key={z.key}>
                <td style={{ padding: "4px 8px 4px 0", color: T.rauch }}>{z.label}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{z.anzahl}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: "'Space Mono', monospace", fontSize: 11, opacity: 0.75 }}>{z.lokalPruef}</td>
                <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontFamily: "'Space Mono', monospace", fontSize: 11, color: z.gleich ? T.ok : T.gefahr }}>{z.kontoPruef}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnStyle(true)} disabled={!v.allesGleich || laeuft} onClick={async () => {
            if (laeuftRef.current) return;
            laeuftRef.current = true;
            setLaeuft(true); setFehler(null);
            try { await bestaetigen(accountId, ergebnis.accountBindung); onFertig?.(); }
            catch (e) { setFehler(e?.message || "Kontoaktivierung fehlgeschlagen."); }
            finally { laeuftRef.current = false; setLaeuft(false); }
          }}>{laeuft ? "Aktiviert …" : "Übernahme bestätigen"}</button>
          <button style={btnStyle(false)} disabled={laeuft} onClick={async () => {
            if (laeuftRef.current) return;
            laeuftRef.current = true;
            setLaeuft(true);
            try { await zuruecknehmen(ergebnis.gepusht, ergebnis.accountBindung); setErgebnis(null); onFertig?.({ zurueckgenommen: true }); }
            catch (e) { setFehler(e?.message || "Rücknahme fehlgeschlagen."); }
            finally { laeuftRef.current = false; setLaeuft(false); }
          }}>Rückgängig machen</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {fremd && (
        <div style={{
          border: "1px solid " + T.gefahr, background: "rgba(217,106,90,0.12)",
          borderRadius: 8, padding: "10px 12px", marginBottom: 12,
        }}>
          <strong style={{ color: T.gefahr, fontSize: 13 }}>Diese Daten gehören zu einem anderen Konto.</strong>
          <p style={{ color: T.rauch, fontSize: 13, margin: "6px 0 8px" }}>
            Auf diesem Gerät liegt der Bestand einer anderen Anmeldung. Ihn in dein Konto zu übernehmen,
            würde fremde Einträge zu deinen machen. Im Zweifel: <em>Daten aus dem Konto laden</em>.
          </p>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: T.rauch, fontSize: 13 }}>
            <input type="checkbox" checked={warnungBestaetigt} onChange={(e) => setWarnungBestaetigt(e.target.checked)} />
            <span>Ich weiß, was ich tue — die Daten auf diesem Gerät gehören mir.</span>
          </label>
        </div>
      )}

      <p style={{ color: T.rauch, fontSize: 13, margin: "0 0 10px" }}>
        {beideBelegt
          ? "In deinem Konto liegen bereits Daten. Es wird nichts zusammengeführt — entscheide, welcher Stand gilt."
          : "Dein Bestand auf diesem Gerät kann jetzt in dein Konto übernommen werden. Der lokale Stand bleibt dabei erhalten."}
      </p>

      {inv.demo && (
        <p style={{ color: T.wolfram, fontSize: 13, margin: "0 0 10px" }}>
          Hinweis: Der lokale Bestand enthält Demo-Inhalte. Prüf kurz, ob du die wirklich in deinem Konto haben willst.
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr style={{ color: T.rauch, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <th style={{ textAlign: "left", padding: "0 8px 4px 0" }}>Bereich</th>
            <th style={{ textAlign: "right", padding: "0 8px 4px" }}>Hier</th>
            <th style={{ textAlign: "right", padding: "0 8px 4px" }}>Konto</th>
            <th style={{ textAlign: "left", padding: "0 0 4px 8px" }}></th>
          </tr>
        </thead>
        <tbody>{inv.vorschau.filter((z) => z.status !== "beide-leer").map((z) => <Zeile key={z.key} z={z} />)}</tbody>
      </table>

      <p style={{ color: T.rauch, fontSize: 12, opacity: 0.8, margin: "0 0 10px" }}>
        Vor jeder Übernahme wird ein Rückholpunkt gesichert. Ein vollständiges Datei-Backup
        {onBackupWunsch ? <> kannst du zusätzlich <button style={{ ...btnStyle(false), fontSize: 12, padding: "2px 8px" }} onClick={onBackupWunsch}>jetzt herunterladen</button></> : " solltest du zusätzlich anlegen"}.
      </p>

      {fehler && <p style={{ color: T.gefahr, fontSize: 13 }}>{fehler}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          style={btnStyle(!fremd || warnungBestaetigt)}
          disabled={laeuft || (fremd && !warnungBestaetigt)}
          onClick={async () => {
            if (laeuftRef.current) return;
            laeuftRef.current = true;
            setLaeuft(true); setFehler(null);
            try { setErgebnis(await starten({ lokaleWerte: inv.lokaleWerte, accountBindung: inv.accountBindung })); }
            catch (e) { setFehler(e?.message || "Übernahme fehlgeschlagen."); }
            finally { laeuftRef.current = false; setLaeuft(false); }
          }}
        >{laeuft ? "Überträgt …" : beideBelegt ? "Lokalen Stand übernehmen" : "In mein Konto übernehmen"}</button>

        {(beideBelegt || fremd) && (
          <button style={btnStyle(false)} disabled={laeuft} onClick={async () => {
            if (laeuftRef.current) return;
            laeuftRef.current = true;
            setLaeuft(true); setFehler(null);
            try { await kontoLaden(inv.lokaleWerte, { accountBindung: inv.accountBindung }); await bestaetigen(accountId, inv.accountBindung); onFertig?.(); }
            catch (e) { setFehler(e?.message || "Laden fehlgeschlagen."); }
            finally { laeuftRef.current = false; setLaeuft(false); }
          }}>Daten aus dem Konto laden</button>
        )}

        <button style={btnStyle(false)} disabled={laeuft} onClick={() => onFertig?.({ spaeter: true })}>Später</button>
      </div>
    </div>
  );
}
