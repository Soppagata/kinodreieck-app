import { useEffect, useMemo, useState } from "react";
import {
  WOCHENTAGE, datumLokal,
  neuerFolgenReminder, normalisiereWochenplan,
  wochenansicht,
} from "../lib/wochenplan.js";
import {
  dateinameIcs, erstelleIcs, kalenderEventAusWochenEintrag, ladeIcsHerunter,
  reminderIcsEvent, wocheAlsIcs,
} from "../lib/kalenderExport.js";

function datumKurz(wert) {
  return new Date(`${wert}T12:00:00`).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
}

function tageszahl(wert) {
  return new Date(`${wert}T12:00:00`).toLocaleDateString("de-AT", { day: "2-digit" });
}

function kalenderDownload(inhalt, name) {
  try { ladeIcsHerunter(inhalt, dateinameIcs(name)); } catch { /* Browser-Download bleibt best effort. */ }
}

function KalenderIcon({ className = "" }) {
  return (
    <svg className={`kd-wochen-icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.25 3.75h11.5A2.25 2.25 0 0 1 20 6v12.25a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2.25 2.25 0 0 1 2.25-2.25Z" />
      <path d="M8 2.5v3M16 2.5v3M4 8.25h16M8 12h2.25M13.75 12H16M8 16h2.25M13.75 16H16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="kd-wochen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PapierkorbIcon() {
  return (
    <svg className="kd-wochen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5.5 7.5h13M9 7.5V5.25h6V7.5M7.25 7.5l.8 12h7.9l.8-12M10 11v5M14 11v5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="kd-wochen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m7 9.5 5 5 5-5" />
    </svg>
  );
}

const ARTEN_MIT_UHRZEIT = new Set(["kino", "termin", "konzert"]);
const ART_LABEL = Object.freeze({ folge: "Folge", staffel: "Staffel", kino: "Kino", termin: "Termin", konzert: "Konzert" });

function leererEntwurf(jetzt = new Date()) {
  const tag = jetzt.getDay() || 7;
  return {
    titel: "", plattform: "", art: "termin", wochentage: [tag], intervall_wochen: 1,
    startdatum: datumLokal(jetzt), uhrzeit: "", ende: { typ: "nie" }, notiz: "", ref: null,
  };
}

function entwurfFuerDatum(iso) {
  return leererEntwurf(new Date(`${iso}T12:00:00`));
}

function ohneVorschlaege(tage) {
  return tage.map((tag) => ({ ...tag, eintraege: tag.eintraege.filter((eintrag) => !eintrag.vorschlag) }));
}

function ReminderEditor({ initial, onSpeichern, onAbbrechen }) {
  const [entwurf, setEntwurf] = useState(() => ({ ...leererEntwurf(), ...initial, ende: { typ: "nie", ...(initial?.ende || {}) } }));
  const zeigtUhrzeit = ARTEN_MIT_UHRZEIT.has(entwurf.art);

  const setze = (key, value) => setEntwurf((e) => ({ ...e, [key]: value }));
  const tagToggle = (nr) => setEntwurf((e) => {
    const drin = e.wochentage.includes(nr);
    const next = drin ? e.wochentage.filter((x) => x !== nr) : [...e.wochentage, nr];
    return { ...e, wochentage: next.length ? next.sort((a, b) => a - b) : [nr] };
  });

  const speichern = (event) => {
    event.preventDefault();
    let ref = entwurf.ref && typeof entwurf.ref === "object" ? { ...entwurf.ref } : null;
    if (ref) delete ref.url;
    if (ref && !Object.keys(ref).length) ref = null;
    onSpeichern({ ...entwurf, uhrzeit: zeigtUhrzeit ? entwurf.uhrzeit : "", ref, link_modus: "keiner" });
  };

  return (
    <form id="kd-wochen-editor" className="kd-wochen-editor" onSubmit={speichern}>
      <div className="kd-wochen-editorintro"><KalenderIcon /><div><strong>Eintrag planen</strong><span>{datumKurz(entwurf.startdatum)}</span></div></div>
      <div className="kd-wochen-formgrid">
        <label className="kd-wochen-field--wide">Titel<input autoFocus required value={entwurf.titel} onChange={(e) => setze("titel", e.target.value)} placeholder="Was möchtest du vormerken?" /></label>
        <label className="kd-wochen-field--wide">Ort / Anbieter<input value={entwurf.plattform} onChange={(e) => setze("plattform", e.target.value)} placeholder="z. B. Gartenbaukino oder Netflix" /></label>
        <label>Art<select value={entwurf.art} onChange={(e) => setze("art", e.target.value)}><option value="termin">Termin</option><option value="kino">Kino</option><option value="konzert">Konzert</option><option value="folge">Folge</option><option value="staffel">Staffel</option></select></label>
        <label>Rhythmus<select value={entwurf.intervall_wochen} onChange={(e) => setze("intervall_wochen", Number(e.target.value))}>
          <option value="1">jede Woche</option><option value="2">alle 2 Wochen</option><option value="3">alle 3 Wochen</option><option value="4">alle 4 Wochen</option>
        </select></label>
        <label className="kd-wochen-datumfeld">Datum<input type="date" required value={entwurf.startdatum} onChange={(e) => setze("startdatum", e.target.value)} /></label>
        {zeigtUhrzeit && <label className="kd-wochen-zeitfeld">Uhrzeit (optional)<input type="time" value={entwurf.uhrzeit} onChange={(e) => setze("uhrzeit", e.target.value)} /></label>}
      </div>
      <fieldset className="kd-wochen-tage"><legend>Wochentage</legend>{WOCHENTAGE.map((tag) => (
        <label key={tag.nr}><input type="checkbox" checked={entwurf.wochentage.includes(tag.nr)} onChange={() => tagToggle(tag.nr)} /><span>{tag.kurz}</span></label>
      ))}</fieldset>
      <div className="kd-wochen-formgrid">
        <label>Wiederholen bis<select value={entwurf.ende.typ} onChange={(e) => setze("ende", { typ: e.target.value })}>
          <option value="nie">nie</option><option value="datum">an einem Datum</option><option value="anzahl">nach Terminen</option>
        </select></label>
        {entwurf.ende.typ === "datum" && <label>Enddatum<input type="date" required value={entwurf.ende.datum || ""} onChange={(e) => setze("ende", { typ: "datum", datum: e.target.value })} /></label>}
        {entwurf.ende.typ === "anzahl" && <label>Anzahl Termine<input type="number" min="1" max="999" required value={entwurf.ende.anzahl || 12} onChange={(e) => setze("ende", { typ: "anzahl", anzahl: Number(e.target.value) })} /></label>}
      </div>
      <label>Notiz<textarea rows="2" value={entwurf.notiz} onChange={(e) => setze("notiz", e.target.value)} placeholder="Optional" /></label>
      <div className="kd-wochen-editoraktionen"><button type="submit" className="kd-wochen-primary">Speichern</button><button type="button" onClick={onAbbrechen}>Abbrechen</button></div>
    </form>
  );
}

function ReminderZeile({ eintrag, datum, onBearbeiten, onLoeschen, onAnsehen, onAnlegen, onVorschlagAnsehen }) {
  const zielVorhanden = !!(eintrag.ref?.master_id || eintrag.ref?.watchmode_id || eintrag.ref?.url);
  const istKinoPin = eintrag.art === "kino" && !!eintrag.pin;
  const istVorschlag = !!eintrag.vorschlag;
  const istFolgeOderStaffel = eintrag.art === "folge" || eintrag.art === "staffel";
  const meta = [ART_LABEL[eintrag.art] || "Termin", eintrag.plattform, eintrag.uhrzeit].filter(Boolean).join(" · ");
  const terminSpeichern = (event) => {
    event.preventDefault();
    event.stopPropagation();
    kalenderDownload(erstelleIcs([kalenderEventAusWochenEintrag(eintrag, datum)]), `${eintrag.titel}-${datum}`);
  };
  return (
    <details className={`kd-wochen-eintrag kd-wochen-eintrag--${eintrag.art}${istVorschlag ? " kd-wochen-eintrag--vorschlag" : ""}`}>
      <summary><span className="kd-wochen-eintragtitel">{eintrag.titel}</span><span className="kd-wochen-eintragmeta">{istVorschlag && <em>Empfehlung</em>}{meta}</span><button type="button" className="kd-wochen-eintrag-download" title="Diesen Termin im Kalender speichern" aria-label={`${eintrag.titel} am ${datumKurz(datum)} im Kalender speichern`} onClick={terminSpeichern}><KalenderIcon /></button><span className="kd-wochen-expandicon"><ChevronIcon /></span></summary>
      <div className="kd-wochen-details">
        {eintrag.folgenstand && <div className="kd-wochen-folgenstand">{eintrag.folgenstand}</div>}
        {eintrag.notiz && <div>{eintrag.notiz}</div>}
        <div className="kd-wochen-aktionen">
          {istVorschlag && onVorschlagAnsehen && <button type="button" className="kd-wochen-vorschlagaktion" onClick={() => onVorschlagAnsehen(eintrag)}>Termine ansehen</button>}
          {!istKinoPin && !istVorschlag && zielVorhanden && <button type="button" onClick={() => onAnsehen(eintrag)}>Eintrag ansehen</button>}
          {!istKinoPin && !istVorschlag && !zielVorhanden && istFolgeOderStaffel && <button type="button" onClick={() => onAnlegen(eintrag)}>Titel anlegen</button>}
          {!istKinoPin && !istVorschlag && <button type="button" onClick={() => onBearbeiten(eintrag)}>Bearbeiten</button>}
          {!istKinoPin && !istVorschlag && <button type="button" title="Alle Wiederholungen exportieren" onClick={() => kalenderDownload(erstelleIcs([reminderIcsEvent(eintrag)]), `${eintrag.titel}-termine`)}><KalenderIcon /> Alle</button>}
          {!istVorschlag && <button type="button" className="kd-wochen-trash" title="Löschen" aria-label={`${eintrag.titel} löschen`} onClick={() => onLoeschen(eintrag)}><PapierkorbIcon /></button>}
        </div>
      </div>
    </details>
  );
}

export function Wochenplan({
  plan, onPlanAendern, kinoPins = [], kinoVorschlaege = [], onKinoPinLoeschen, onKinoVorschlagAnsehen,
  katalog = [], master = [],
  onSpringeZuFilm, onSpringeZuStreaming, onFilmAnlegen,
}) {
  const [jetzt, setJetzt] = useState(() => new Date());
  const [editor, setEditor] = useState(null);
  useEffect(() => {
    const aktualisieren = () => setJetzt(new Date());
    const timer = setInterval(aktualisieren, 60000);
    window.addEventListener("focus", aktualisieren);
    return () => { clearInterval(timer); window.removeEventListener("focus", aktualisieren); };
  }, []);

  const tage = useMemo(() => wochenansicht({ wochenplan: plan, kinoPins, kinoVorschlaege, katalog, master, jetzt }), [plan, kinoPins, kinoVorschlaege, katalog, master, jetzt]);

  const speichere = (roh) => {
    const e = neuerFolgenReminder({ ...roh, id: roh.id || undefined, erstellt_am: roh.erstellt_am }, jetzt);
    const aktuell = normalisiereWochenplan(plan, jetzt).eintraege;
    const next = aktuell.some((x) => x.id === e.id) ? aktuell.map((x) => x.id === e.id ? e : x) : [...aktuell, e];
    onPlanAendern({ version: 1, eintraege: next }); setEditor(null);
  };
  const loesche = (eintrag) => {
    if (eintrag.art === "kino" && eintrag.pin) { onKinoPinLoeschen?.(eintrag.pin); return; }
    if (!window.confirm(`„${eintrag.titel}“ aus deinem Wochenplan löschen?`)) return;
    onPlanAendern({ version: 1, eintraege: normalisiereWochenplan(plan).eintraege.filter((e) => e.id !== eintrag.id) });
  };
  const ansehen = (e) => {
    if (e.ref?.master_id) onSpringeZuFilm?.(e.ref.master_id);
    else if (e.ref?.watchmode_id) onSpringeZuStreaming?.({ art: "entdecken", ref: e.ref.watchmode_id, titel: e.titel });
    else if (e.ref?.url) window.open(e.ref.url, "_blank", "noopener,noreferrer");
  };
  const anlegen = (e) => {
    const id = onFilmAnlegen?.({ titel: e.titel, originaltitel: e.titel, typ: "serie", quelle: "must_watch", status: "gesetzt", watchmode_id: e.ref?.watchmode_id });
    if (!id) return;
    speichere({ ...e, ref: { ...(e.ref || {}), master_id: id } });
  };
  const oeffneEditor = (entwurf) => {
    setEditor(entwurf);
    window.requestAnimationFrame(() => document.getElementById("kd-wochen-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <section className="kd-wochenplan" aria-labelledby="deine-woche-titel">
      <header className="kd-wochenplan-kopf">
        <div><span className="kd-wochen-kicker">TERMINE · TITEL · KINO</span><h2 id="deine-woche-titel">Deine Woche</h2></div>
        <div className="kd-wochen-kopfaktionen"><button type="button" onClick={() => oeffneEditor(leererEntwurf(jetzt))}><PlusIcon /> Eintrag</button><button type="button" className="kd-wochen-kalenderknopf" title="Die nächsten 7 Tage in den Kalender setzen" aria-label="Die nächsten 7 Tage in den Kalender setzen" onClick={() => kalenderDownload(wocheAlsIcs(ohneVorschlaege(tage)), `kinodreieck-7-tage-${tage[0].iso}`)}><KalenderIcon /></button></div>
      </header>
      <div className="kd-wochen-zeitraum">Heute bis {datumKurz(tage[6].iso)}</div>

      {editor && <ReminderEditor key={editor.id || `neu-${editor.startdatum}`} initial={editor} onSpeichern={speichere} onAbbrechen={() => setEditor(null)} />}

      <div className="kd-wochen-tagesliste">
        {tage.map((tag) => (
          <section key={tag.iso} className={`kd-wochen-tag ${tag.iso === datumLokal(jetzt) ? "ist-heute" : ""}`}>
            <header>
              <div className="kd-wochen-ticketstub"><b>{tageszahl(tag.iso)}</b><span>{tag.kurz}</span></div>
              <div className="kd-wochen-ticketname"><b>{tag.iso === datumLokal(jetzt) ? "Heute" : tag.name}</b><span>{datumKurz(tag.iso)}</span></div>
              <div className="kd-wochen-tagaktionen">
                <button type="button" className="kd-wochen-tagplus" aria-label={`Eintrag am ${tag.name}, ${datumKurz(tag.iso)} erstellen`} title={`Eintrag am ${datumKurz(tag.iso)} erstellen`} onClick={() => oeffneEditor(entwurfFuerDatum(tag.iso))}><PlusIcon /></button>
              </div>
            </header>
            <div className="kd-wochen-taginhalt">
              {tag.eintraege.length ? tag.eintraege.map((e) => <ReminderZeile key={e.id} eintrag={e} datum={tag.iso} onBearbeiten={oeffneEditor} onLoeschen={loesche} onAnsehen={ansehen} onAnlegen={anlegen} onVorschlagAnsehen={onKinoVorschlagAnsehen} />) : <span className="kd-wochen-frei">Noch frei</span>}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
