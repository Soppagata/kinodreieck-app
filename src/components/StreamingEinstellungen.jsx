import { useMemo, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { Klappe } from "./ui.jsx";
import quellenDefault from "../data/quellen_default.json";
import { K } from "../services/storage.js";
import { serienBeobachten } from "../lib/staffeln.js";

/* ================= Streaming: Quellen, Katalog-Status, Refresh =================
   Aus dem Streaming-Tab in die Einstellungen verschoben — ein Ort für alle
   Konfiguration. Bekommt bekannt/entdecken + die Quellen-Auswahl als Props. */

const GRUPPEN_LABEL = { sub: "Abos (Subscription)", free: "Gratis (Free)", purchase: "Kauf & Leihe", tve: "TV-Anbieter", sonst: "Weitere" };
/* Kurzform des Gruppen-Typs für die Suchtreffer-Zeilen (390px-tauglich). */
const TYP_KURZ = { sub: "Abo", free: "Gratis", purchase: "Kauf/Leihe", tve: "TV", sonst: "Weitere", auswahl: "Deine Auswahl" };

/* Settings bleiben der einzige Ort mit den unveränderten Katalognamen, damit
   Auswahl und gespeicherter Wert hier vollständig nachvollziehbar bleiben. */
function kurzQuelle(n) {
  return n;
}

export function StreamingEinstellungen({ bekannt, entdecken, katalogInfo = null, auswahl = [], toggleQuelle, teil = "alle", onRefresh, datenGesperrt = false }) {
  const datenDa = !!(bekannt && bekannt.stand);
  const entdeckenDa = !!(entdecken && entdecken.stand);
  const stand = datenDa ? new Date(bekannt.stand) : null;
  const alterTage = stand ? (Date.now() - stand.getTime()) / 86400000 : null;

  /* Nur das exakte Pipeline-Datum zählt. Kein manuelles Tagesfeld und keine
     28-/30-Tage-Schätzung mehr. */
  const resetDatum = (() => {
    if (datenDa && bekannt.naechster_reset) {
      const d = new Date(bekannt.naechster_reset);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d;
    }
    return null;
  })();
  const resetInTagen = resetDatum ? Math.ceil((resetDatum.getTime() - Date.now()) / 86400000) : null;
  const beobachteteSerien = () => {
    try {
      const status = JSON.parse(localStorage.getItem(K.entdeckenStatus) || "{}");
      return serienBeobachten(status, entdecken && entdecken.titel);
    } catch { return []; }
  };

  const gruppen = useMemo(() => {
    /* Demo-Snapshots (eingebettete Beispieldaten) dürfen die echte AT-Quellenliste
       NICHT verdrängen — sonst schrumpft die Abo-Auswahl auf die 4 Testquellen. */
    const abgedeckt = new Set((datenDa && bekannt.dienste) || []);
    const vq = ((datenDa && katalogInfo?.variante !== "demo" && bekannt.verfuegbare_quellen) || []).filter((q) => abgedeckt.has(q.name));
    let basis;
    if (vq.length) {
      const g = {};
      for (const q of vq) {
        const typ = ["sub", "free", "purchase", "tve"].includes(q.typ) ? q.typ : "sonst";
        (g[typ] = g[typ] || []).push(q.name);
      }
      basis = Object.entries(g).map(([typ, quellen]) => ({
        name: GRUPPEN_LABEL[typ] || typ, typ, quellen: quellen.sort((a, b) => a.localeCompare(b)),
        warnung: typ === "purchase" ? quellenDefault.gruppen.find((x) => x.typ === "purchase")?.warnung : undefined,
      }));
    } else basis = quellenDefault.gruppen;
    /* Union-Garantie: Jede aktiv gewählte Quelle muss sichtbar und abwählbar sein,
       auch wenn Katalog/Startliste sie (noch) nicht kennen. */
    const bekannteNamen = new Set(basis.flatMap((g) => g.quellen));
    const fehlend = auswahl.filter((q) => !bekannteNamen.has(q));
    return fehlend.length ? [...basis, { name: "Deine Auswahl (nicht in der Liste)", typ: "auswahl", quellen: fehlend }] : basis;
  }, [bekannt, datenDa, katalogInfo?.variante, auswahl]);

  /* Mobil-taugliche Quellen-Auswahl (Etappe 1): statt ~40 Checkbox-Zeilen
     ein Suchfeld + kompakte Angehakt-Liste. Nicht angehakte Quellen erscheinen
     NUR als Suchtreffer. Suchtext ist reiner UI-State, wird NICHT persistiert. */
  const [quellenSuche, setQuellenSuche] = useState("");
  const quellenIndex = useMemo(() => {
    const m = new Map(); // Name -> Gruppen-Typ (erste Gruppe gewinnt)
    for (const g of gruppen) for (const q of g.quellen) if (!m.has(q)) m.set(q, g.typ);
    return m;
  }, [gruppen]);
  const suchTreffer = useMemo(() => {
    const s = quellenSuche.trim().toLowerCase();
    if (!s) return [];
    return [...quellenIndex.entries()]
      .filter(([name]) => name.toLowerCase().includes(s) && !auswahl.includes(name))
      .map(([name, typ]) => ({ name, typ }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [quellenSuche, quellenIndex, auswahl]);
  const purchaseWarnung = quellenDefault.gruppen.find((x) => x.typ === "purchase")?.warnung;

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };

  if (datenGesperrt) return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      <h2 style={h2}>Streaming gesperrt</h2>
      <p style={{ fontSize: 13, color: T.rauch, margin: 0, lineHeight: 1.6 }}>
        Der zentrale Katalog ist noch nicht verbunden. Gib den mitgeschickten Leseschlüssel unter „Datenmodus & Verbindung“ ein. Die PWA selbst lädt nie live von Watchmode.
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Etappe 2: Kästen als Accordions (Klappe). Streaming-Quellen startet
          offen, Status/Refresh zu. data-tour wandert an die Klappe (Tour-Anker). */}
      {(teil === "alle" || teil === "quellen") && <Klappe titel={`Streaming-Quellen (${auswahl.length} gewählt)`} offen tour="streaming-quellen">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.5 }}>
          Wähle die Dienste, die du tatsächlich nutzt. Die Auswahl filtert den gemeinsamen
          Katalog sofort. Angeboten werden nur Quellen, die der aktuelle Datenstand wirklich abdeckt.
        </p>
        {/* Suchfeld: einzige Tür zu den nicht angehakten Quellen (~40 Namen). */}
        <input value={quellenSuche} onChange={(e) => setQuellenSuche(e.target.value)}
          placeholder="Quelle suchen (z. B. Hayu, MUBI, Joyn) …"
          style={{ width: "100%", boxSizing: "border-box", background: T.saal, color: T.leinwand, border: "1px solid " + T.rauch, borderRadius: 4, padding: "10px 12px", fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }} />
        {quellenSuche.trim() !== "" && (
          <div style={{ marginBottom: 10 }}>
            {suchTreffer.length === 0 && (
              <div style={{ fontSize: 12, color: T.rauch, padding: "2px 0 4px" }}>Keine weitere Quelle gefunden (schon gewählt oder nicht in der Liste).</div>
            )}
            {suchTreffer.some((t) => t.typ === "purchase") && purchaseWarnung && (
              <div style={{ fontSize: 12, color: T.gefahr, margin: "2px 0 6px" }}>{purchaseWarnung}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {suchTreffer.map(({ name, typ }) => (
                <button key={name} onClick={() => toggleQuelle(name)} title={"„" + name + "“ zur Auswahl hinzufügen"}
                  style={{ display: "flex", gap: 8, alignItems: "center", textAlign: "left", background: "transparent", color: T.leinwand, border: "1px solid " + T.saal, borderRadius: 4, padding: "9px 10px", cursor: "pointer", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ {kurzQuelle(name)}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: typ === "purchase" ? T.gefahr : T.rauch, flexShrink: 0 }}>{TYP_KURZ[typ] || typ}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Angehakte Quellen: immer sichtbar, per × abwählbar. Union-Garantie:
            gerendert wird direkt aus `auswahl` — auch Namen außerhalb der
            Katalog-/Startliste bleiben damit sichtbar und abwählbar. */}
        {/* Angehakte Quellen als ruhige dunkle Liste (Max 2026-07-19): kein goldener
            Block mehr — goldenes ✓ zeigt auf einen Blick „gewählt", × wählt ab. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
          {auswahl.length === 0 && (
            <span style={{ fontSize: 12, color: T.rauch, padding: "2px 0" }}>Keine Quelle gewählt — der Streaming-Tab zeigt dann alle Dienste.</span>
          )}
          {[...auswahl].sort((a, b) => a.localeCompare(b)).map((q) => (
            <button key={q} onClick={() => toggleQuelle(q)} title={"„" + q + "“ abwählen"}
              style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, background: T.saal, border: "1px solid " + T.saalHoch, borderRadius: 4, padding: "7px 10px", cursor: "pointer" }}>
              <span aria-hidden="true" style={{ color: T.wolfram, flexShrink: 0, fontSize: 13 }}>✓</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kurzQuelle(q)}</span>
              <span aria-hidden="true" style={{ color: T.rauch, flexShrink: 0 }}>×</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: T.rauch, margin: "8px 0 0", lineHeight: 1.5 }}>
          {beobachteteSerien().length} ausdrücklich {beobachteteSerien().length === 1 ? "beobachtete Serie wird" : "beobachtete Serien werden"} beim planmäßigen Kataloglauf auf neue Staffel- und Folgenstände geprüft.
        </p>
      </div>
      </Klappe>}

      {(teil === "alle" || teil === "status") && <Klappe titel="Katalog-Status" tour="streaming-status">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        {datenDa ? (
          <>
            {katalogInfo?.variante === "demo" && <p style={{ color: T.wolfram, fontSize: 13, margin: "0 0 12px", lineHeight: 1.55 }}><strong>Öffentliche Beispieldaten.</strong> Angemeldete Konten erhalten den laufenden Watchmode-Katalog.</p>}
            <dl className="kd-statusliste">
              <div><dt>Betriebsart</dt><dd>{katalogInfo?.variante === "demo" ? "Demo" : katalogInfo?.variante === "live" ? "Konto · live" : "nicht gemeldet"}</dd></div>
              <div><dt>Stand</dt><dd>{stand.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</dd></div>
              <div><dt>Titel</dt><dd>{bekannt.titel.length} bekannt · {entdeckenDa ? entdecken.titel.length : 0} entdecken</dd></div>
              <div><dt>Credits</dt><dd>{bekannt.quota_nach_lauf ?? "?"}{bekannt.quota_limit ? ` / ${bekannt.quota_limit}` : ""} im letzten Lauf</dd></div>
              <div><dt>Nächster Reset</dt><dd>{resetDatum
                ? `${resetDatum.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })} · in ${resetInTagen} ${resetInTagen === 1 ? "Tag" : "Tagen"}`
                : "nicht gemeldet"}</dd></div>
              <div><dt>Quellen</dt><dd className="kd-status-quellen">{(bekannt.dienste || []).map(kurzQuelle).join(" · ") || "keine gemeldet"}</dd></div>
              {alterTage > 35 && <div><dt>Zustand</dt><dd style={{ color: T.gefahr }}>Seit {Math.floor(alterTage)} Tagen nicht aktualisiert</dd></div>}
            </dl>
          </>
        ) : (
          <p style={{ fontSize: 14, color: T.rauch, margin: 0 }}>Noch kein Katalog geladen.</p>
        )}
      </div>
      </Klappe>}

      {(teil === "alle" || teil === "refresh") && <Klappe titel="Programmdaten aktualisieren">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
          Lädt den letzten von der Pipeline bereitgestellten Kino- und Streamingstand erneut aus der Datenbank. Dabei entstehen keine Watchmode-Requests.
        </p>
        {onRefresh && <button style={btnStyle(false)} onClick={onRefresh}>Jetzt aus der Datenbank neu laden</button>}
      </div>
      </Klappe>}
    </div>
  );
}
