import { useEffect, useMemo, useRef, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { aiService } from "../services/ai.js";
import { errorText } from "../services/errors.js";
import {
  STAPEL_BILDTYPEN, STAPEL_MAX_BILDER, STAPEL_MAX_REQUEST_BYTES,
  STAPEL_QUELLEN, STAPEL_TYPEN, baueStapelUebernahme, externerStapelPrompt,
  normalisiereStapelAntwort, schaetzeBildTokens,
} from "../lib/stapelimport.js";

const MAX_KANTE = 960;

function dateiZuBild(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.onload = () => {
      const bild = new Image();
      bild.onerror = () => reject(new Error("Bildformat konnte nicht verarbeitet werden."));
      bild.onload = () => resolve({ bild, url: String(reader.result) });
      bild.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function komprimiereBild(file) {
  if (!STAPEL_BILDTYPEN.has(file.type)) throw new Error(`${file.name}: Bitte JPEG, PNG, WebP oder GIF wählen.`);
  const { bild, url } = await dateiZuBild(file);
  const faktor = Math.min(1, MAX_KANTE / Math.max(bild.naturalWidth, bild.naturalHeight));
  const width = Math.max(1, Math.round(bild.naturalWidth * faktor));
  const height = Math.max(1, Math.round(bild.naturalHeight * faktor));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Bildverkleinerung wird in diesem Browser nicht unterstützt.");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); ctx.drawImage(bild, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  return { name: file.name, preview: url, media_type: "image/jpeg", data: dataUrl.split(",")[1], width, height };
}

function parseExterneAntwort(text) {
  let roh = String(text || "").trim();
  if (!roh.startsWith("{")) {
    const bloecke = [...roh.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
    roh = bloecke.find((b) => b.includes('"kandidaten"')) || (bloecke.length === 1 ? bloecke[0] : roh);
  }
  try { return JSON.parse(roh); } catch { throw new Error("Keine gültige JSON-Antwort gefunden."); }
}

export function StapelImport({ master = [], addFilm, addFilme, autorName = "", kiAktiv = false, setErr = () => {} }) {
  const [bilder, setBilder] = useState([]);
  const [laeuft, setLaeuft] = useState(false);
  const [vorschau, setVorschau] = useState(null);
  const [externOffen, setExternOffen] = useState(false);
  const [externText, setExternText] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [bericht, setBericht] = useState(null);
  const kameraRef = useRef(null);
  const bilderRef = useRef(null);
  const jsonRef = useRef(null);

  useEffect(() => () => bilder.forEach((b) => { try { URL.revokeObjectURL(b.preview); } catch { /* data URL */ } }), [bilder]);
  const requestBytes = useMemo(() => new Blob([JSON.stringify({ bilder: bilder.map(({ preview, name, ...b }) => b) })]).size, [bilder]);
  const tokenSchaetzung = useMemo(() => schaetzeBildTokens(bilder), [bilder]);

  const waehleBilder = async (files) => {
    setErr(""); setBericht(null); setVorschau(null);
    const liste = [...(files || [])].slice(0, STAPEL_MAX_BILDER);
    if (!liste.length) return;
    try {
      const next = [];
      for (const file of liste) next.push(await komprimiereBild(file));
      const bytes = new Blob([JSON.stringify({ bilder: next.map(({ preview, name, ...b }) => b) })]).size;
      if (bytes > STAPEL_MAX_REQUEST_BYTES) throw new Error("Die Bilder sind zusammen noch zu groß. Bitte weniger Bilder wählen oder enger fotografieren.");
      setBilder(next);
    } catch (e) { setErr(e.message); }
  };

  const internAuswerten = async () => {
    if (!bilder.length || !kiAktiv || laeuft) return;
    setLaeuft(true); setErr(""); setBericht(null);
    try {
      const payload = { bilder: bilder.map(({ preview, name, ...b }) => b) };
      const antwort = await aiService.runTask("media-batch-extract", payload, { promptVersion: "media-batch-v1" });
      setVorschau({ ...normalisiereStapelAntwort(antwort, master), kostenUsdCent: antwort?.verbrauch?.kostenUsdCent ?? null });
    } catch (e) { setErr("Stapelimport: " + errorText(e)); }
    finally { setLaeuft(false); }
  };

  const ladeExtern = (text) => {
    try { setVorschau(normalisiereStapelAntwort(parseExterneAntwort(text), master)); setExternText(""); setErr(""); }
    catch (e) { setErr("Stapelimport: " + e.message); }
  };

  const kopierePrompt = async () => {
    try { await navigator.clipboard.writeText(externerStapelPrompt(autorName)); setKopiert(true); setTimeout(() => setKopiert(false), 2000); }
    catch { setErr("Kopieren ist blockiert. Markiere den Prompt bitte manuell."); }
  };

  const aktualisiere = (id, feld, wert) => setVorschau((alt) => ({ ...alt, kandidaten: alt.kandidaten.map((k) => k.id === id ? { ...k, [feld]: wert } : k) }));
  const uebernehmen = () => {
    if (!vorschau) return;
    const { mediathek } = baueStapelUebernahme(vorschau.kandidaten);
    const filme = addFilme ? (addFilme(mediathek)?.length || 0) : mediathek.reduce((n, f) => n + (addFilm?.(f) ? 1 : 0), 0);
    setBericht({ filme }); setVorschau(null);
  };

  return <div className="kd-stapelimport">
    <p className="kd-stapel-lead">Fotografiere deine Film- und Serienregale oder wähle Screenshots deiner digital gekauften Sammlung. Die KI erkennt Titel, Kaufquelle und – wenn sichtbar – Staffeln. Erst deine Vorschau entscheidet, was unbewertet in der Mediathek landet.</p>
    <input ref={kameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={(e) => { waehleBilder(e.target.files); e.target.value = ""; }} />
    <input ref={bilderRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => { waehleBilder(e.target.files); e.target.value = ""; }} />
    <input ref={jsonRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(ladeExtern); e.target.value = ""; }} />

    <div className="kd-stapel-aktionen">
      <button style={btnStyle(true)} onClick={() => kameraRef.current?.click()}>Foto aufnehmen</button>
      <button style={btnStyle(false)} onClick={() => bilderRef.current?.click()}>Bilder wählen</button>
    </div>
    {bilder.length > 0 && <>
      <div className="kd-stapel-bilder">{bilder.map((b, i) => <figure key={b.name + i}>
        <img src={b.preview} alt="" /><button aria-label={`${b.name} entfernen`} onClick={() => setBilder((alt) => alt.filter((_, x) => x !== i))}>×</button>
      </figure>)}</div>
      <p className="kd-stapel-kosten">{bilder.length} von {STAPEL_MAX_BILDER} Bildern · ca. {tokenSchaetzung.toLocaleString("de-AT")} Bild-Token · {(requestBytes / 1024).toFixed(0)} KB. Höchstens 4 US-Cent, keine automatische Wiederholung; die tatsächliche Nutzung zählt zu deinem KI-Kontingent.</p>
      {kiAktiv ? <button style={btnStyle(true)} disabled={laeuft} onClick={internAuswerten}>{laeuft ? "KI liest die Bilder …" : `${bilder.length} Bild${bilder.length === 1 ? "" : "er"} kostenpflichtig auswerten`}</button>
        : <p className="kd-stapel-hinweis">Die App-KI ist hier ausgeschaltet oder dein Konto ist nicht KI-fähig. Der externe Weg darunter bleibt verfügbar.</p>}
    </>}

    <details open={externOffen} onToggle={(e) => setExternOffen(e.currentTarget.open)} className="kd-stapel-extern">
      <summary>Extern mit GPT, Claude oder einer anderen KI</summary>
      <p>Dieser Weg verursacht in Kinodreieck keine KI-Kosten. Ein Modell mit gutem Reasoning wird empfohlen: Es fragt dich nach 5–10 kurzen Bewertungen, ordnet Dubletten und erstellt daraus vorsichtige Voreindrücke. Hänge die Bilder im KI-Chat an, kopiere den Prompt und bringe danach das fertige JSON hierher zurück.</p>
      <textarea readOnly value={externerStapelPrompt(autorName)} rows={8} onFocus={(e) => e.target.select()} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
      <div className="kd-stapel-aktionen"><button style={btnStyle(false)} onClick={kopierePrompt}>{kopiert ? "✓ Kopiert" : "Prompt kopieren"}</button><button style={btnStyle(false)} onClick={() => jsonRef.current?.click()}>JSON-Datei wählen</button></div>
      <textarea value={externText} onChange={(e) => setExternText(e.target.value)} rows={4} placeholder="JSON-Antwort hier einfügen …" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
      <button style={btnStyle(false)} disabled={!externText.trim()} onClick={() => ladeExtern(externText)}>Antwort prüfen</button>
    </details>

    {vorschau && <section className="kd-stapel-vorschau">
      <h3>Vorschau – noch ist nichts gespeichert</h3>
      {Number.isFinite(vorschau.kostenUsdCent) && <p className="kd-stapel-kosten">Dieser Lauf hat {Number(vorschau.kostenUsdCent).toLocaleString("de-AT", { maximumFractionDigits: 4 })} US-Cent verbraucht.</p>}
      {vorschau.warnungen.map((w, i) => <p className="kd-stapel-warnung" key={i}>{w}</p>)}
      {vorschau.kandidaten.map((k) => <div className="kd-stapel-kandidat" key={k.id}>
        <label className="kd-stapel-titel"><input type="checkbox" checked={k.ausgewaehlt} onChange={(e) => aktualisiere(k.id, "ausgewaehlt", e.target.checked)} /><span><strong>{k.titel}</strong>{k.jahr ? ` (${k.jahr})` : ""}<small>{k.typ} · Sicherheit {k.sicherheit}{k.vorbeurteilung !== "offen" ? ` · Voreindruck: ${k.vorbeurteilung === "passt" ? "passt" : "eher nicht"}` : ""}{k.begruendung ? ` · ${k.begruendung}` : ""}</small></span></label>
        <div className="kd-stapel-felder"><select aria-label={`Typ für ${k.titel}`} value={k.typ} onChange={(e) => aktualisiere(k.id, "typ", e.target.value)}>{STAPEL_TYPEN.map((t) => <option key={t}>{t}</option>)}</select><select aria-label={`Quelle für ${k.titel}`} value={k.quelle} onChange={(e) => aktualisiere(k.id, "quelle", e.target.value)}>{STAPEL_QUELLEN.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>{k.typ === "serie" && <input aria-label={`Staffeln für ${k.titel}`} placeholder="Staffeln optional, z. B. 1–3" value={k.staffeln || ""} onChange={(e) => aktualisiere(k.id, "staffeln", e.target.value)} />}</div>
        {k.vorhandenMediathek && <small className="kd-stapel-dublette">Schon in der Mediathek – wird übersprungen.</small>}
      </div>)}
      <div className="kd-stapel-aktionen"><button style={btnStyle(true)} onClick={uebernehmen}>Auswahl übernehmen</button><button style={btnStyle(false)} onClick={() => setVorschau(null)}>Verwerfen</button></div>
    </section>}
    {bericht && <p className="kd-stapel-bericht" role="status">Übernommen: {bericht.filme} neue Einträge in die Mediathek.</p>}
  </div>;
}
