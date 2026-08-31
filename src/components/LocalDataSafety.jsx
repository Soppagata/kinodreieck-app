import { useMemo, useState } from "react";
import { createLocalDataSafetyController } from "../controllers/localDataSafetyController.js";
import { T, btnStyle } from "../lib/tokens.js";

const NICHT_MARKIEREN = () => {};

export function LocalDataSafety({ markiereExport = NICHT_MARKIEREN, controller = null }) {
  const datenController = useMemo(
    () => controller || createLocalDataSafetyController({ markiereExport }),
    [controller, markiereExport],
  );
  const [receipt, setReceipt] = useState(null);
  const [aktion, setAktion] = useState("");
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const laeuft = !!aktion;

  const download = async () => {
    if (laeuft) return;
    setAktion("download");
    setReceipt(null);
    setMeldung("");
    setFehler("");
    try {
      const bestaetigung = await datenController.download();
      setReceipt(bestaetigung);
      setMeldung("Die Sicherheitskopie dieses Geräts wurde als Download ausgelöst. Die getrennte Löschbestätigung ist jetzt freigeschaltet.");
    } catch (error) {
      setFehler(error?.message || "Die lokale Sicherheitskopie konnte nicht heruntergeladen werden.");
    } finally { setAktion(""); }
  };

  const loeschen = async () => {
    if (laeuft || !receipt) return;
    setAktion("delete");
    setMeldung("");
    setFehler("");
    try {
      const ergebnis = await datenController.deleteLocalContents(receipt);
      setReceipt(null);
      setMeldung(ergebnis?.reloadAusgeloest === false
        ? "Eigene lokale Inhalte wurden gelöscht. Bitte lade die App jetzt neu."
        : "Eigene lokale Inhalte wurden gelöscht. Die App wird neu geladen.");
    } catch (error) {
      setReceipt(null);
      setFehler(error?.message || "Die lokalen Inhalte konnten nicht vollständig gelöscht werden.");
    } finally { setAktion(""); }
  };

  return (
    <section data-local-data-safety="guest-only" aria-labelledby="local-data-safety-title"
      style={{ marginTop: 20, padding: "16px 18px", border: "1px solid " + T.tinteWeich, borderRadius: 8, background: T.saalHoch }}>
      <h2 id="local-data-safety-title" style={{ margin: "0 0 8px", color: T.leinwand, fontSize: 18 }}>
        Lokale Daten dieses Geräts
      </h2>
      <p style={{ margin: "0 0 12px", color: T.rauch, fontSize: 13, lineHeight: 1.6 }}>
        Die Datei enthält den gebundenen persönlichen App-Stand in diesem Browser. Sie ist kein Server- oder Kontoexport.
      </p>
      <button type="button" style={btnStyle(true)} disabled={laeuft} onClick={download}>
        {aktion === "download" ? "Sicherheitskopie wird erstellt …" : "Lokale Sicherheitskopie herunterladen"}
      </button>

      {receipt && (
        <div data-local-delete-confirmation="ready"
          style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid " + T.tinteWeich }}>
          <p style={{ margin: "0 0 10px", color: T.rauch, fontSize: 13, lineHeight: 1.6 }}>
            Separater Schritt: Löscht deine persönlichen Inhalte und lokalen Rückholpunkte aus diesem Browser. Serverkonto, gemeinsamer Katalog und PWA-Cache werden nicht gelöscht.
          </p>
          <button type="button" style={btnStyle(false)} disabled={laeuft} onClick={loeschen}>
            {aktion === "delete" ? "Lokale Inhalte werden gelöscht …" : "Eigene lokale Inhalte löschen"}
          </button>
        </div>
      )}

      {meldung && <p role="status" aria-live="polite" style={{ margin: "12px 0 0", color: T.wolfram, fontSize: 12, lineHeight: 1.55 }}>{meldung}</p>}
      {fehler && <p role="alert" style={{ margin: "12px 0 0", color: T.gefahr, fontSize: 12, lineHeight: 1.55 }}>{fehler}</p>}
    </section>
  );
}
