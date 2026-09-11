import { T } from "../lib/tokens.js";
import { formatPresentationDate } from "../lib/presentationDate.js";
import { projiziereStreamingAnsichten } from "../lib/streamingProjection.js";
import { streamingQuellenstaende } from "../lib/streamingNeu.js";
import "./KatalogAuditStatus.css";

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
    {auswahlGeladen && quellen.length > 0 && <section className="kd-katalog-quellen" aria-labelledby="kd-katalog-quellen-titel">
      <h3 id="kd-katalog-quellen-titel">Stände der ausgewählten Dienste</h3>
      <div className="kd-katalog-quellenraster">{quellen.map((quelle) => <article className="kd-katalog-quellenkarte" key={quelle.dienst}>
        <h4>{quelle.dienst}</h4>
        <dl>
          <div><dt>Letzter Abruf</dt><dd>{datum(quelle.stand)}</dd></div>
          <div><dt>Vorhervergleich</dt><dd>{datum(quelle.vergleichStand)}</dd></div>
          <div><dt>Takt</dt><dd>{SCHNELLE_QUELLEN.has(quelle.dienst)
            ? "alle 48 Stunden"
            : "im Gesamtlauf alle 12 Tage"}</dd></div>
        </dl>
      </article>)}</div>
    </section>}
  </div>;
}
