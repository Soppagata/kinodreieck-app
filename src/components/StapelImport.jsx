import { useMemo, useRef, useState } from "react";
import { btnStyle, inputStyle } from "../lib/tokens.js";
import { aiService } from "../services/ai.js";
import { errorText } from "../services/errors.js";
import {
  EXTERNER_STAPEL_WORKFLOW_DATEINAME, STAPEL_MAX_ZEILEN, STAPEL_QUELLEN, STAPEL_STANDARD_QUELLEN, STAPEL_TYPEN,
  baueStapelPayload, baueStapelUebernahme, externerStapelPrompt,
  normalisiereStapelAntwort, vorbereiteTitelliste,
} from "../lib/stapelimport.js";

function parseExterneAntwort(text) {
  let roh = String(text || "").trim();
  if (!roh.startsWith("{")) {
    const bloecke = [...roh.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
    roh = bloecke.find((b) => b.includes('"kandidaten"')) || (bloecke.length === 1 ? bloecke[0] : roh);
  }
  try { return JSON.parse(roh); } catch { throw new Error("Keine gültige JSON-Antwort gefunden."); }
}

const LEER = { wie: "", was: "", warum: "" };

export function StapelImport({ master = [], addFilm, addFilme, autorName = "", kiAktiv = false, setErr = () => {}, ai = aiService }) {
  const [liste, setListe] = useState("");
  const [standardQuelle, setStandardQuelle] = useState("unklar");
  const [modus, setModus] = useState("nur");
  const [bewertungen, setBewertungen] = useState({});
  const [laeuft, setLaeuft] = useState(false);
  const [vorschau, setVorschau] = useState(null);
  const [uebernahmeLaeuft, setUebernahmeLaeuft] = useState(false);
  const uebernahmeRef = useRef(false);
  const [externText, setExternText] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [bericht, setBericht] = useState(null);
  const jsonRef = useRef(null);
  const promptRef = useRef(null);
  const externerWorkflow = useMemo(() => externerStapelPrompt(autorName), [autorName]);

  const listenStand = useMemo(() => {
    try { return { zeilen: vorbereiteTitelliste(liste), fehler: "" }; }
    catch (e) { return { zeilen: [], fehler: liste.trim() ? e.message : "" }; }
  }, [liste]);
  const zeilen = listenStand.zeilen;
  const beispiele = zeilen.slice(0, 10);
  const kompletteBewertungen = beispiele.map((titel) => ({ titel, ...(bewertungen[titel] || LEER) }))
    .filter((b) => [b.wie, b.was, b.warum].every((v) => v !== ""));

  const internAuswerten = async () => {
    if (!kiAktiv || laeuft) return;
    setLaeuft(true); setErr(""); setBericht(null);
    try {
      const payload = baueStapelPayload(liste, standardQuelle, modus === "vorbeurteilung", kompletteBewertungen);
      const antwort = await ai.runTask("media-batch-extract", payload, { promptVersion: "media-list-v2" });
      const indexMap = payload.liste.map((_, index) => index);
      setVorschau({ ...normalisiereStapelAntwort(antwort, master, { indexMap }), kostenUsdCent: antwort?.verbrauch?.kostenUsdCent ?? null });
    } catch (e) { setErr("Stapelimport: " + (e?.code ? errorText(e) : e.message)); }
    finally { setLaeuft(false); }
  };

  const ladeExtern = (text) => {
    if (vorschau) return;
    try { setVorschau(normalisiereStapelAntwort(parseExterneAntwort(text), master)); setExternText(""); setErr(""); }
    catch (e) { setErr("Stapelimport: " + e.message); }
  };

  const kopierePrompt = async () => {
    try { await navigator.clipboard.writeText(externerWorkflow); setKopiert(true); }
    catch {
      promptRef.current?.select();
      try { document.execCommand("copy"); setKopiert(true); }
      catch { setErr("Kopieren ist blockiert. Markiere den Workflow bitte manuell."); }
    }
    setTimeout(() => setKopiert(false), 2000);
  };

  const ladePromptHerunter = () => {
    const blob = new Blob([externerWorkflow], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = EXTERNER_STAPEL_WORKFLOW_DATEINAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const setzeBewertung = (titel, achse, wert) => setBewertungen((alt) => ({
    ...alt, [titel]: { ...(alt[titel] || LEER), [achse]: wert },
  }));
  const aktualisiere = (id, feld, wert) => setVorschau((alt) => ({ ...alt, kandidaten: alt.kandidaten.map((k) => k.id === id ? { ...k, [feld]: wert } : k) }));
  const uebernehmen = async () => {
    if (!vorschau || uebernahmeRef.current) return;
    const { mediathek } = baueStapelUebernahme(vorschau.kandidaten);
    if (!mediathek.length) return;
    uebernahmeRef.current = true; setUebernahmeLaeuft(true);
    try {
      let eintraege = 0;
      if (addFilme) {
        const ids = await addFilme(mediathek);
        if (ids == null) return;
        eintraege = ids.length;
      } else for (const film of mediathek) if (await addFilm?.(film)) eintraege++;
      setBericht({ eintraege }); setVorschau(null);
    } finally { uebernahmeRef.current = false; setUebernahmeLaeuft(false); }
  };

  const hatImportierbareAuswahl = !!vorschau?.kandidaten?.some((kandidat) =>
    kandidat.zustand === "ok" && kandidat.ausgewaehlt && !kandidat.vorhandenMediathek
  );

  return <div className="kd-stapelimport">
    <p className="kd-stapel-lead">Schreibe oder kopiere deine Titel hier hinein. Die KI ordnet Filme, Serien und CDs; gespeichert wird erst nach deiner Kontrolle und immer unbewertet.</p>
    <textarea value={liste} onChange={(e) => { setListe(e.target.value); setBericht(null); }} rows={8}
      placeholder={"Je Zeile ein Titel, zum Beispiel:\nAlien | 1979 | Blu-ray\nThe Expanse | Staffel 1–3 | DVD\nKind of Blue | CD"}
      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
    <div className="kd-stapel-einstellungen">
      <label>Standardmedium
        <select value={standardQuelle} onChange={(e) => setStandardQuelle(e.target.value)}>
          {STAPEL_STANDARD_QUELLEN.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
        </select>
      </label>
      <span className={listenStand.fehler ? "kd-stapel-warnung" : ""}>{listenStand.fehler || `${zeilen.length || 0} von ${STAPEL_MAX_ZEILEN} Titeln`}</span>
    </div>

    <div className="kd-stapel-modus" role="group" aria-label="Art des Stapelimports">
      <button style={btnStyle(modus === "nur")} aria-pressed={modus === "nur"} onClick={() => setModus("nur")}>Nur Sammlung erfassen</button>
      <button style={btnStyle(modus === "vorbeurteilung")} aria-pressed={modus === "vorbeurteilung"} onClick={() => setModus("vorbeurteilung")}>Erfassen & vorbeurteilen</button>
    </div>
    {modus === "vorbeurteilung" && <section className="kd-stapel-bewertungen">
      <p>Bewerte mindestens 5 der ersten Titel kurz. Diese Angaben begründen nur KI-Voreindrücke; sie werden nicht als deine Filmbewertungen gespeichert.</p>
      {beispiele.map((titel) => <div key={titel} className="kd-stapel-bewertung">
        <strong>{titel}</strong>
        {[["wie", "WIE"], ["was", "WAS"], ["warum", "WARUM"]].map(([achse, label]) => <label key={achse}>{label}
          <select aria-label={`${label} für ${titel}`} value={bewertungen[titel]?.[achse] ?? ""} onChange={(e) => setzeBewertung(titel, achse, e.target.value)}>
            <option value="">–</option>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>)}
      </div>)}
      <small>{kompletteBewertungen.length}/5 erforderliche Kurzbewertungen vollständig.</small>
    </section>}

    {kiAktiv && !vorschau ? <button style={btnStyle(true)} disabled={laeuft || !liste.trim() || !!listenStand.fehler || (modus === "vorbeurteilung" && kompletteBewertungen.length < 5)} onClick={internAuswerten}>
      {laeuft ? "KI ordnet die Liste …" : modus === "vorbeurteilung" ? "Liste ordnen & vorbeurteilen" : "Liste mit KI ordnen"}
    </button> : !kiAktiv ? <p className="kd-stapel-hinweis">Die App-KI ist ausgeschaltet oder dein Konto ist nicht KI-fähig. Der externe Fotoweg darunter bleibt verfügbar.</p> : null}
    <p className="kd-stapel-kosten">Text statt Bilder: kleines Modell, keine automatische Wiederholung. Der Aufruf zählt zu deinem KI-Kontingent.</p>

    <details className="kd-stapel-extern">
      <summary>Regalfotos extern mit GPT, Claude oder einer anderen KI lesen</summary>
      <p>Dieser Weg verursacht im Kinodreieck keine KI-Kosten. Der Workflow ist für bis zu drei hochauflösende Regalfotos mit je etwa 40–50 lesbaren Rücken gedacht. Die KI meldet bearbeitete Bereiche und Lücken; Fehlendes ergänzt du vor dem JSON-Export kurz als Text. Bei kostenlosen KI-Zugängen den Workflow besser kopieren statt als Datei hochladen, damit die Datei-Uploads für deine Fotos frei bleiben.</p>
      <textarea ref={promptRef} readOnly value={externerWorkflow} rows={9} onFocus={(e) => e.target.select()} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
      <div className="kd-stapel-aktionen">
        <button style={btnStyle(true)} onClick={kopierePrompt}>{kopiert ? "✓ Kopiert" : "Workflow kopieren"}</button>
        <button style={btnStyle(false)} onClick={ladePromptHerunter}>Workflow (.md) herunterladen</button>
      </div>
      <p className="kd-stapel-importtitel">Fertiges Ergebnis aus dem KI-Chat</p>
      <div className="kd-stapel-aktionen"><button style={btnStyle(false)} disabled={!!vorschau} onClick={() => jsonRef.current?.click()}>JSON-Datei wählen</button></div>
      <input ref={jsonRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(ladeExtern); e.target.value = ""; }} />
      <textarea value={externText} disabled={!!vorschau} onChange={(e) => setExternText(e.target.value)} rows={4} placeholder="JSON-Antwort hier einfügen …" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
      <button style={btnStyle(false)} disabled={!!vorschau || !externText.trim()} onClick={() => ladeExtern(externText)}>Antwort prüfen</button>
    </details>

    {vorschau && <section className="kd-stapel-vorschau">
      <h3>Vorschau – noch ist nichts gespeichert</h3>
      {Number.isFinite(vorschau.kostenUsdCent) && <p className="kd-stapel-kosten">Dieser Lauf hat {Number(vorschau.kostenUsdCent).toLocaleString("de-AT", { maximumFractionDigits: 4 })} US-Cent verbraucht.</p>}
      {vorschau.displayText && <p className="kd-stapel-warnung" role="status">{vorschau.displayText}</p>}
      {vorschau.warnungen.map((w, i) => <p className="kd-stapel-warnung" key={i}>{w}</p>)}
      {!!vorschau.fehlmenge?.length && <div className="kd-stapel-fehlmenge" aria-label="Offene Medieneinträge">
        <p>{vorschau.fehlmenge.length} {vorschau.fehlmenge.length === 1 ? "Eintrag bleibt" : "Einträge bleiben"} offen und wird nicht importiert.</p>
        <ul>{vorschau.fehlmenge.map((eintrag) => <li key={eintrag.id}>Zeile {eintrag.index + 1}: {eintrag.grund}</li>)}</ul>
      </div>}
      {vorschau.kandidaten.map((k) => <div className="kd-stapel-kandidat" key={k.id}>
        <label className="kd-stapel-titel"><input type="checkbox" checked={k.ausgewaehlt} onChange={(e) => aktualisiere(k.id, "ausgewaehlt", e.target.checked)} /><span><strong>{k.titel}</strong>{k.jahr ? ` (${k.jahr})` : ""}<small>{k.typ} · Sicherheit {k.sicherheit}{k.vorbeurteilung !== "offen" ? ` · Voreindruck: ${k.vorbeurteilung === "passt" ? "passt" : "eher nicht"}` : ""}{k.begruendung ? ` · ${k.begruendung}` : ""}</small></span></label>
        <div className="kd-stapel-felder"><select aria-label={`Typ für ${k.titel}`} value={k.typ} onChange={(e) => aktualisiere(k.id, "typ", e.target.value)}>{STAPEL_TYPEN.map((t) => <option key={t}>{t}</option>)}</select><select aria-label={`Quelle für ${k.titel}`} value={k.quelle} onChange={(e) => aktualisiere(k.id, "quelle", e.target.value)}>{STAPEL_QUELLEN.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>{k.typ === "serie" && <input aria-label={`Staffeln für ${k.titel}`} placeholder="Staffeln optional, z. B. 1–3" value={k.staffeln || ""} onChange={(e) => aktualisiere(k.id, "staffeln", e.target.value)} />}</div>
        {k.vorhandenMediathek && <small className="kd-stapel-dublette">Schon in der Mediathek – wird übersprungen.</small>}
      </div>)}
      <div className="kd-stapel-aktionen"><button style={btnStyle(true)} disabled={uebernahmeLaeuft || !hatImportierbareAuswahl} onClick={uebernehmen}>{uebernahmeLaeuft ? "Übernimmt …" : "Auswahl übernehmen"}</button><button style={btnStyle(false)} disabled={uebernahmeLaeuft} onClick={() => setVorschau(null)}>Verwerfen</button></div>
    </section>}
    {bericht && <p className="kd-stapel-bericht" role="status">Übernommen: {bericht.eintraege} neue Einträge in die Mediathek.</p>}
  </div>;
}
