import { useEffect, useMemo, useRef, useState } from "react";
import {
  WOCHENTAGE, automatischeReminderRef, datumLokal,
  mediathekEintragAusReminder, neuerFolgenReminder, normalisiereWochenplan,
  reminderVerknuepfungsOptionen, wochentagFuerDatum, wochenansicht,
} from "../lib/wochenplan.js";
import {
  dateinameIcs, erstelleIcs, kalenderEventAusWochenEintrag, ladeIcsHerunter,
  reminderIcsEvent, wocheAlsIcs,
} from "../lib/kalenderExport.js";
import { formatPresentationDate } from "../lib/presentationDate.js";

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
    startdatum: datumLokal(jetzt), uhrzeit: "", jahr: "", ende: { typ: "nie" }, notiz: "", ref: null,
    link_modus: "auto",
  };
}

function entwurfFuerDatum(iso) {
  return leererEntwurf(new Date(`${iso}T12:00:00`));
}

function ohneVorschlaege(tage) {
  return tage.map((tag) => ({ ...tag, eintraege: tag.eintraege.filter((eintrag) => !eintrag.vorschlag) }));
}

function refKennung(ref) {
  if (!ref || typeof ref !== "object") return "";
  if (ref.kino_programm_id != null) return `kino:${ref.kino_programm_id}`;
  if (ref.watchmode_id != null) return `streaming:${ref.watchmode_id}`;
  if (ref.master_id != null) return `master:${ref.master_id}`;
  if (ref.url) return `url:${ref.url}`;
  return "";
}

function refBereich(ref) {
  if (ref?.kino_programm_id != null) return "Kinoprogramm";
  if (ref?.watchmode_id != null) return "Streaming";
  if (ref?.master_id != null) return "Mediathek";
  if (ref?.url) return "externer Link";
  return "Eintrag";
}

function ReminderEditor({
  initial, onSpeichern, onAbbrechen, kinoKatalog, katalog, master,
  onStreamingKatalogLaden, speichert = false,
}) {
  const [entwurf, setEntwurf] = useState(() => ({ ...leererEntwurf(), ...initial, ende: { typ: "nie", ...(initial?.ende || {}) } }));
  const [katalogSucheLaeuft, setKatalogSucheLaeuft] = useState(false);
  const zeigtUhrzeit = ARTEN_MIT_UHRZEIT.has(entwurf.art);
  const verknuepfungsOptionen = useMemo(() => reminderVerknuepfungsOptionen(
    entwurf, { kinoKatalog, katalog, master },
  ), [entwurf, kinoKatalog, katalog, master]);
  const ausgewaehlteKennung = refKennung(entwurf.ref);
  const ausgewaehlteOption = verknuepfungsOptionen
    .find((option) => refKennung(option.ref) === ausgewaehlteKennung) || null;
  const automatischeOption = !ausgewaehlteKennung && entwurf.link_modus === "auto"
    && verknuepfungsOptionen.length === 1 ? verknuepfungsOptionen[0] : null;
  useEffect(() => {
    if (entwurf.art !== "folge" && entwurf.art !== "staffel") return undefined;
    let aktiv = true;
    setKatalogSucheLaeuft(true);
    Promise.resolve(onStreamingKatalogLaden?.(true))
      .catch(() => {})
      .finally(() => { if (aktiv) setKatalogSucheLaeuft(false); });
    return () => { aktiv = false; };
  }, [entwurf.art, onStreamingKatalogLaden]);

  const setze = (key, value) => setEntwurf((e) => ({
    ...e,
    [key]: value,
    ...(["titel", "plattform", "art", "jahr"].includes(key) ? {
      ref: null,
      /* Eine bewusst gelöste Verknüpfung bleibt gesperrt. Bei einem neuen
         Entwurf oder einer zuvor verknüpften Quelle darf der geänderte Titel
         dagegen beim Speichern wieder exakt automatisch geprüft werden. */
      link_modus: e.link_modus === "keiner" ? "keiner" : "auto",
    } : {}),
  }));
  const setzeStartdatum = (startdatum) => setEntwurf((e) => {
    const wochentag = wochentagFuerDatum(startdatum);
    return { ...e, startdatum, ...(wochentag ? { wochentage: [wochentag] } : {}) };
  });
  const tagToggle = (nr) => setEntwurf((e) => {
    const drin = e.wochentage.includes(nr);
    const next = drin ? e.wochentage.filter((x) => x !== nr) : [...e.wochentage, nr];
    return { ...e, wochentage: next.length ? next.sort((a, b) => a - b) : [nr] };
  });

  const speichern = async (event) => {
    event.preventDefault();
    if (speichert) return;
    let ref = entwurf.ref && typeof entwurf.ref === "object" ? { ...entwurf.ref } : null;
    if (ref) delete ref.url;
    if (ref && !Object.keys(ref).length) ref = null;
    await onSpeichern({ ...entwurf, uhrzeit: zeigtUhrzeit ? entwurf.uhrzeit : "", ref, link_modus: entwurf.link_modus });
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
        {(entwurf.art === "folge" || entwurf.art === "staffel") && <label>Jahr (für Titelanlage)<input type="number" min="1870" max={new Date().getFullYear() + 5} step="1" value={entwurf.jahr ?? ""} onChange={(e) => setze("jahr", e.target.value)} placeholder="optional" /></label>}
        <label className="kd-wochen-datumfeld">Datum<input type="date" required value={entwurf.startdatum} onChange={(e) => setzeStartdatum(e.target.value)} /></label>
        {zeigtUhrzeit && <label className="kd-wochen-zeitfeld">Uhrzeit (optional)<input type="time" value={entwurf.uhrzeit} onChange={(e) => setze("uhrzeit", e.target.value)} /></label>}
      </div>
      {ausgewaehlteKennung && (
        <div className="kd-wochen-verknuepfungsstatus">
          <span>{ausgewaehlteOption
            ? `${entwurf.link_modus === "auto" ? "Automatisch verknüpft" : "Verknüpft"}: ${ausgewaehlteOption.titel} · ${refBereich(entwurf.ref)}`
            : `Gespeicherte Verknüpfung: ${entwurf.titel} · ${refBereich(entwurf.ref)} (Ziel derzeit nicht verfügbar)`}</span>
          <button type="button" onClick={() => setEntwurf((e) => ({ ...e, ref: null, link_modus: "keiner" }))}>Verknüpfung lösen</button>
        </div>
      )}
      {automatischeOption && (
        <div className="kd-wochen-verknuepfungsstatus">
          <span>Wird automatisch verknüpft: {automatischeOption.titel} · {refBereich(automatischeOption.ref)}</span>
          <button type="button" onClick={() => setEntwurf((e) => ({ ...e, ref: null, link_modus: "keiner" }))}>Nicht verknüpfen</button>
        </div>
      )}
      {(verknuepfungsOptionen.length > 1
        || (!ausgewaehlteKennung && entwurf.link_modus === "keiner" && verknuepfungsOptionen.length > 0)) && (
        <fieldset className="kd-wochen-verknuepfung">
          <legend>Passenden Eintrag wählen (optional)</legend>
          <label>
            <input type="radio" name="wochen-verknuepfung" checked={!ausgewaehlteKennung}
              onChange={() => setEntwurf((e) => ({ ...e, ref: null, link_modus: "keiner" }))} />
            <span><strong>Nicht verknüpfen</strong><small>Der Kalendereintrag bleibt trotzdem erhalten.</small></span>
          </label>
          {verknuepfungsOptionen.map((option) => (
            <label key={option.key}>
              <input type="radio" name="wochen-verknuepfung"
                checked={ausgewaehlteKennung === refKennung(option.ref)}
                onChange={() => setEntwurf((e) => ({ ...e, ref: option.ref, link_modus: "manuell" }))} />
              <span><strong>{option.titel}</strong>{option.meta && <small>{option.meta}</small>}</span>
            </label>
          ))}
        </fieldset>
      )}
      {katalogSucheLaeuft && <div className="kd-wochen-verknuepfungsstatus" role="status">Streaming-Titel werden abgeglichen …</div>}
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
      <div className="kd-wochen-editoraktionen"><button type="submit" className="kd-wochen-primary" disabled={katalogSucheLaeuft || speichert}>{katalogSucheLaeuft ? "Suche …" : (speichert ? "Speichert …" : "Speichern")}</button><button type="button" disabled={speichert} onClick={onAbbrechen}>Abbrechen</button></div>
    </form>
  );
}

function ReminderZeile({
  eintrag, datum, onBearbeiten, onLoeschen, onAnsehen, onAnlegen,
  onVerknuepfungLoesen, onVorschlagAnsehen, anlegenLauf,
}) {
  const zielVorhanden = !!eintrag.ziel;
  const istKinoPin = eintrag.art === "kino" && !!eintrag.pin;
  const istVorschlag = !!eintrag.vorschlag;
  const istBeobachtetProjektion = eintrag.abgeleitet === "beobachtet";
  const istFolgeOderStaffel = eintrag.art === "folge" || eintrag.art === "staffel";
  const hatAnlageJahr = Number.isInteger(eintrag.jahr);
  const meta = [ART_LABEL[eintrag.art] || "Termin", eintrag.jahr, eintrag.plattform, eintrag.uhrzeit].filter(Boolean).join(" · ");
  const terminSpeichern = (event) => {
    event.preventDefault();
    event.stopPropagation();
    kalenderDownload(erstelleIcs([kalenderEventAusWochenEintrag(eintrag, datum)]), `${eintrag.titel}-${datum}`);
  };
  return (
    <details className={`kd-wochen-eintrag kd-wochen-eintrag--${eintrag.art}${istVorschlag ? " kd-wochen-eintrag--vorschlag" : ""}${istBeobachtetProjektion ? " kd-wochen-eintrag--beobachtet" : ""}`}>
      <summary><span className="kd-wochen-eintragtitel">{eintrag.titel}</span><span className="kd-wochen-eintragmeta">{istVorschlag && <em>Empfehlung</em>}{istBeobachtetProjektion && <em>Beobachtet</em>}{meta}</span><button type="button" className="kd-wochen-eintrag-download" title="Diesen Termin im Kalender speichern" aria-label={`${eintrag.titel} am ${datumKurz(datum)} im Kalender speichern`} onClick={terminSpeichern}><KalenderIcon /></button><span className="kd-wochen-expandicon"><ChevronIcon /></span></summary>
      <div className="kd-wochen-details">
        {eintrag.folgenstand && <div className="kd-wochen-folgenstand">{eintrag.folgenstand}</div>}
        {istBeobachtetProjektion && <div className="kd-wochen-verknuepfungsstatus">Aus deiner Beobachtet-Liste · Katalogstand geprüft {formatPresentationDate(eintrag.geprueft_am, { includeTime: true })}</div>}
        {!istBeobachtetProjektion && eintrag.ziel && eintrag.ref && <div className="kd-wochen-verknuepfungsstatus">{eintrag.link_modus === "auto" ? "Automatisch verknüpft" : "Verknüpft"}: {eintrag.quelle?.titel || eintrag.titel} · {refBereich(eintrag.ref)}</div>}
        {eintrag.verknuepfungFehlt && <div className="kd-wochen-verknuepfungsstatus" role="status">Verknüpfung derzeit nicht verfügbar.</div>}
        {eintrag.notiz && <div>{eintrag.notiz}</div>}
        <div className="kd-wochen-aktionen">
          {(istVorschlag || istKinoPin) && onVorschlagAnsehen && <button type="button" className="kd-wochen-vorschlagaktion" onClick={() => onVorschlagAnsehen(eintrag)}>{istVorschlag ? "Termine ansehen" : "Termin ansehen"}</button>}
          {!istKinoPin && !istVorschlag && zielVorhanden && <button type="button" onClick={() => onAnsehen(eintrag)}>Eintrag ansehen</button>}
          {!istKinoPin && !istVorschlag && !istBeobachtetProjektion && !zielVorhanden && !eintrag.verknuepfungFehlt && istFolgeOderStaffel && (hatAnlageJahr
            ? <button type="button" disabled={!!anlegenLauf} onClick={() => onAnlegen(eintrag)}>{anlegenLauf === eintrag.id ? "Legt an …" : "Titel anlegen"}</button>
            : <button type="button" onClick={() => onBearbeiten(eintrag)}>Jahr ergänzen</button>)}
          {!istKinoPin && !istVorschlag && !istBeobachtetProjektion && eintrag.ref && <button type="button" onClick={() => onVerknuepfungLoesen(eintrag)}>Verknüpfung lösen</button>}
          {!istKinoPin && !istVorschlag && !istBeobachtetProjektion && <button type="button" onClick={() => onBearbeiten(eintrag)}>Bearbeiten</button>}
          {!istKinoPin && !istVorschlag && !istBeobachtetProjektion && <button type="button" title="Alle Wiederholungen exportieren" onClick={() => kalenderDownload(erstelleIcs([reminderIcsEvent(eintrag)]), `${eintrag.titel}-termine`)}><KalenderIcon /> Alle</button>}
          {!istVorschlag && !istBeobachtetProjektion && <button type="button" className="kd-wochen-trash" title="Löschen" aria-label={`${eintrag.titel} löschen`} onClick={() => onLoeschen(eintrag)}><PapierkorbIcon /></button>}
        </div>
      </div>
    </details>
  );
}

export function Wochenplan({
  plan, onPlanAendern, kinoPins = [], kinoVorschlaege = [], onKinoPinLoeschen, onKinoVorschlagAnsehen,
  kinoKatalog = [], katalog = [], master = [], entdeckenStatus = {},
  onSpringeZuFilm, onSpringeZuStreaming, onFilmAnlegen, onStreamingKatalogLaden,
}) {
  const [jetzt, setJetzt] = useState(() => new Date());
  const [editor, setEditor] = useState(null);
  const [anlegenLauf, setAnlegenLauf] = useState(null);
  const anlegenLaufRef = useRef(false);
  const [planSchreibt, setPlanSchreibt] = useState(false);
  const planSchreibtRef = useRef(false);
  useEffect(() => {
    const aktualisieren = () => setJetzt(new Date());
    const timer = setInterval(aktualisieren, 60000);
    window.addEventListener("focus", aktualisieren);
    return () => { clearInterval(timer); window.removeEventListener("focus", aktualisieren); };
  }, []);

  const tage = useMemo(() => wochenansicht({
    wochenplan: plan, kinoPins, kinoVorschlaege, kinoKatalog, katalog, master, entdeckenStatus, jetzt,
  }), [plan, kinoPins, kinoVorschlaege, kinoKatalog, katalog, master, entdeckenStatus, jetzt]);

  const schreibePlan = async (next, schliesseEditor = false) => {
    if (planSchreibtRef.current) return false;
    planSchreibtRef.current = true;
    setPlanSchreibt(true);
    try {
      const bestaetigt = await onPlanAendern(next);
      if (bestaetigt === false || bestaetigt == null) return false;
      if (schliesseEditor) setEditor(null);
      return true;
    } catch { return false; }
    finally { planSchreibtRef.current = false; setPlanSchreibt(false); }
  };
  const speichere = async (roh) => {
    if (planSchreibtRef.current) return false;
    const ref = roh.ref || (roh.link_modus === "keiner"
      ? null
      : automatischeReminderRef({ ...roh, ref: null }, { kinoKatalog, katalog, master }, jetzt));
    const e = neuerFolgenReminder({
      ...roh,
      ref,
      link_modus: ref ? (ref.auto ? "auto" : "manuell") : "keiner",
      id: roh.id || undefined,
      erstellt_am: roh.erstellt_am,
    }, jetzt);
    const aktuell = normalisiereWochenplan(plan, jetzt).eintraege;
    const next = aktuell.some((x) => x.id === e.id) ? aktuell.map((x) => x.id === e.id ? e : x) : [...aktuell, e];
    return schreibePlan({ version: 1, eintraege: next }, true);
  };
  const loesche = async (eintrag) => {
    if (eintrag.abgeleitet === "beobachtet") return;
    if (eintrag.art === "kino" && eintrag.pin) { onKinoPinLoeschen?.(eintrag.pin); return; }
    if (!window.confirm(`„${eintrag.titel}“ aus deinem Wochenplan löschen?`)) return;
    await schreibePlan({
      version: 1,
      eintraege: normalisiereWochenplan(plan).eintraege.filter((e) => e.id !== eintrag.id),
    });
  };
  const ansehen = (e) => {
    if (e.ziel?.art === "mediathek") onSpringeZuFilm?.(e.ziel.ref);
    else if (e.ziel?.art === "streaming") onSpringeZuStreaming?.({ art: e.ziel.bereich || "entdecken", ref: e.ziel.ref, titel: e.titel });
    else if (e.ziel?.art === "kino") onKinoVorschlagAnsehen?.({ ...e, programm_ref: e.ziel.ref });
    else if (e.ziel?.art === "extern") window.open(e.ziel.url, "_blank", "noopener,noreferrer");
  };
  const anlegen = async (e) => {
    if (anlegenLaufRef.current) return;
    const kandidat = mediathekEintragAusReminder(e, jetzt);
    if (!kandidat) { oeffneEditor(e); return; }
    anlegenLaufRef.current = true; setAnlegenLauf(e.id);
    try {
      const id = await onFilmAnlegen?.(kandidat);
      if (typeof id !== "string" || !id) return;
      return await speichere({ ...e, ref: { ...(e.ref || {}), master_id: id } });
    } finally { anlegenLaufRef.current = false; setAnlegenLauf(null); }
  };
  const loeseVerknuepfung = (e) => speichere({ ...e, ref: null, link_modus: "keiner" });
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

      {editor && <ReminderEditor key={editor.id || `neu-${editor.startdatum}`} initial={editor}
        kinoKatalog={kinoKatalog} katalog={katalog} master={master}
        onStreamingKatalogLaden={onStreamingKatalogLaden}
        onSpeichern={speichere} speichert={planSchreibt} onAbbrechen={() => setEditor(null)} />}

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
              {tag.eintraege.length ? tag.eintraege.map((e) => <ReminderZeile key={e.id} eintrag={e} datum={tag.iso} onBearbeiten={oeffneEditor} onLoeschen={loesche} onAnsehen={ansehen} onAnlegen={anlegen} anlegenLauf={anlegenLauf} onVerknuepfungLoesen={loeseVerknuepfung} onVorschlagAnsehen={onKinoVorschlagAnsehen} />) : <span className="kd-wochen-frei">Noch frei</span>}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
