import { useEffect, useMemo, useState } from "react";
import {
  WOCHENTAGE, datumLokal, findeReminderVerknuepfung,
  neuerFolgenReminder, normalisiereWochenplan, refAusTreffer,
  wochenansicht,
} from "../lib/wochenplan.js";
import {
  dateinameIcs, erstelleIcs, kalenderEventAusWochenEintrag, ladeIcsHerunter,
  reminderIcsEvent, tagAlsIcs, wocheAlsIcs,
} from "../lib/kalenderExport.js";

function serienKatalog(katalog, master) {
  const map = new Map();
  for (const t of [...(Array.isArray(katalog) ? katalog : []), ...(Array.isArray(master) ? master : [])]) {
    if (!t || !["serie", "tv_series"].includes(t.typ)) continue;
    const key = t.watchmode_id != null ? `w:${t.watchmode_id}` : `m:${t.id}`;
    map.set(key, { ...(map.get(key) || {}), ...t });
  }
  return [...map.values()].sort((a, b) => String(a.titel).localeCompare(String(b.titel), "de"));
}

function datumKurz(wert) {
  return new Date(`${wert}T12:00:00`).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
}

function tageszahl(wert) {
  return new Date(`${wert}T12:00:00`).toLocaleDateString("de-AT", { day: "2-digit" });
}

function kalenderDownload(inhalt, name) {
  try { ladeIcsHerunter(inhalt, dateinameIcs(name)); } catch { /* Browser-Download bleibt best effort. */ }
}

function leererEntwurf(jetzt = new Date()) {
  const tag = jetzt.getDay() || 7;
  return {
    titel: "", plattform: "", art: "folge", wochentage: [tag], intervall_wochen: 1,
    startdatum: datumLokal(jetzt), uhrzeit: "", ende: { typ: "nie" }, notiz: "", ref: null,
  };
}

function ReminderEditor({ initial, serien, onSpeichern, onAbbrechen }) {
  const [entwurf, setEntwurf] = useState(() => ({ ...leererEntwurf(), ...initial, ende: { typ: "nie", ...(initial?.ende || {}) } }));
  const [manuelleRef, setManuelleRef] = useState(() => {
    if (initial?.link_modus === "keiner") return "none";
    if (initial?.link_modus === "auto") return "auto";
    if (initial?.ref?.watchmode_id != null) return `w:${initial.ref.watchmode_id}`;
    if (initial?.ref?.master_id != null) return `m:${initial.ref.master_id}`;
    return "auto";
  });
  const match = useMemo(() => findeReminderVerknuepfung(entwurf, serien), [entwurf, serien]);

  const setze = (key, value) => setEntwurf((e) => ({ ...e, [key]: value }));
  const tagToggle = (nr) => setEntwurf((e) => {
    const drin = e.wochentage.includes(nr);
    const next = drin ? e.wochentage.filter((x) => x !== nr) : [...e.wochentage, nr];
    return { ...e, wochentage: next.length ? next.sort((a, b) => a - b) : [nr] };
  });

  const speichern = (event) => {
    event.preventDefault();
    const externeUrl = entwurf.ref?.url || "";
    let ref = externeUrl ? { url: externeUrl } : null;
    if (manuelleRef !== "auto" && manuelleRef !== "none") {
      const [art, id] = manuelleRef.split(":");
      const t = serien.find((x) => art === "w" ? String(x.watchmode_id) === id : String(x.id) === id);
      ref = { ...(refAusTreffer(t) || {}), ...(externeUrl ? { url: externeUrl } : {}) };
    } else if (manuelleRef === "auto" && match.status === "eindeutig") {
      ref = { ...(refAusTreffer(match.treffer) || {}), ...(externeUrl ? { url: externeUrl } : {}) };
    }
    const linkModus = manuelleRef === "none" ? "keiner" : manuelleRef === "auto" ? "auto" : "manuell";
    onSpeichern({ ...entwurf, ref, link_modus: linkModus });
  };

  return (
    <form className="kd-wochen-editor" onSubmit={speichern}>
      <div className="kd-wochen-formgrid">
        <label>Titel<input required value={entwurf.titel} onChange={(e) => setze("titel", e.target.value)} placeholder="z. B. One Piece" /></label>
        <label>Plattform<input value={entwurf.plattform} onChange={(e) => setze("plattform", e.target.value)} placeholder="z. B. Netflix" /></label>
        <label>Art<select value={entwurf.art} onChange={(e) => setze("art", e.target.value)}><option value="folge">Neue Folge</option><option value="staffel">Neue Staffel</option></select></label>
        <label>Rhythmus<select value={entwurf.intervall_wochen} onChange={(e) => setze("intervall_wochen", Number(e.target.value))}>
          <option value="1">jede Woche</option><option value="2">alle 2 Wochen</option><option value="3">alle 3 Wochen</option><option value="4">alle 4 Wochen</option>
        </select></label>
        <label>Beginn<input type="date" required value={entwurf.startdatum} onChange={(e) => setze("startdatum", e.target.value)} /></label>
        <label>Uhrzeit (optional)<input type="time" value={entwurf.uhrzeit} onChange={(e) => setze("uhrzeit", e.target.value)} /></label>
      </div>
      <fieldset className="kd-wochen-tage"><legend>Wochentage</legend>{WOCHENTAGE.map((tag) => (
        <label key={tag.nr}><input type="checkbox" checked={entwurf.wochentage.includes(tag.nr)} onChange={() => tagToggle(tag.nr)} />{tag.kurz}</label>
      ))}</fieldset>
      <div className="kd-wochen-formgrid">
        <label>Automatisches Ende<select value={entwurf.ende.typ} onChange={(e) => setze("ende", { typ: e.target.value })}>
          <option value="nie">nie</option><option value="datum">an einem Datum</option><option value="anzahl">nach Terminen</option>
        </select></label>
        {entwurf.ende.typ === "datum" && <label>Enddatum<input type="date" required value={entwurf.ende.datum || ""} onChange={(e) => setze("ende", { typ: "datum", datum: e.target.value })} /></label>}
        {entwurf.ende.typ === "anzahl" && <label>Anzahl Termine<input type="number" min="1" max="999" required value={entwurf.ende.anzahl || 12} onChange={(e) => setze("ende", { typ: "anzahl", anzahl: Number(e.target.value) })} /></label>}
        <label>Eintrag-Link<select value={manuelleRef} onChange={(e) => setManuelleRef(e.target.value)}>
          <option value="auto">{match.status === "eindeutig" ? `Automatisch: ${match.treffer.titel}` : "Automatisch suchen"}</option>
          <option value="none">Keine App-Verknüpfung</option>
          {serien.map((t) => <option key={t.watchmode_id != null ? `w:${t.watchmode_id}` : `m:${t.id}`} value={t.watchmode_id != null ? `w:${t.watchmode_id}` : `m:${t.id}`}>{t.titel}{t.jahr ? ` (${t.jahr})` : ""}</option>)}
        </select></label>
        <label>Externer Link (optional)<input type="url" value={entwurf.ref?.url || ""} onChange={(e) => setEntwurf((alt) => ({ ...alt, ref: { ...(alt.ref || {}), url: e.target.value } }))} placeholder="https://…" /></label>
      </div>
      <label>Notiz<textarea rows="2" value={entwurf.notiz} onChange={(e) => setze("notiz", e.target.value)} /></label>
      <p className={`kd-wochen-match kd-wochen-match--${match.status}`}>
        {match.status === "eindeutig" ? `Passender Serien-Eintrag gefunden: ${match.treffer.titel}.`
          : match.status === "mehrdeutig" ? "Mehrere gleichnamige Serien gefunden – bitte den Eintrag selbst wählen."
            : "Kein eindeutiger App-Eintrag gefunden. Der Reminder funktioniert trotzdem."}
      </p>
      <div className="kd-wochen-editoraktionen"><button type="submit" className="kd-wochen-primary">Speichern</button><button type="button" onClick={onAbbrechen}>Abbrechen</button></div>
    </form>
  );
}

function ReminderZeile({ eintrag, datum, onBearbeiten, onLoeschen, onAnsehen, onAnlegen }) {
  const zielVorhanden = !!(eintrag.ref?.master_id || eintrag.ref?.watchmode_id || eintrag.ref?.url);
  return (
    <details className={`kd-wochen-eintrag kd-wochen-eintrag--${eintrag.art}`}>
      <summary><span>{eintrag.titel}</span><b>{eintrag.plattform || (eintrag.art === "kino" ? "KINO" : "STREAMING")}</b></summary>
      <div className="kd-wochen-details">
        <div><strong>{eintrag.titel}</strong></div>
        <div>{eintrag.art === "kino" ? (eintrag.plattform || "Kino") : (eintrag.plattform || "Plattform offen")}{eintrag.uhrzeit ? ` · ${eintrag.uhrzeit}` : ""}</div>
        {eintrag.folgenstand && <div className="kd-wochen-folgenstand">{eintrag.folgenstand}</div>}
        {eintrag.notiz && <div>{eintrag.notiz}</div>}
        <div className="kd-wochen-aktionen">
          {eintrag.art !== "kino" && (zielVorhanden
            ? <button onClick={() => onAnsehen(eintrag)}>Eintrag ansehen</button>
            : <button onClick={() => onAnlegen(eintrag)}>Eintrag anlegen</button>)}
          {eintrag.art !== "kino" && <button onClick={() => onBearbeiten(eintrag)}>Reminder bearbeiten</button>}
          <button title="Diesen Termin in den Kalender setzen" onClick={() => kalenderDownload(erstelleIcs([kalenderEventAusWochenEintrag(eintrag, datum)]), `${eintrag.titel}-${datum}`)}>🗓 Termin</button>
          {eintrag.art !== "kino" && <button title="Die ganze Serie in den Kalender setzen" onClick={() => kalenderDownload(erstelleIcs([reminderIcsEvent(eintrag)]), `${eintrag.titel}-serie`)}>🗓 Serie</button>}
          <button className="kd-wochen-trash" title="Löschen" aria-label={`${eintrag.titel} löschen`} onClick={() => onLoeschen(eintrag)}>🗑</button>
        </div>
      </div>
    </details>
  );
}

export function Wochenplan({
  plan, onPlanAendern, kinoPins = [], onKinoPinLoeschen,
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

  const serien = useMemo(() => serienKatalog(katalog, master), [katalog, master]);
  const tage = useMemo(() => wochenansicht({ wochenplan: plan, kinoPins, katalog, master, jetzt }), [plan, kinoPins, katalog, master, jetzt]);

  const speichere = (roh) => {
    const e = neuerFolgenReminder({ ...roh, id: roh.id || undefined, erstellt_am: roh.erstellt_am }, jetzt);
    const aktuell = normalisiereWochenplan(plan, jetzt).eintraege;
    const next = aktuell.some((x) => x.id === e.id) ? aktuell.map((x) => x.id === e.id ? e : x) : [...aktuell, e];
    onPlanAendern({ version: 1, eintraege: next }); setEditor(null);
  };
  const loesche = (eintrag) => {
    if (eintrag.art === "kino") { onKinoPinLoeschen?.(eintrag.pin); return; }
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
  return (
    <section className="kd-wochenplan" aria-labelledby="deine-woche-titel">
      <header className="kd-wochenplan-kopf">
        <div><span className="kd-wochen-kicker">FOLGEN · STAFFELN · KINO</span><h2 id="deine-woche-titel">Deine Woche</h2></div>
        <div className="kd-wochen-kopfaktionen"><button onClick={() => setEditor(leererEntwurf(jetzt))}>+ Reminder</button><button className="kd-wochen-kalenderknopf" title="Die nächsten 7 Tage in den Kalender setzen" aria-label="Die nächsten 7 Tage in den Kalender setzen" onClick={() => kalenderDownload(wocheAlsIcs(tage), `kinodreieck-7-tage-${tage[0].iso}`)}>🗓</button></div>
      </header>
      <div className="kd-wochen-zeitraum">Heute bis {datumKurz(tage[6].iso)}</div>

      {editor && <ReminderEditor key={editor.id || "neu"} initial={editor} serien={serien} onSpeichern={speichere} onAbbrechen={() => setEditor(null)} />}

      <div className="kd-wochen-tagesliste">
        {tage.map((tag) => (
          <section key={tag.iso} className={`kd-wochen-tag ${tag.iso === datumLokal(jetzt) ? "ist-heute" : ""}`}>
            <header>
              <div className="kd-wochen-ticketstub"><b>{tageszahl(tag.iso)}</b><span>{tag.kurz}</span></div>
              <div className="kd-wochen-ticketname"><b>{tag.iso === datumLokal(jetzt) ? "Heute" : tag.name}</b><span>{datumKurz(tag.iso)}</span></div>
              {tag.eintraege.length > 0 && <button aria-label={`${tag.name} in den Kalender setzen`} title={`${tag.name} in den Kalender setzen`} onClick={() => kalenderDownload(tagAlsIcs(tag), `kinodreieck-${tag.iso}`)}>🗓</button>}
            </header>
            <div className="kd-wochen-taginhalt">
              {tag.eintraege.length ? tag.eintraege.map((e) => <ReminderZeile key={e.id} eintrag={e} datum={tag.iso} onBearbeiten={setEditor} onLoeschen={loesche} onAnsehen={ansehen} onAnlegen={anlegen} />) : <span className="kd-wochen-frei">Noch frei</span>}
            </div>
          </section>
        ))}
      </div>
      <p className="kd-wochen-exporthinweis">Die .ics-Dateien lassen sich in Apple Kalender und Outlook importieren. Ein Import ist ein Schnappschuss; Änderungen im Kinodreieck aktualisieren bereits importierte Termine nicht automatisch.</p>
    </section>
  );
}
