import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlogTab } from "./BlogTab.jsx";
import { ladeProfil } from "../lib/profil.js";
import {
  createCatalogRadarTarget,
  createEntdeckenRecommendations,
  createEntdeckenCatalogSummary,
  createRadarCatalogIndex,
  localCalendarDay,
  localRadarTargetLabel,
  searchRadarCatalogResult,
} from "../lib/entdeckenUi.js";
import { RADAR_NORMAL_ACTIVE_LIMIT } from "../lib/radarContracts.js";
import { serienBeobachten } from "../lib/staffeln.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";
import { searchPersonRadarCatalog } from "../lib/personRadarCatalog.js";

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

function zielTypLabel(entry) {
  if (entry?.role) return ROLLEN_LABEL[entry.role] || "Person";
  return entry?.targetType === "series" ? "Serie" : "Film oder Werk";
}

function aktuellerWienTag() {
  const teile = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const wert = Object.fromEntries(teile.map((entry) => [entry.type, entry.value]));
  return `${wert.year}-${wert.month}-${wert.day}`;
}

function plusTage(tag, anzahl) {
  const datum = new Date(`${tag}T00:00:00.000Z`);
  datum.setUTCDate(datum.getUTCDate() + anzahl);
  return datum.toISOString().slice(0, 10);
}

function lesbarerTag(tag) {
  return new Intl.DateTimeFormat("de-AT", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
  }).format(new Date(`${tag}T00:00:00.000Z`));
}

function RadarZielkarte({ title, typeLabel, status, children }) {
  return <li className="kd-entdecken-zielkarte">
    <strong>{title}</strong>
    <span>{typeLabel} · {status === "active" ? "Aktiv" : "Pausiert"}</span>
    {children ? <div className="kd-entdecken-zielaktionen">{children}</div> : null}
  </li>;
}

function RadarEreignisse({ entries, receiptByEvent, onReceipt }) {
  return <ul>{entries.map((entry) => <li key={entry.eventVersionId}>
    <strong>{entry.title}</strong>
    <span>Bestätigtes Ereignis · {lesbarerTag(entry.date)} · {EREIGNIS_LABEL[entry.eventType] || "Bestätigter Termin"}{entry.platform && entry.platform !== "-" ? ` · ${entry.platform}` : ""}</span>
    {entry.evidence?.length ? <div className="kd-radar-quellen"><span>Quellen</span><div className="kd-radar-quellen-links">
      {entry.evidence.map((item, index) => <a className="kd-radar-quellen-link" href={item.url}
        key={`${entry.eventVersionId}-source-${index}`} rel="noopener noreferrer" target="_blank">{item.sourceDomain}</a>)}
    </div></div> : null}
    {typeof onReceipt === "function" ? <button type="button" className="kd-entdecken-sekundaer"
      disabled={receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status === "seen"}
      onClick={() => onReceipt({ eventId: entry.eventId, eventVersionId: entry.eventVersionId, status: "seen" })}>
      {receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status === "seen" ? "Gesehen" : "Als gesehen markieren"}
    </button> : null}
  </li>)}</ul>;
}

function PendingRadarConfirmation({ count = 0, syncStatus = "idle", onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  if (!count && !result) return null;
  const confirm = async () => {
    if (busy || typeof onConfirm !== "function") return;
    setBusy(true); setResult(null);
    try {
      const synced = await onConfirm();
      setResult(synced?.status === "ready"
        ? { ok: true, text: "Änderung bestätigt. Dein Radar wurde neu geladen." }
        : { ok: false, text: "Die Bestätigung ist noch nicht abgeschlossen. Die Änderung bleibt sichtbar ausstehend." });
    } catch {
      setResult({ ok: false, text: "Die Bestätigung konnte gerade nicht abgeschlossen werden. Die Änderung bleibt sichtbar ausstehend." });
    } finally { setBusy(false); }
  };
  return <>
    {count ? <div className="kd-entdecken-pending" role="status">
      <strong>{count} Änderung{count === 1 ? "" : "en"} wartet{count === 1 ? "" : "n"} noch auf Bestätigung.</strong>
      {typeof onConfirm === "function" ? <button type="button" className="kd-entdecken-sekundaer"
        disabled={busy || syncStatus === "syncing"} onClick={() => void confirm()}>
        {busy || syncStatus === "syncing" ? "Wird bestätigt…" : count === 1 ? "Änderung bestätigen" : "Änderungen bestätigen"}
      </button> : null}
    </div> : null}
    {result ? <p className={result.ok ? "kd-entdecken-pending" : "kd-entdecken-fehler"}
      role={result.ok ? "status" : "alert"}>{result.text}</p> : null}
  </>;
}

function focusableElements(root) {
  return [...(root?.querySelectorAll(
    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
  ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function ManageDialog({
  radarState, seriesCatalog, entdeckenStatus, master, useLibrary, accountMode,
  onUseLibrary, onObserveToggle, onRadarChange, onPersonRadarChange, onShareChange,
  onBlog, onClose, returnFocusRef,
  syncStatus = "idle", onRadarPilotSync,
}) {
  const dialogRef = useRef(null);
  const beobachtet = useMemo(
    () => serienBeobachten(entdeckenStatus || {}, seriesCatalog || []),
    [entdeckenStatus, seriesCatalog],
  );
  const subscriptions = radarState?.subscriptions || [];
  const people = radarState?.personSubscriptions || [];
  const pending = (radarState?.outbox || []).filter((entry) => entry.status === "pending");

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
            <PendingRadarConfirmation count={pending.length} syncStatus={syncStatus} onConfirm={onRadarPilotSync} />
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
  streamingEntdecken, streamingKnown, master, profile, profileLoading, useLibrary,
  selectedServices, catalogLoading, catalogError, onRadarPreview,
  entdeckenStatus, webDiscoveryFeed, dailyVariety = false, selectionDay = null,
}) {
  const recommendations = useMemo(() => createEntdeckenRecommendations({
    streamingEntdecken, streamingKnown, master, profile, useLibrary, selectedServices,
    entdeckenStatus, webDiscoveryFeed, dailyVariety,
    selectionDay: selectionDay || localCalendarDay(),
  }), [dailyVariety, entdeckenStatus, master, profile, selectedServices, selectionDay,
    streamingEntdecken, streamingKnown, useLibrary, webDiscoveryFeed]);
  const catalogSummary = useMemo(() => createEntdeckenCatalogSummary({
    streamingEntdecken, selectedServices,
  }), [selectedServices, streamingEntdecken]);
  const formatCount = (value) => Number(value || 0).toLocaleString("de-AT");
  const hasSelectedServices = Array.isArray(selectedServices) && selectedServices.length > 0;
  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-empfehlungen">
    <div className="kd-entdecken-einleitung">
      <div><span>Lokal & erklärbar</span><h2 id="kd-entdecken-empfehlungen">Empfehlungen für dich</h2></div>
      <p>Deterministisch aus bestätigten Profilsignalen und – wenn gewählt – ausdrücklich bewerteten Mediathek-Einträgen, jeweils verfügbar auf deinen gewählten Diensten in Österreich. Kein LLM, kein Profil-Write.</p>
    </div>
    {catalogLoading ? <p className="kd-entdecken-laden" role="status">{streamingEntdecken
      ? "Der vollständige Katalog wird geladen. Bis dahin siehst du den verfügbaren lokalen Ersatzstand."
      : "Der Katalog wird geladen …"}</p> : null}
    {catalogError ? <p className="kd-entdecken-fehler" role="alert">{streamingEntdecken
      ? "Der vollständige Katalog konnte nicht geladen werden. Du siehst den verfügbaren lokalen Ersatzstand."
      : "Der Katalog konnte nicht geladen werden. Versuche es später erneut."}</p> : null}
    {streamingEntdecken ? <div className="kd-entdecken-katalogwahrheit" aria-label="Katalog und aktuelle Treffermenge">
      <dl className="kd-entdecken-katalogzahlen">
        <div><dt>{catalogSummary.coverage === "full" ? "Kataloggröße" : "Begrenzter Katalogstand"}</dt><dd>{formatCount(catalogSummary.catalogSize)} Titel</dd></div>
        <div><dt>Aktuelle Treffermenge</dt><dd>{formatCount(catalogSummary.currentCount)} Titel{catalogSummary.selectedServiceCount ? " aus deinen Diensten" : " ohne Dienstefilter"}</dd></div>
      </dl>
      <p>{catalogSummary.coverage === "full"
        ? "Die Treffermenge berücksichtigt deine Dienstewahl und den bereits in deiner Mediathek erkannten Bestand. Sie verändert die Kataloggröße nicht."
        : "Nur der lokale Ersatzstand ist geladen. Seine Zahl ist keine Aussage über die Größe des Gesamtkatalogs."}</p>
    </div> : null}
    {profile?.beschaedigt ? <p className="kd-entdecken-warnung" role="status">Das Geschmacksprofil ist nicht lesbar. Vorschläge bleiben vorsichtshalber leer, damit bestätigte Ausschlüsse nicht übergangen werden.</p> : null}
    <section aria-labelledby="kd-entdecken-persoenlich">
      <div className="kd-entdecken-einleitung kompakt">
        <div><span>{dailyVariety ? "Heute aus deinen Top 20" : "Höchste Passung zuerst"}</span><h2 id="kd-entdecken-persoenlich">Persönliche Passung</h2></div>
        <p>Bis zu sechs verfügbare, ungesehene Titel, begründet aus deinem Profil{useLibrary ? " und ausdrücklich bewerteten Mediathek-Einträgen" : ""}.</p>
      </div>
    {profileLoading ? <p className="kd-entdecken-laden" role="status">Deine bestätigten Profilsignale werden geladen …</p>
      : recommendations.personal.length ? <div className="kd-entdecken-karten">{recommendations.personal.map((entry) => {
      const target = createCatalogRadarTarget({ watchmodeId: entry.watchmodeId, title: entry.title, type: entry.type });
      return <article key={entry.targetId} className="kd-entdecken-hub-karte">
        <span className="kd-entdecken-kicker">Persönliche Passung · bei deinen Diensten in AT</span>
        <h3>{entry.title}</h3>
        <ul>{entry.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <small>{entry.services?.join(" · ")}{entry.year ? ` · ${entry.year}` : ""}</small>
        {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarPreview?.(target)}>Ins Radar</button> : null}
      </article>;
    })}</div> : <p className="kd-entdecken-leer gross">{hasSelectedServices
      ? "Noch keine verfügbare, ungesehene persönliche Passung. Dafür braucht es ein bestätigtes Profilsignal oder eine passende ausdrücklich positive Mediathek-Bewertung."
      : "Wähle unter Streaming-Quellen mindestens einen Dienst aus. Persönliche Karten erscheinen nur für dort verfügbare Titel."}</p>}
    </section>
    {!profileLoading && !profile?.beschaedigt ? <section className="kd-entdecken-weitere" aria-labelledby="kd-entdecken-weitere">
      <div className="kd-entdecken-einleitung kompakt">
        <div><span>Täglicher Websearch-Feed</span><h2 id="kd-entdecken-weitere">Weitere Entdeckungen</h2></div>
        <p>Nur belegte Webtipps, die lokal eindeutig als aktuell verfügbarer Titel in deinen Diensten gefunden wurden.</p>
      </div>
      {recommendations.further.length ? <div className="kd-entdecken-karten">{recommendations.further.map((entry) => {
        const target = createCatalogRadarTarget({ watchmodeId: entry.watchmodeId, title: entry.title, type: entry.type });
        return <article key={entry.targetId} className="kd-entdecken-hub-karte kd-entdecken-webtipp">
          <span className="kd-entdecken-kicker">Belegter Webtipp · verfügbar in AT</span>
          <h3>{entry.title}</h3>
          <p>{entry.services.join(" · ")}{entry.year ? ` · ${entry.year}` : ""}</p>
          <div className="kd-radar-quellen"><span>Quellen</span><div className="kd-radar-quellen-links">
            {entry.externalEvidence.map((evidence) => <a className="kd-radar-quellen-link" href={evidence.url}
              key={evidence.url} rel="noopener noreferrer" target="_blank">{evidence.domain}</a>)}
          </div></div>
          {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarPreview?.(target)}>Ins Radar</button> : null}
        </article>;
      })}</div> : <p className="kd-entdecken-leer gross">Noch keine belegten Webtipps geladen. Es werden keine Katalogtitel als Ersatz aufgefüllt.</p>}
    </section> : null}
  </section>;
}

function statusText(status, kind = "work") {
  const person = kind === "person";
  return ({
    active: person ? "Person ist jetzt im Radar." : "Ziel ist jetzt im Radar.",
    pending: person ? "Person ist vorgemerkt und wartet auf die Kontobestätigung." : "Änderung wartet auf Bestätigung.",
    confirmed: person ? "Bestätigte Werke wurden gespeichert." : "Ein bestätigter Treffer wurde gespeichert.",
    no_change: "Keine neue bestätigte Änderung gefunden.",
    insufficient_evidence: person ? "Noch keine ausreichend belegten Werke gefunden." : "Noch keine ausreichend belegte Änderung gefunden.",
    forbidden: "Dieses Ziel kann gerade nicht geprüft werden.",
    unresolved: "Die Person konnte nicht eindeutig bestätigt werden.",
    unavailable: person
      ? "Die Person wurde lokal eindeutig gefunden, aber die Konto-Bestätigung ist noch nicht verfügbar."
      : "Die Online-Prüfung ist derzeit nicht verfügbar.",
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
  personRadarAvailable = false, personRadarCheckAvailable = false,
  onPersonRadarAdd, onPersonRadarCheck,
  onRadarChange, onPersonRadarChange, today = null,
  syncStatus = "idle", onRadarPilotSync,
}) {
  const [workQuery, setWorkQuery] = useState("");
  const [selectedWorks, setSelectedWorks] = useState([]);
  const [personQuery, setPersonQuery] = useState("");
  const [personRole, setPersonRole] = useState("actor");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [personAddBusy, setPersonAddBusy] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState(null);
  const targets = useMemo(
    () => createRadarCatalogIndex({ master, streamingKnown, streamingDiscover }),
    [master, streamingDiscover, streamingKnown],
  );
  const targetById = useMemo(() => new Map(targets.map((entry) => [entry.targetId, entry])), [targets]);
  const workSearch = useMemo(() => searchRadarCatalogResult(targets, workQuery), [targets, workQuery]);
  const workMatches = workSearch.entries;
  const selectedWorkEntries = selectedWorks.map((targetId) => targetById.get(targetId)).filter(Boolean);
  const personSearch = useMemo(() => searchPersonRadarCatalog({ query: personQuery, role: personRole }), [personQuery, personRole]);
  const personByToken = useMemo(() => new Map(personSearch.entries.map((entry, index) => [`person-${index}`, entry])), [personSearch]);
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
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(today || "") ? today : aktuellerWienTag();
  const weekEnd = plusTage(startDay, 6);
  const weekEvents = events.filter((entry) => entry.date >= startDay && entry.date <= weekEnd);
  const otherEvents = events.filter((entry) => entry.date < startDay || entry.date > weekEnd);
  const canCheckWork = accountMode && radarCheckAvailable && typeof onRadarWebsearchCheck === "function";
  const canCheckPerson = accountMode && personRadarCheckAvailable && typeof onPersonRadarCheck === "function";
  const personWeekResults = personResults.map((result) => ({
    ...result,
    decisions: result.decisions.filter((entry) => (
      entry.status === "matched" && entry.work && entry.date >= startDay && entry.date <= weekEnd
    )),
  })).filter((result) => result.decisions.length);

  const toggleWork = (targetId) => {
    setSelectedWorks((previous) => {
      if (previous.includes(targetId)) return previous.filter((entry) => entry !== targetId);
      if (previous.length >= RADAR_NORMAL_ACTIVE_LIMIT) return previous;
      return [...previous, targetId];
    });
  };
  const addWork = () => {
    const selectedTargets = selectedWorkEntries.map((entry) => entry.target);
    if (!selectedTargets.length) return;
    onRadarPreview?.(selectedTargets.length === 1 ? selectedTargets[0] : selectedTargets);
    setMessage({ status: "active", text: `${selectedTargets.length === 1 ? "Prüfe das Werk" : `Prüfe die ${selectedTargets.length} Titel`} und bestätige ${selectedTargets.length === 1 ? "es" : "sie"} anschließend gemeinsam für dein Radar.` });
  };
  const addPerson = async () => {
    const identity = personByToken.get(selectedPerson);
    if (!personRadarAvailable || !identity || personAddBusy) return;
    setPersonAddBusy(true); setMessage(null);
    try {
      const result = await onPersonRadarAdd?.(identity);
      setMessage({ status: result?.status, text: statusText(result?.status, "person") });
      if (result?.status === "active") { setPersonQuery(""); setSelectedPerson(""); }
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error", "person") }); }
    finally { setPersonAddBusy(false); }
  };
  const checkWork = async (entry) => {
    if (!canCheckWork || busyKey) return;
    setBusyKey(`work|${entry.targetId}`); setMessage(null);
    try {
      const result = await onRadarWebsearchCheck?.(entry.targetId);
      setMessage({ status: result?.status, text: statusText(result?.status) });
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error") }); }
    finally { setBusyKey(""); }
  };
  const checkPerson = async (entry) => {
    if (!canCheckPerson || busyKey) return;
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
      <p>{accountMode
        ? canCheckWork || canCheckPerson
          ? "Du startest jede Online-Prüfung selbst mit „Jetzt prüfen“. Es läuft keine automatische Prüfung."
          : "Deine Kontoziele bleiben sichtbar. Die manuelle Online-Prüfung ist derzeit nicht verfügbar."
        : "Im Gast- und Einzeldatei-Modus bleiben Ziele auf diesem Gerät. Es läuft keine serverseitige Prüfung."} Ergebnisse erscheinen erst, wenn Werk, Österreich-Bezug und Datum eindeutig belegt sind.</p>
    </div>
    <div className="kd-entdecken-radar-add-grid">
      <article className="kd-entdecken-panel">
        <h3>Ziel hinzufügen</h3>
        {targets.length ? <div className="kd-entdecken-formzeile">
          <label htmlFor="kd-radar-work">Film oder Serie</label>
          <input id="kd-radar-work" type="search" value={workQuery} maxLength={160} autoComplete="off"
            placeholder="Titel in Streaming und Mediathek suchen …" aria-autocomplete="list"
            aria-controls="kd-radar-work-results" aria-describedby="kd-radar-work-status"
            onChange={(event) => setWorkQuery(event.target.value)} />
          <small id="kd-radar-work-status" role="status" aria-live="polite">
            {workQuery.trim().length < 2
              ? "Tippe mindestens zwei Buchstaben. Es werden höchstens acht Treffer angezeigt."
              : workMatches.length
                ? workSearch.truncated
                  ? `${workMatches.length} von ${workSearch.total} Treffern. Verfeinere die Suche für weitere Titel.`
                  : `${workMatches.length} ${workMatches.length === 1 ? "Treffer" : "Treffer"}.`
                : "Kein passender Titel gefunden."}
          </small>
          {workMatches.length ? <ul id="kd-radar-work-results" className="kd-radar-work-results" aria-label="Passende Radar-Werke">
            {workMatches.map((entry) => <li key={entry.targetId}>
              <button type="button" className={selectedWorks.includes(entry.targetId) ? "ausgewaehlt" : ""}
                aria-pressed={selectedWorks.includes(entry.targetId)} onClick={() => toggleWork(entry.targetId)}>
                <strong>{entry.title}</strong>
                <span>{[entry.year, entry.sources.join(" + ")].filter(Boolean).join(" · ")}</span>
              </button>
            </li>)}
          </ul> : null}
          {selectedWorkEntries.length ? <div className="kd-radar-work-auswahl" aria-label="Ausgewählte Radar-Titel">
            <strong>{selectedWorkEntries.length} {selectedWorkEntries.length === 1 ? "Titel ausgewählt" : "Titel ausgewählt"}</strong>
            <ul>{selectedWorkEntries.map((entry) => <li key={entry.targetId}>{entry.title}{entry.year ? ` · ${entry.year}` : ""} · {entry.sources.join(" + ")}</li>)}</ul>
            <small>Kein Reihen- oder Franchise-Abo: Aktiviert werden exakt diese angeklickten Titel. Maximal {RADAR_NORMAL_ACTIVE_LIMIT} Titel pro Bestätigung.</small>
          </div> : <small className="kd-radar-work-auswahl">Wähle jeden gewünschten Titel ausdrücklich aus. Ein Titel aktiviert niemals automatisch eine Reihe.</small>}
          <button type="button" className="kd-entdecken-primaer" disabled={!selectedWorkEntries.length} onClick={addWork}>
            {selectedWorkEntries.length > 1 ? `${selectedWorkEntries.length} Titel prüfen` : "Ins Radar"}
          </button>
        </div> : <p className="kd-entdecken-leer">Der vorbereitete Katalog ist gerade nicht verfügbar.</p>}
      </article>
      <article className="kd-entdecken-panel">
        <h3>Person hinzufügen</h3>
        <div className="kd-entdecken-formzeile">
          <label htmlFor="kd-radar-person">Person suchen</label>
          <input id="kd-radar-person" value={personQuery} maxLength={160} autoComplete="off"
            placeholder="Kanonischen Namen eingeben"
            onChange={(event) => { setPersonQuery(event.target.value); setSelectedPerson(""); }} />
          <label htmlFor="kd-radar-role">Rolle</label>
          <select id="kd-radar-role" value={personRole}
            onChange={(event) => { setPersonRole(event.target.value); setSelectedPerson(""); }}>
            <option value="actor">Schauspiel</option><option value="director">Regie</option>
          </select>
          {personSearch.entries.length ? <>
            <label htmlFor="kd-radar-person-result">Eindeutige Person</label>
            <select id="kd-radar-person-result" value={selectedPerson} onChange={(event) => setSelectedPerson(event.target.value)}>
              <option value="">Person auswählen</option>
              {personSearch.entries.map((entry, index) => <option key={`${entry.personExternalId}|${entry.role}`}
                value={`person-${index}`}>{entry.name} · {ROLLEN_LABEL[entry.role]}</option>)}
            </select>
          </> : null}
          {personSearch.status === "role_mismatch" ? <p className="kd-entdecken-leer" role="status">Name gefunden, aber nicht in der gewählten Rolle.</p> : null}
          {personSearch.status === "ambiguous" ? <p className="kd-entdecken-leer" role="status">Mehrdeutiger Name. Bitte keine Person automatisch auswählen.</p> : null}
          {personSearch.status === "no_match" ? <p className="kd-entdecken-leer" role="status">Keine kuratierte Person gefunden.</p> : null}
          {!personRadarAvailable ? <p className="kd-entdecken-leer" role="status">Die lokale Personensuche funktioniert. Hinzufügen ist in diesem Konto noch nicht freigeschaltet.</p> : null}
          <button type="button" className="kd-entdecken-primaer" disabled={!personRadarAvailable || !selectedPerson || personAddBusy} onClick={addPerson}>
            {personAddBusy ? "Wird angelegt…" : "Ins Radar"}
          </button>
        </div>
      </article>
    </div>
    {message ? <p className={isErrorStatus(message.status) ? "kd-entdecken-fehler" : "kd-entdecken-pending"}
      role={isErrorStatus(message.status) ? "alert" : "status"}>{message.text}</p> : null}
    <div className="kd-entdecken-radar-grid">
      <article className="kd-entdecken-panel">
        <h3>Meine Ziele</h3>
        {!subscriptions.length && !people.length ? <p className="kd-entdecken-leer">Noch kein Ziel im Radar.</p> : null}
        {subscriptions.length ? <ul>{subscriptions.map((entry) => <RadarZielkarte key={entry.targetId}
          title={localRadarTargetLabel(entry, { master, streamingKnown, streamingDiscover })}
          typeLabel={zielTypLabel(entry)} status={entry.status}>
          {entry.status === "active" && canCheckWork ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={!!busyKey} onClick={() => checkWork(entry)}>
            {busyKey === `work|${entry.targetId}` ? "Wird geprüft…" : "Jetzt prüfen"}
          </button> : null}
          {typeof onRadarChange === "function" ? <>
            <button type="button" className="kd-entdecken-sekundaer"
              onClick={() => onRadarChange(entry, entry.status === "active" ? "pause" : "upsert")}>
              {entry.status === "active" ? "Pausieren" : "Aktivieren"}
            </button>
            <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarChange(entry, "remove")}>Entfernen</button>
          </> : null}
        </RadarZielkarte>)}</ul> : null}
        {people.length ? <ul>{people.map((entry) => <RadarZielkarte key={`${entry.personExternalId}|${entry.role}`}
          title={entry.name} typeLabel={zielTypLabel(entry)} status={entry.status}>
          {entry.status === "active" && canCheckPerson ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={!!busyKey} onClick={() => checkPerson(entry)}>
            {busyKey === `person|${entry.personExternalId}|${entry.role}` ? "Wird geprüft…" : "Jetzt prüfen"}
          </button> : null}
          {typeof onPersonRadarChange === "function" ? <>
            <button type="button" className="kd-entdecken-sekundaer"
              onClick={() => onPersonRadarChange(entry, entry.status === "active" ? "pause" : "upsert")}>
              {entry.status === "active" ? "Pausieren" : "Aktivieren"}
            </button>
            <button type="button" className="kd-entdecken-sekundaer" onClick={() => onPersonRadarChange(entry, "remove")}>Entfernen</button>
          </> : null}
        </RadarZielkarte>)}</ul> : null}
        <PendingRadarConfirmation count={(radarState?.outbox || []).filter((entry) => entry.status === "pending").length}
          syncStatus={syncStatus} onConfirm={onRadarPilotSync} />
      </article>
      <article className="kd-entdecken-panel">
        <h3>Diese Woche</h3>
        {weekEvents.length
          ? <RadarEreignisse entries={weekEvents} receiptByEvent={receiptByEvent} onReceipt={onRadarPilotReceipt} />
          : !personWeekResults.length ? <p className="kd-entdecken-leer">{events.length
            ? "Für die nächsten sieben Tage gibt es noch kein bestätigtes Ereignis."
            : "Noch keine bestätigten Ereignisse für deine aktiven Ziele."}</p> : null}
        {otherEvents.length ? <section className="kd-entdecken-weitere-ereignisse">
          <h4>Weitere bestätigte Ereignisse</h4>
          <RadarEreignisse entries={otherEvents} receiptByEvent={receiptByEvent} onReceipt={onRadarPilotReceipt} />
        </section> : null}
        {personWeekResults.map((result) => {
          const matches = result.decisions;
          return <section className="kd-entdecken-person-result" key={`${result.personExternalId}|${result.role}`}>
            <h4>{result.name} · {ROLLEN_LABEL[result.role]}</h4>
            {matches.length ? <ul>{matches.map((entry) => <li key={`${entry.work.targetId}|${entry.eventType}|${entry.date}|${entry.platform}`}>
              <strong>{entry.work.title}</strong>
              <span>Kuratierter Treffer · {lesbarerTag(entry.date)} · {EREIGNIS_LABEL[entry.eventType] || "Bestätigter Termin"}
                {entry.platform !== "-" ? ` · ${entry.platform}` : ""}</span>
              <div className="kd-radar-quellen"><span>Quellen</span><div className="kd-radar-quellen-links">
                {entry.evidence.map((item) => <a className="kd-radar-quellen-link" href={item.url}
                  key={item.url} rel="noopener noreferrer" target="_blank">{item.sourceDomain}</a>)}
              </div></div>
            </li>)}</ul> : <p className="kd-entdecken-leer">Noch keine bestätigten Werke.</p>}
          </section>;
        })}
      </article>
    </div>
  </section>;
}

export function EntdeckenTab({
  blogProps, fokusId, radarState, seriesCatalog = [], entdeckenStatus = {}, master = [],
  mustwatch = [], streamingKnown = null, streamingDiscover = null, selectedServices = [],
  catalogLoading = false, catalogError = false, accountMode = false,
  webDiscoveryFeed = null, dailyVariety = false,
  radarPilotEvents = [], radarCheckAvailable = false,
  syncStatus = "idle", onRadarPilotReceipt, onRadarPilotSync, onRadarWebsearchCheck,
  personRadarAvailable = false, personRadarCheckAvailable = false,
  onPersonRadarAdd, onPersonRadarChange, onPersonRadarCheck,
  onObserveToggle, onRadarChange, onRadarPreview, onShareChange,
  today = null,
}) {
  const [ansicht, setAnsicht] = useState(fokusId ? "meinungen" : "empfehlungen");
  const [manageOffen, setManageOffen] = useState(false);
  const [useLibrary, setUseLibrary] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const manageButtonRef = useRef(null);
  useEffect(() => {
    let aktiv = true;
    ladeProfil().then((value) => { if (aktiv) setProfile(value); })
      .finally(() => { if (aktiv) setProfileLoading(false); });
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
    {ansicht === "empfehlungen" ? <RecommendationsView streamingEntdecken={streamingDiscover} streamingKnown={streamingKnown}
      master={master} profile={profile} profileLoading={profileLoading} useLibrary={useLibrary}
      selectedServices={selectedServices} catalogLoading={catalogLoading} catalogError={catalogError}
      onRadarPreview={onRadarPreview} entdeckenStatus={entdeckenStatus}
      webDiscoveryFeed={webDiscoveryFeed} dailyVariety={dailyVariety} selectionDay={today} /> : null}
    {ansicht === "radar" ? <RadarView radarState={radarState} master={master} streamingKnown={streamingKnown}
      streamingDiscover={streamingDiscover} accountMode={accountMode} onRadarPreview={onRadarPreview}
      radarPilotEvents={radarPilotEvents} radarCheckAvailable={radarCheckAvailable}
      onRadarPilotReceipt={onRadarPilotReceipt} onRadarWebsearchCheck={onRadarWebsearchCheck}
      personRadarAvailable={personRadarAvailable} onPersonRadarAdd={onPersonRadarAdd}
      personRadarCheckAvailable={personRadarCheckAvailable}
      onPersonRadarCheck={onPersonRadarCheck} onRadarChange={onRadarChange}
      onPersonRadarChange={onPersonRadarChange} today={today}
      syncStatus={syncStatus} onRadarPilotSync={onRadarPilotSync} /> : null}
    {ansicht === "meinungen" ? <div role="tabpanel" aria-label="Blog"><BlogTab {...blogProps} fokusId={fokusId} /></div> : null}
    {manageOffen ? <ManageDialog radarState={radarState} seriesCatalog={seriesCatalog} entdeckenStatus={entdeckenStatus}
      master={master} useLibrary={useLibrary} accountMode={accountMode} onUseLibrary={setUseLibrary}
      onObserveToggle={onObserveToggle} onRadarChange={onRadarChange} onPersonRadarChange={onPersonRadarChange}
      onShareChange={onShareChange} onBlog={openBlog} onClose={closeManage} returnFocusRef={manageButtonRef}
      syncStatus={syncStatus} onRadarPilotSync={onRadarPilotSync} /> : null}
  </section>;
}
