import { useEffect, useRef, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { RICHTUNGEN } from "../lib/profil.js";
import { ausSchlagwort } from "../lib/geschmack.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";
import { IconClose, IconDelete } from "./ui.jsx";

const RICHTUNG_WORT = { zieht_an: "mag", stoesst_ab: "meidet", ambivalent: "zwiespältig zu" };
const RICHTUNG_FARBE = { zieht_an: "ok", stoesst_ab: "gefahr", ambivalent: "rauch" };

function herkunft(s) {
  if (s.quelle === "korrektur") return "von dir korrigiert";
  if (ausSchlagwort(s)) return "von dir angekreuzt";
  if (s.quelle === "filmwahl") return "aus deiner Filmauswahl";
  if (s.quelle === "bewertung") return "aus deinen Bewertungen";
  if (["K1", "K2", "K4", "vertiefung"].includes(s.quelle)) return "aus deinen Antworten";
  if (s.quelle === "prognose") return "aus einer Prognose-Reaktion";
  return "Quelle: " + String(s.quelle || "unbekannt");
}

function profilEindruck(signale, filme, achsText) {
  const mag = signale.filter((s) => s.richtung === "zieht_an").slice(0, 3).map((s) => s.wert);
  const meidet = signale.filter((s) => s.richtung === "stoesst_ab").slice(0, 2).map((s) => s.wert);
  const teile = [];
  if (mag.length) teile.push("zieht dich zu " + mag.join(", "));
  if (meidet.length) teile.push("hält eher Abstand von " + meidet.join(", "));
  if (achsText.length) teile.push("deine Tendenzen liegen bei " + achsText.join(", "));
  if (!teile.length && filme.length) teile.push("orientiert sich derzeit vor allem an deiner Filmauswahl");
  return teile.length
    ? "Dein bisheriges Profil " + teile.join(" und ") + "."
    : "Dein Profil ist angelegt, braucht aber noch ein paar konkrete Angaben für einen belastbaren Eindruck.";
}

function SignalZeile({ s, index, onRichtungAendern, onEntfernen }) {
  return (
    <div className="kd-profil-signal" style={{ padding: "10px 0", borderBottom: "1px solid " + T.saal }}>
      <span className="kd-profil-richtung" style={{ color: T[RICHTUNG_FARBE[s.richtung]] || T.rauch, fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
        {RICHTUNG_WORT[s.richtung] || s.richtung}
      </span>
      <span className="kd-profil-wert" style={{ color: T.leinwand, fontSize: 14 }}>{s.wert} <small style={{ color: T.rauch }}>({s.art})</small></span>
      <span className="kd-profil-herkunft" style={{ color: T.rauch, fontSize: 11 }}>{herkunft(s)}</span>
      <select className="kd-profil-richtungwahl" aria-label={"Richtung für " + s.wert}
        value={s.richtung} onChange={(e) => onRichtungAendern?.(index, e.target.value)}
        style={{ background: T.saal, color: T.leinwand, border: "1px solid " + T.rauch, borderRadius: 4, fontSize: 12, padding: "5px 7px" }}>
        {RICHTUNGEN.map((r) => <option key={r} value={r}>{RICHTUNG_WORT[r]}</option>)}
      </select>
      <button className="kd-profil-entfernen" style={{ ...btnStyle(false), width: 32, minWidth: 32, padding: 0, color: T.gefahr, borderColor: T.gefahr }}
        onClick={() => onEntfernen?.(index)} aria-label={"„" + RICHTUNG_WORT[s.richtung] + " " + s.wert + "“ entfernen"} title="Angabe entfernen">
        <IconDelete size={14} />
      </button>
    </div>
  );
}

function InfoGruppe({ titel, offen = false, children, leer }) {
  return (
    <details className="kd-profil-infogruppe" open={offen}>
      <summary>{titel}</summary>
      <div>{leer ? <p className="kd-profil-leer">Noch keine Angaben.</p> : children}</div>
    </details>
  );
}

function AendernPopup({
  signale, filme, nichtDeutbar, achsText, offen, kiWegOffen,
  onClose, onNeuErheben, onKiErheben, onRichtungAendern, onEntfernen, onNichtDeutbarEntfernen,
}) {
  const ref = useRef(null);
  const [infosOffen, setInfosOffen] = useState(false);
  useEffect(() => {
    if (!offen) return undefined;
    const entsperren = sperreDokumentScroll();
    ref.current?.querySelector("button")?.focus();
    const taste = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", taste);
    return () => { entsperren(); document.removeEventListener("keydown", taste); };
  }, [offen, onClose]);
  if (!offen) return null;

  const mag = signale.map((s, index) => ({ s, index })).filter(({ s }) => s.richtung === "zieht_an");
  const meidet = signale.map((s, index) => ({ s, index })).filter(({ s }) => s.richtung === "stoesst_ab");
  const ambivalent = signale.map((s, index) => ({ s, index })).filter(({ s }) => s.richtung === "ambivalent");
  const zeilen = (liste) => liste.map(({ s, index }) => <SignalZeile key={(s.beleg || s.wert) + index} s={s} index={index} onRichtungAendern={onRichtungAendern} onEntfernen={onEntfernen} />);

  return (
    <div className="kd-profil-dialog-layer" role="presentation">
      <button className="kd-profil-dialog-scrim" aria-label="Profilfenster schließen" onClick={onClose} />
      <section ref={ref} className="kd-profil-dialog" role="dialog" aria-modal="true" aria-labelledby="kd-profil-dialog-titel">
        <header>
          <div><span>Geschmacksprofil</span><h3 id="kd-profil-dialog-titel">Ändern</h3></div>
          <button className="kd-profil-dialog-schliessen" aria-label="Schließen" onClick={onClose}><IconClose size={18} /></button>
        </header>
        <div className="kd-profil-wege">
          <button style={btnStyle(true)} onClick={() => { onClose(); onNeuErheben?.(); }}>Weitere Angaben machen</button>
          {kiWegOffen && <button style={btnStyle(false)} onClick={() => { onClose(); onKiErheben?.(); }}>Drei Fragen beantworten</button>}
          <button style={btnStyle(false)} aria-expanded={infosOffen} onClick={() => setInfosOffen((v) => !v)}>Aktuelle Infos</button>
        </div>
        {infosOffen && (
          <div className="kd-profil-infos">
            <InfoGruppe titel={`Mag (${mag.length})`} offen leer={!mag.length}>{zeilen(mag)}</InfoGruppe>
            <InfoGruppe titel={`Meidet (${meidet.length})`} leer={!meidet.length}>{zeilen(meidet)}</InfoGruppe>
            <InfoGruppe titel="Tendenzen" leer={!achsText.length && !ambivalent.length && !nichtDeutbar.length}>
              {achsText.length > 0 && <p className="kd-profil-tendenz">Achsen-Tendenz: {achsText.join(", ")} (von 5)</p>}
              {zeilen(ambivalent)}
              {nichtDeutbar.length > 0 && <div className="kd-profil-unklar"><strong>Nicht gedeutet:</strong>{nichtDeutbar.map((eintrag, index) => (
                <div key={eintrag + index}><span>{eintrag}</span><button aria-label={"„" + eintrag + "“ entfernen"} title="Angabe entfernen" onClick={() => onNichtDeutbarEntfernen?.(index)}><IconDelete size={13} /></button></div>
              ))}</div>}
            </InfoGruppe>
            <InfoGruppe titel={`Filme (${filme.length})`} leer={!filme.length}>
              <ul>{filme.map((f, i) => <li key={(f.masterId || f.titel) + i}>{f.richtung === "stoesst_ab" ? "− " : f.richtung === "zieht_an" ? "+ " : ""}{f.titel}</li>)}</ul>
            </InfoGruppe>
          </div>
        )}
      </section>
    </div>
  );
}

export function ProfilAnsicht({
  profil, kiGeraeteweiseAus = false, onRichtungAendern, onEntfernen,
  onNichtDeutbarEntfernen, onWiderrufen, onNeuErheben, kiWegOffen = false, onKiErheben,
}) {
  const [widerrufOffen, setWiderrufOffen] = useState(false);
  const [aendernOffen, setAendernOffen] = useState(false);
  const p = { color: T.leinwand, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" };
  const klein = { ...p, color: T.rauch, fontSize: 12 };
  const einwilligung = profil?.einwilligung?.erteilt === true;
  const signale = Array.isArray(profil?.signale) ? profil.signale : [];
  const offen = Array.isArray(profil?.offen) ? profil.offen : [];
  const filme = Array.isArray(profil?.filme) ? profil.filme : [];
  const nichtDeutbar = Array.isArray(profil?.nichtDeutbar) ? profil.nichtDeutbar : [];
  const achsen = profil?.achsen || {};
  const achsText = ["wie", "was", "warum"].filter((a) => Number.isInteger(achsen[a])).map((a) => a.toUpperCase() + " " + achsen[a]);

  if (!einwilligung) return (
    <div>
      <p style={p}>Du hast noch kein Geschmacksprofil. Kinodreieck merkt sich dann nichts über deinen Geschmack — Suche, Sammlung und Bewertungen funktionieren unverändert.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={btnStyle(true)} onClick={() => onNeuErheben?.()}>Profil anlegen</button>
        {kiWegOffen && <button style={btnStyle(false)} onClick={() => onKiErheben?.()}>Mit drei Fragen anlegen</button>}
      </div>
    </div>
  );

  return (
    <div>
      {kiGeraeteweiseAus && <p style={{ ...klein, background: T.saal, borderRadius: 6, padding: "10px 12px" }}>Dein Profil ist angelegt und bleibt erhalten. Auf diesem Gerät steht der KI-Schalter allerdings auf „aus“ — hier wirkt es deshalb gerade nicht. Auf anderen Geräten und sobald du KI einschaltest, wird es verwendet.</p>}
      <div className="kd-profil-eindruck">
        <span>KI-Eindruck aus deinen Angaben</span>
        <p>{profilEindruck(signale, filme, achsText)}</p>
      </div>
      <p style={klein}>Fassung {profil.version || "p0"}{profil.geaendert ? " · zuletzt geändert " + String(profil.geaendert).slice(0, 10) : ""}{" · "}{signale.length} bestätigte {signale.length === 1 ? "Angabe" : "Angaben"}</p>
      {signale.length === 0 && <p style={p}>Im Profil steht noch nichts Bestätigtes.</p>}
      {offen.length > 0 && <p style={{ ...klein, color: T.wolfram }}>{offen.length} {offen.length === 1 ? "Vorschlag wartet" : "Vorschläge warten"} auf deine Bestätigung.</p>}
      <div className="kd-profil-hauptaktionen">
        <button style={btnStyle(true)} onClick={() => setAendernOffen(true)}>Ändern</button>
        <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => setWiderrufOffen((v) => !v)}>Einwilligung widerrufen</button>
      </div>
      {widerrufOffen && <div style={{ background: T.saal, borderRadius: 6, padding: "12px 14px", marginTop: 12 }}>
        <p style={{ ...p, margin: "0 0 10px" }}>Das löscht dein Geschmacksprofil vollständig — alle {signale.length} bestätigten Angaben, offene Vorschläge, Filme, Achsen und nicht gedeuteten Angaben. Deine Bewertungen, deine Sammlung und alles andere bleiben unberührt.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }} onClick={() => { setWiderrufOffen(false); onWiderrufen?.(); }}>Ja, Profil löschen</button>
          <button style={btnStyle(false)} onClick={() => setWiderrufOffen(false)}>Abbrechen</button>
        </div>
      </div>}
      <AendernPopup offen={aendernOffen} onClose={() => setAendernOffen(false)} signale={signale} filme={filme} nichtDeutbar={nichtDeutbar} achsText={achsText}
        kiWegOffen={kiWegOffen} onNeuErheben={onNeuErheben} onKiErheben={onKiErheben}
        onRichtungAendern={onRichtungAendern} onEntfernen={onEntfernen} onNichtDeutbarEntfernen={onNichtDeutbarEntfernen} />
    </div>
  );
}
