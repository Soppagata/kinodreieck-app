import { T } from "../lib/tokens.js";
import { formatPresentationDate } from "../lib/presentationDate.js";
import { projiziereStreamingAnsichten } from "../lib/streamingProjection.js";
import { streamingQuellenstaende } from "../lib/streamingNeu.js";

const ZAHL = new Intl.NumberFormat("de-AT");
const SCHNELLE_QUELLEN = new Set([
  "Netflix",
  "Disney+",
  "Prime Video",
  "Crunchyroll Premium (Via Amazon Prime)",
  "Paramount+ (Via Amazon Prime)",
]);

const datum = (value) => value
  ? formatPresentationDate(new Date(value), { includeTime: true })
  : "noch nicht belegt";

export function KatalogAuditStatus({
  bekannt,
  entdecken,
  auswahl = [],
  auswahlGeladen = true,
  streamingNeu = { status: "idle", neueIds: [] },
}) {
  const projektion = projiziereStreamingAnsichten({ bekannt, entdecken, auswahl, auswahlGeladen });
  const quellen = streamingQuellenstaende({ bekannt, entdecken, auswahl, auswahlGeladen });
  const cell = { padding: "7px 8px", borderBottom: `1px solid ${T.saal}`, textAlign: "left", verticalAlign: "top" };
  const neuText = !auswahlGeladen
    ? "Auswahl wird geladen"
    : streamingNeu.status === "baseline"
      ? "Baseline · noch kein Vorhervergleich"
      : streamingNeu.status === "ready"
        ? ZAHL.format(streamingNeu.neueIds?.length || 0)
        : "Vollkatalog noch nicht geladen";

  return <div data-testid="streaming-catalog-audit" style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
    <p style={{ color: T.leinwandTief, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
      {projektion.vollstaendig
        ? "Vollständiger geladener Streaming-Katalog."
        : "Teilstand aus dem schnellen App-Start. Der Vollkatalog wird erst beim Öffnen von Streaming geladen."}
    </p>
    <dl className="kd-statusliste">
      <div><dt>Gesamtbestand</dt><dd>{ZAHL.format(projektion.gesamtbestand)} Titel im geladenen Stand</dd></div>
      <div><dt>Ausgewählte Dienste</dt><dd>{!auswahlGeladen
        ? "werden geladen"
        : auswahl.length === 0
          ? "keine · 0 Titel"
          : `${auswahl.join(" · ")} · ${ZAHL.format(projektion.ausgewaehlt.length)} Titel`}</dd></div>
      <div><dt>Mein Programm</dt><dd>{auswahlGeladen ? ZAHL.format(projektion.meinProgramm.length) : "wird geladen"}</dd></div>
      <div><dt>Neu</dt><dd>{neuText}</dd></div>
    </dl>
    {auswahlGeladen && quellen.length > 0 && <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <caption style={{ textAlign: "left", color: T.rauch, paddingBottom: 6 }}>Stände der ausgewählten Dienste</caption>
        <thead><tr><th style={cell}>Dienst</th><th style={cell}>Letzter Abruf</th><th style={cell}>Vorhervergleich</th><th style={cell}>Takt</th></tr></thead>
        <tbody>{quellen.map((quelle) => <tr key={quelle.dienst}>
          <td style={cell}>{quelle.dienst}</td>
          <td style={cell}>{datum(quelle.stand)}</td>
          <td style={cell}>{datum(quelle.vergleichStand)}</td>
          <td style={cell}>{SCHNELLE_QUELLEN.has(quelle.dienst)
            ? "alle 48 Stunden"
            : "im Gesamtlauf alle 12 Tage"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
