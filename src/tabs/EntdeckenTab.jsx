import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlogTab } from "./BlogTab.jsx";
import { ladeProfil } from "../lib/profil.js";
import {
  createAdditionalServiceDiscoveries,
  createCatalogRadarTarget,
  createEntdeckenCatalogSummary,
  localRadarTargetLabel,
  rankLocalEntdeckenRecommendations,
} from "../lib/entdeckenUi.js";
import { serienBeobachten } from "../lib/staffeln.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

const ANSICHTEN = Object.freeze([
  ["empfehlungen", "Empfehlungen"],
  ["radar", "Radar"],
  ["meinungen", "Blog"],
]);

const ROLLEN_LABEL = Object.freeze({ actor: "Schauspiel", director: "Regie" });
const EREIGNIS_LABEL = Object.freeze({
  kinostart_at: "Kinostart in Österreich",
  streamingstart_at: "Streamingstart in Österreich",
  dvd_bluray_at: "DVD-/Blu-ray-Start in Österreich",
  festival_at: "Festivaltermin in Österreich",
});

function focusableElements(root) {
  return [...(root?.querySelectorAll(
    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
  ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function ManageDialog({
  radarState, seriesCatalog, entdeckenStatus, master, useLibrary, accountMode,
  onUseLibrary, onObserveToggle, onRadarChange, onPersonRadarChange, onShareChange,
  onBlog, onClose, returnFocusRef,
}) {
  const dialogRef = useRef(null);
  const beobachtet = useMemo(
    () => serienBeobachten(entdeckenStatus || {}, seriesCatalog || []),
    [entdeckenStatus, seriesCatalog],
  );
  const subscriptions = radarState?.subscriptions || [];
  const people = radarState?.personSubscriptions || [];
  const pending = radarState?.outbox || [];

  useEffect(() => {
    const vorher = returnFocusRef?.current || document.activeElement;
    const entsperren = sperreDokumentScroll();
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector("button")?.focus());
    const taste = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const ziele = focusableElements(dialogRef.current);
      if (!ziele.length) { event.preventDefault(); dialogRef.current?.focus?.(); return; }
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      if (event.shiftKey && (document.activeElement === erstes || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); letztes.focus();
      } else if (!event.shiftKey && document.activeElement === letztes) {
        event.preventDefault(); erstes.focus();
      }
    };
    document.addEventListener("keydown", taste);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", taste);
      entsperren();
      requestAnimationFrame(() => { if (vorher?.isConnected) vorher.focus?.({ preventScroll: true }); });
    };
  }, [onClose, returnFocusRef]);

  return createPortal(
    <div className="kd-entdecken-layer" data-testid="entdecken-manage-layer">
      <button type="button" className="kd-sheet-scrim" aria-label="Entdecken verwalten schließen" onClick={onClose} />
      <section ref={dialogRef} className="kd-entdecken-dialog kd-entdecken-manage" role="dialog" aria-modal="true" aria-labelledby="kd-entdecken-manage-title" tabIndex={-1}>
        <header className="kd-entdecken-dialog-kopf">
          <div><span>Persönliche Auswahl</span><h2 id="kd-entdecken-manage-title">Entdecken verwalten</h2></div>
          <button type="button" className="kd-entdecken-schliessen" aria-label="Entdecken verwalten schließen und zurück" onClick={onClose}>×</button>
        </header>
        <div className="kd-entdecken-manage-grid">
          <section>
            <h3>Beobachten</h3>
            <p>Deine beobachteten Serien und Folgenstände.</p>
            {beobachtet.length ? <ul className="kd-entdecken-verwalten-liste">{beobachtet.map((entry) => (
              <li key={entry.watchmode_id}><span><strong>{entry.titel}</strong><small>Serie</small></span>
                <button type="button" onClick={() => onObserveToggle?.(entry, false)}>Beobachtung beenden</button></li>
            ))}</ul> : <p className="kd-entdecken-leer">Noch keine Serie beobachtet.</p>}
          </section>
          <section>
            <h3>Mein Radar</h3>
            <p>{accountMode ? "Bestätigte Ziele aus deinem Konto." : "Diese Ziele bleiben auf diesem Gerät."}</p>
            {subscriptions.length ? <ul className="kd-entdecken-verwalten-liste">{subscriptions.map((entry) => {
              const shared = (radarState?.shares || []).some((share) => share.targetId === entry.targetId && share.status === "active");
              return <li key={entry.targetId}>
                <span><strong>{localRadarTargetLabel(entry, { master })}</strong><small>{entry.status === "active" ? "Aktiv" : "Pausiert"} · Österreich</small></span>
                <div>
                  <button type="button" onClick={() => onRadarChange?.(entry, entry.status === "active" ? "pause" : "upsert")}>{entry.status === "active" ? "Pausieren" : "Fortsetzen"}</button>
                  <button type="button" onClick={() => onRadarChange?.(entry, "remove")}>Entfernen</button>
                  {accountMode && entry.authority === "server" ? <button type="button" aria-pressed={shared}
                    onClick={() => onShareChange?.(entry.targetId, !shared)}>{shared ? "Nicht mehr teilen" : "Anonym teilen"}</button> : null}
                </div>
              </li>;
            })}</ul> : <p className="kd-entdecken-leer">Noch kein Werk im Radar.</p>}
            {people.length ? <ul className="kd-entdecken-verwalten-liste">{people.map((entry) => <li key={`${entry.personExternalId}|${entry.role}`}>
              <span><strong>{entry.name}</strong><small>{ROLLEN_LABEL[entry.role]} · {entry.status === "active" ? "Aktiv" : "Pausiert"}</small></span>
              {entry.authority === "local" && onPersonRadarChange ? <div>
                <button type="button" onClick={() => onPersonRadarChange(entry, entry.status === "active" ? "pause" : "upsert")}>{entry.status === "active" ? "Pausieren" : "Fortsetzen"}</button>
                <button type="button" onClick={() => onPersonRadarChange(entry, "remove")}>Entfernen</button>
              </div> : <small>Änderung derzeit nicht verfügbar.</small>}
            </li>)}</ul> : null}
            {pending.length ? <div className="kd-entdecken-pending" role="status"><strong>{pending.length} Änderung{pending.length === 1 ? "" : "en"}</strong> warten noch auf Bestätigung.</div> : null}
          </section>
          <section>
            <h3>Empfehlungen</h3>
            <label className="kd-entdecken-check"><input type="checkbox" checked={useLibrary} onChange={(event) => onUseLibrary(event.target.checked)} />
              <span><strong>Explizit bewertete Mediathek einbeziehen</strong><small>Nur lesend; ohne neue Profilsignale.</small></span></label>
          </section>
          <section>
            <h3>Blog</h3>
            <p>Deine bestehenden Artikel und Deep-Links bleiben unverändert.</p>
            <button type="button" className="kd-entdecken-primaer" onClick={onBlog}>Blog öffnen</button>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function RecommendationsView({
  streamingEntdecken, master, profile, useLibrary, selectedServices, onRadarPreview,
}) {
  const recommendations = useMemo(() => rankLocalEntdeckenRecommendations({
    streamingEntdecken, master, profile, useLibrary,
  }), [master, profile, streamingEntdecken, useLibrary]);
  const catalogSummary = useMemo(() => createEntdeckenCatalogSummary({
    streamingEntdecken, selectedServices,
  }), [selectedServices, streamingEntdecken]);
  const additional = useMemo(() => createAdditionalServiceDiscoveries({
    streamingEntdecken, selectedServices, personalRecommendations: recommendations, master,
  }), [master, recommendations, selectedServices, streamingEntdecken]);
  const formatCount = (value) => Number(value || 0).toLocaleString("de-AT");
  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-empfehlungen">
    <div className="kd-entdecken-einleitung">
      <div><span>Lokal & erklärbar</span><h2 id="kd-entdecken-empfehlungen">Empfehlungen für dich</h2></div>
      <p>Deterministisch aus bestätigten Profilsignalen und – wenn gewählt – ausdrücklich bewerteten Mediathek-Einträgen. Kein LLM, kein Profil-Write.</p>
    </div>
    <div className="kd-entdecken-katalogwahrheit" aria-label="Katalog und aktuelle Treffermenge">
      <dl className="kd-entdecken-katalogzahlen">
        <div><dt>{catalogSummary.coverage === "full" ? "Kataloggröße" : "Begrenzter Katalogstand"}</dt><dd>{formatCount(catalogSummary.catalogSize)} Titel</dd></div>
        <div><dt>Aktuelle Treffermenge</dt><dd>{formatCount(catalogSummary.currentCount)} Titel{catalogSummary.selectedServiceCount ? " aus deinen Diensten" : " ohne Dienstefilter"}</dd></div>
      </dl>
      <p>{catalogSummary.coverage === "full"
        ? "Die Treffermenge berücksichtigt deine Dienstewahl und den bereits in deiner Mediathek erkannten Bestand. Sie verändert die Kataloggröße nicht."
        : "Nur der lokale Ersatzstand ist geladen. Seine Zahl ist keine Aussage über die Größe des Gesamtkatalogs."}</p>
    </div>
    {profile?.beschaedigt ? <p className="kd-entdecken-warnung" role="status">Das Geschmacksprofil ist nicht lesbar. Empfehlungen bleiben vorsichtshalber leer.</p> : null}
    {recommendations.length ? <div className="kd-entdecken-karten">{recommendations.map((entry) => {
      const catalogEntry = (streamingEntdecken?.titel || []).find((item) => `watchmode:${item.watchmode_id}` === entry.targetId);
      const target = createCatalogRadarTarget({ watchmodeId: catalogEntry?.watchmode_id, title: entry.title, type: catalogEntry?.typ });
      return <article key={entry.targetId} className="kd-entdecken-hub-karte">
        <span className="kd-entdecken-kicker">Persönliche Passung · AT verfügbar</span>
        <h3>{entry.title}</h3>
        <ul>{entry.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <small>Quelle: lokaler Streaming-Katalog AT.</small>
        {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarPreview?.(target)}>Ins Radar</button> : null}
      </article>;
    })}</div> : <p className="kd-entdecken-leer gross">Noch keine belastbare persönliche Empfehlung. Dafür braucht es ein bestätigtes Profilsignal oder eine passende ausdrücklich positive Mediathek-Bewertung.</p>}
    {recommendations.length < 6 ? <section className="kd-entdecken-weitere" aria-labelledby="kd-entdecken-weitere">
      <div className="kd-entdecken-einleitung kompakt">
        <div><span>Neutral ergänzt</span><h2 id="kd-entdecken-weitere">Weitere Entdeckungen aus deinen Diensten</h2></div>
        <p>Deterministisch aus dem verfügbaren Dienstekatalog. Diese Titel sind ausdrücklich keine persönliche Passung.</p>
      </div>
      {additional.length ? <div className="kd-entdecken-karten">{additional.map((entry) => {
        const target = createCatalogRadarTarget({ watchmodeId: entry.watchmodeId, title: entry.title, type: entry.type });
        return <article key={entry.targetId} className="kd-entdecken-hub-karte kd-entdecken-neutral">
          <span className="kd-entdecken-kicker">Aus deinen Diensten · neutral</span>
          <h3>{entry.title}</h3>
          <p>{entry.services.join(" · ")}{entry.year ? ` · ${entry.year}` : ""}</p>
          <small>Keine Bewertung und keine persönliche Passungsbehauptung.</small>
          {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarPreview?.(target)}>Ins Radar</button> : null}
        </article>;
      })}</div> : <p className="kd-entdecken-leer gross">{catalogSummary.selectedServiceCount
        ? "Keine weiteren eindeutigen Titel aus deinen gewählten Diensten verfügbar."
        : "Wähle unter Streaming-Quellen mindestens einen Dienst aus, damit hier neutrale Entdeckungen erscheinen."}</p>}
    </section> : null}
  </section>;
}

function catalogRadarTargets({ master, streamingKnown, streamingDiscover }) {
  const rows = [
    ...(master || []).map((entry) => ({ watchmodeId: entry.watchmode_id, catalogId: entry.id, title: entry.titel, type: entry.typ })),
    ...(streamingKnown?.titel || []).map((entry) => ({ watchmodeId: entry.watchmode_id, title: entry.titel, type: entry.typ })),
    ...(streamingDiscover?.titel || []).map((entry) => ({ watchmodeId: entry.watchmode_id, title: entry.titel, type: entry.typ })),
  ];
  const targets = new Map();
  for (const row of rows) {
    const target = createCatalogRadarTarget(row);
    if (target && !targets.has(target.targetId)) targets.set(target.targetId, target);
  }
  return [...targets.values()].sort((a, b) => a.title.localeCompare(b.title, "de-AT"));
}

function statusText(status, kind = "work") {
  const person = kind === "person";
  return ({
    active: person ? "Person ist jetzt im Radar." : "Ziel ist jetzt im Radar.",
    confirmed: person ? "Bestätigte Werke wurden gespeichert." : "Ein bestätigter Treffer wurde gespeichert.",
    no_change: "Keine neue bestätigte Änderung gefunden.",
    insufficient_evidence: person ? "Noch keine ausreichend belegten Werke gefunden." : "Noch keine ausreichend belegte Änderung gefunden.",
    forbidden: "Dieses Ziel kann gerade nicht geprüft werden.",
    unresolved: "Die Person konnte nicht eindeutig bestätigt werden.",
    unavailable: "Die Suche ist derzeit nicht verfügbar.",
    provider_error: "Die Suche ist derzeit nicht erreichbar.",
    invalid_response: "Die Suche lieferte kein verlässliches Ergebnis.",
    storage_error: "Das Ergebnis konnte nicht sicher gespeichert werden.",
  })[status] || "Das Ziel konnte nicht geprüft werden.";
}

function isErrorStatus(status) {
  return ["forbidden", "unresolved", "unavailable", "provider_error", "invalid_response", "storage_error"].includes(status);
}

function RadarView({
  radarState, master, streamingKnown, streamingDiscover, accountMode,
  onRadarPreview, radarPilotEvents = [], radarCheckAvailable = false,
  onRadarPilotReceipt, onRadarWebsearchCheck,
  personRadarAvailable = false, onPersonRadarAdd, onPersonRadarCheck,
}) {
  const [selectedWork, setSelectedWork] = useState("");
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("actor");
  const [personAddBusy, setPersonAddBusy] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState(null);
  const targets = useMemo(
    () => catalogRadarTargets({ master, streamingKnown, streamingDiscover }),
    [master, streamingDiscover, streamingKnown],
  );
  const targetByToken = useMemo(() => new Map(targets.map((target, index) => [`werk-${index}`, target])), [targets]);
  const subscriptions = radarState?.subscriptions || [];
  const people = radarState?.personSubscriptions || [];
  const personResults = radarState?.personResults || [];
  const receiptByEvent = useMemo(() => new Map((radarState?.receipts || []).map((entry) => [
    `${entry.eventId}|${entry.versionId}`, entry,
  ])), [radarState?.receipts]);
  const events = useMemo(() => (radarPilotEvents || [])
    .filter((entry) => entry.verificationStatus === "confirmed")
    .map((entry) => ({
      ...entry,
      title: localRadarTargetLabel(subscriptions.find((item) => item.targetId === entry.targetId) || entry.targetId, {
        master, streamingKnown, streamingDiscover,
      }),
    }))
    .sort((a, b) => `${a.date}|${a.title}`.localeCompare(`${b.date}|${b.title}`, "de-AT")),
  [master, radarPilotEvents, streamingDiscover, streamingKnown, subscriptions]);

  const addWork = () => {
    const target = targetByToken.get(selectedWork);
    if (!target) return;
    onRadarPreview?.(target);
    setMessage({ status: "active", text: "Prüfe das Werk und bestätige es anschließend für dein Radar." });
  };
  const addPerson = async () => {
    const name = personName.trim();
    if (!personRadarAvailable || !name || personAddBusy) return;
    setPersonAddBusy(true); setMessage(null);
    try {
      const result = await onPersonRadarAdd?.({ name, role: personRole });
      setMessage({ status: result?.status, text: statusText(result?.status, "person") });
      if (result?.status === "active") setPersonName("");
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error", "person") }); }
    finally { setPersonAddBusy(false); }
  };
  const checkWork = async (entry) => {
    if (!radarCheckAvailable || busyKey) return;
    setBusyKey(`work|${entry.targetId}`); setMessage(null);
    try {
      const result = await onRadarWebsearchCheck?.(entry.targetId);
      setMessage({ status: result?.status, text: statusText(result?.status) });
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error") }); }
    finally { setBusyKey(""); }
  };
  const checkPerson = async (entry) => {
    if (!personRadarAvailable || busyKey) return;
    setBusyKey(`person|${entry.personExternalId}|${entry.role}`); setMessage(null);
    try {
      const result = await onPersonRadarCheck?.(entry);
      setMessage({ status: result?.status, text: statusText(result?.status, "person") });
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error", "person") }); }
    finally { setBusyKey(""); }
  };

  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-radar">
    <div className="kd-entdecken-einleitung">
      <div><span>Deine Starttermine</span><h2 id="kd-entdecken-radar">Mein Radar</h2></div>
      <p>{accountMode ? "Bestätigte Ziele aus deinem Konto." : "Deine Ziele bleiben auf diesem Gerät."} Ergebnisse erscheinen erst, wenn Werk, Österreich-Bezug und Datum eindeutig belegt sind.</p>
    </div>
    <div className="kd-entdecken-radar-add-grid">
      <article className="kd-entdecken-panel">
        <h3>Werk hinzufügen</h3>
        {targets.length ? <div className="kd-entdecken-formzeile">
          <label htmlFor="kd-radar-work">Film oder Serie</label>
          <select id="kd-radar-work" value={selectedWork} onChange={(event) => setSelectedWork(event.target.value)}>
            <option value="">Werk auswählen</option>
            {targets.map((target, index) => <option key={target.targetId} value={`werk-${index}`}>{target.title}</option>)}
          </select>
          <button type="button" className="kd-entdecken-primaer" disabled={!selectedWork} onClick={addWork}>Werk ins Radar</button>
        </div> : <p className="kd-entdecken-leer">Der vorbereitete Katalog ist gerade nicht verfügbar.</p>}
      </article>
      <article className="kd-entdecken-panel">
        <h3>Person hinzufügen</h3>
        {personRadarAvailable ? <div className="kd-entdecken-formzeile">
          <label htmlFor="kd-radar-person">Name</label>
          <input id="kd-radar-person" value={personName} maxLength={160} autoComplete="off" onChange={(event) => setPersonName(event.target.value)} />
          <label htmlFor="kd-radar-role">Rolle</label>
          <select id="kd-radar-role" value={personRole} onChange={(event) => setPersonRole(event.target.value)}>
            <option value="actor">Schauspiel</option><option value="director">Regie</option>
          </select>
          <button type="button" className="kd-entdecken-primaer" disabled={!personName.trim() || personAddBusy} onClick={addPerson}>
            {personAddBusy ? "Wird angelegt…" : "Person ins Radar"}
          </button>
        </div> : <p className="kd-entdecken-leer" role="status">Die Personensuche ist derzeit nicht verfügbar. Bereits bestätigte Personen bleiben sichtbar.</p>}
      </article>
    </div>
    {message ? <p className={isErrorStatus(message.status) ? "kd-entdecken-fehler" : "kd-entdecken-pending"}
      role={isErrorStatus(message.status) ? "alert" : "status"}>{message.text}</p> : null}
    <div className="kd-entdecken-radar-grid">
      <article className="kd-entdecken-panel">
        <h3>Meine Ziele</h3>
        {!subscriptions.length && !people.length ? <p className="kd-entdecken-leer">Noch kein Ziel im Radar.</p> : null}
        {subscriptions.length ? <ul>{subscriptions.map((entry) => <li key={entry.targetId}>
          <strong>{localRadarTargetLabel(entry, { master, streamingKnown, streamingDiscover })}</strong>
          <span>{entry.status === "active" ? "Aktiv" : "Pausiert"} · Werk</span>
          {entry.status === "active" && radarCheckAvailable ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={!!busyKey} onClick={() => checkWork(entry)}>
            {busyKey === `work|${entry.targetId}` ? "Wird geprüft…" : "Jetzt prüfen"}
          </button> : null}
        </li>)}</ul> : null}
        {people.length ? <ul>{people.map((entry) => <li key={`${entry.personExternalId}|${entry.role}`}>
          <strong>{entry.name}</strong><span>{ROLLEN_LABEL[entry.role]} · {entry.status === "active" ? "Aktiv" : "Pausiert"}</span>
          {entry.status === "active" && personRadarAvailable ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={!!busyKey} onClick={() => checkPerson(entry)}>
            {busyKey === `person|${entry.personExternalId}|${entry.role}` ? "Wird geprüft…" : "Jetzt prüfen"}
          </button> : null}
        </li>)}</ul> : null}
        {(radarState?.outbox || []).length ? <p className="kd-entdecken-pending" role="status">Eine Änderung wartet noch auf Bestätigung.</p> : null}
      </article>
      <article className="kd-entdecken-panel">
        <h3>Bestätigte Treffer</h3>
        {events.length ? <ul>{events.map((entry) => <li key={entry.eventVersionId}>
          <strong>{entry.title}</strong>
          <span>{entry.date} · {EREIGNIS_LABEL[entry.eventType] || "Bestätigter Termin"}{entry.platform && entry.platform !== "-" ? ` · ${entry.platform}` : ""}</span>
          {entry.evidence?.length ? <div className="kd-pilot-quellen"><span>Quellen</span><div className="kd-pilot-quellen-links">
            {entry.evidence.map((item, index) => <a className="kd-pilot-quellen-link" href={item.url}
              key={`${entry.eventVersionId}-source-${index}`} rel="noopener noreferrer" target="_blank">{item.sourceDomain}</a>)}
          </div></div> : null}
          {typeof onRadarPilotReceipt === "function" ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status === "seen"}
            onClick={() => onRadarPilotReceipt({ eventId: entry.eventId, eventVersionId: entry.eventVersionId, status: "seen" })}>
            {receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status === "seen" ? "Gesehen" : "Als gesehen markieren"}
          </button> : null}
        </li>)}</ul> : <p className="kd-entdecken-leer">Noch keine bestätigten Ereignisse für deine aktiven Werke.</p>}
        {personResults.map((result) => {
          const matches = result.decisions.filter((entry) => entry.status === "matched" && entry.work);
          return <section className="kd-entdecken-person-result" key={`${result.personExternalId}|${result.role}`}>
            <h4>{result.name} · {ROLLEN_LABEL[result.role]}</h4>
            {matches.length ? <ul>{matches.map((entry) => <li key={entry.work.targetId}>
              <strong>{entry.work.title}</strong><span>{entry.work.year}</span>
            </li>)}</ul> : <p className="kd-entdecken-leer">Noch keine bestätigten Werke.</p>}
          </section>;
        })}
      </article>
    </div>
  </section>;
}

export function EntdeckenTab({
  blogProps, fokusId, radarState, seriesCatalog = [], entdeckenStatus = {}, master = [],
  streamingKnown = null, streamingDiscover = null, selectedServices = [], accountMode = false,
  radarPilotEvents = [], radarCheckAvailable = false,
  onRadarPilotReceipt, onRadarWebsearchCheck,
  personRadarAvailable = false, onPersonRadarAdd, onPersonRadarChange, onPersonRadarCheck,
  onObserveToggle, onRadarChange, onRadarPreview, onShareChange,
}) {
  const [ansicht, setAnsicht] = useState(fokusId ? "meinungen" : "empfehlungen");
  const [manageOffen, setManageOffen] = useState(false);
  const [useLibrary, setUseLibrary] = useState(true);
  const [profile, setProfile] = useState(null);
  const manageButtonRef = useRef(null);
  useEffect(() => {
    let aktiv = true;
    ladeProfil().then((value) => { if (aktiv) setProfile(value); });
    return () => { aktiv = false; };
  }, []);
  useEffect(() => { if (fokusId) setAnsicht("meinungen"); }, [fokusId]);
  const closeManage = useCallback(() => setManageOffen(false), []);
  const openBlog = useCallback(() => { setManageOffen(false); setAnsicht("meinungen"); }, []);

  return <section className="kd-entdecken" data-testid="entdecken-tab">
    <div className="kd-entdecken-toolbar">
      <nav className="kd-entdecken-tabs" aria-label="Entdecken-Ansichten" role="tablist">
        {ANSICHTEN.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={ansicht === id}
          className={ansicht === id ? "aktiv" : ""} onClick={() => setAnsicht(id)}>{label}</button>)}
        <button ref={manageButtonRef} type="button" className="kd-entdecken-verwalten" aria-label="Entdecken verwalten"
          title="Entdecken verwalten" onClick={() => setManageOffen(true)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
          </svg>
        </button>
      </nav>
    </div>
    {ansicht === "empfehlungen" ? <RecommendationsView streamingEntdecken={streamingDiscover} master={master}
      profile={profile} useLibrary={useLibrary} selectedServices={selectedServices} onRadarPreview={onRadarPreview} /> : null}
    {ansicht === "radar" ? <RadarView radarState={radarState} master={master} streamingKnown={streamingKnown}
      streamingDiscover={streamingDiscover} accountMode={accountMode} onRadarPreview={onRadarPreview}
      radarPilotEvents={radarPilotEvents} radarCheckAvailable={radarCheckAvailable}
      onRadarPilotReceipt={onRadarPilotReceipt} onRadarWebsearchCheck={onRadarWebsearchCheck}
      personRadarAvailable={personRadarAvailable} onPersonRadarAdd={onPersonRadarAdd}
      onPersonRadarCheck={onPersonRadarCheck} /> : null}
    {ansicht === "meinungen" ? <div role="tabpanel" aria-label="Blog"><BlogTab {...blogProps} fokusId={fokusId} /></div> : null}
    {manageOffen ? <ManageDialog radarState={radarState} seriesCatalog={seriesCatalog} entdeckenStatus={entdeckenStatus}
      master={master} useLibrary={useLibrary} accountMode={accountMode} onUseLibrary={setUseLibrary}
      onObserveToggle={onObserveToggle} onRadarChange={onRadarChange} onPersonRadarChange={onPersonRadarChange}
      onShareChange={onShareChange} onBlog={openBlog} onClose={closeManage} returnFocusRef={manageButtonRef} /> : null}
  </section>;
}
