import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlogTab } from "./BlogTab.jsx";
import { ladeProfil } from "../lib/profil.js";
import {
  createEntdeckenRecommendations,
  localCalendarDay,
  localRadarTargetLabel,
  radarSyncProblem,
} from "../lib/entdeckenUi.js";
import { isEntdeckenPinned } from "../lib/entdeckenPins.js";
import { VERSIONED_DISCOVERY_FEED_FORMAT } from "../lib/webDiscoveryFeed.js";
import { serienBeobachten } from "../lib/staffeln.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";
import { projectRadarNews, radarEpisodeIdentity, radarSearchStatusLabel, radarViennaDay } from "../lib/radarNews.js";
import { createPersonRadarTargetId } from "../lib/personRadarCatalog.js";

const ANSICHTEN = Object.freeze([
  ["empfehlungen", "Empfehlungen"],
  ["radar", "Radar"],
  ["meinungen", "Blog"],
]);

const ROLLEN_LABEL = Object.freeze({ actor: "Schauspiel", director: "Regie" });
function ereignisLabel(entry) {
  if (radarEpisodeIdentity(entry)?.episodeNumber) return "Staffel · Folge";
  if (entry?.targetId?.startsWith("release:v1:")) {
    const category = { film: "Film", series: "Serie", season: "Staffel", special: "Special" }[entry.category] || "Film/Serie";
    return `${category} · Start${entry.region === "AT" ? " Österreich" : entry.region === "global" ? " weltweit" : ""}`;
  }
  if (entry?.eventType === "kinostart_at") return "Film · Kinostart Österreich";
  if (entry?.eventType === "serienstart") return "Serie · Start Österreich";
  if (entry?.eventType === "staffelstart") return "Staffel · Start Österreich";
  if (entry?.eventType === "streamingstart_at") {
    const art = entry?.targetType === "series" ? "Serie"
      : entry?.targetType === "work" ? "Film" : "Film/Serie";
    return `${art} · Streamingstart Österreich`;
  }
  return "Film/Serie · Start Österreich";
}
function sichtbarePlattform(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && !/^(?:-|unknown|unbekannt|n\/a)$/iu.test(normalized) ? normalized : null;
}

function focusableElements(root) {
  return [...(root?.querySelectorAll(
    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
  ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function ManageDialog({
  radarState, seriesCatalog, entdeckenStatus, master, useLibrary, accountMode,
  onUseLibrary, onObserveToggle, onRadarChange, onPersonRadarChange, onShareChange,
  syncStatus, onRadarPilotSync, onBlog, onClose, returnFocusRef,
}) {
  const dialogRef = useRef(null);
  const beobachtet = useMemo(
    () => serienBeobachten(entdeckenStatus || {}, seriesCatalog || []),
    [entdeckenStatus, seriesCatalog],
  );
  const subscriptions = radarState?.subscriptions || [];
  const people = radarState?.personSubscriptions || [];
  const pending = radarState?.outbox || [];
  const syncProblem = radarSyncProblem(pending, syncStatus);

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
            })}</ul> : <p className="kd-entdecken-leer">Noch kein Ziel im Radar.</p>}
            {people.length ? <ul className="kd-entdecken-verwalten-liste">{people.map((entry) => <li key={`${entry.personExternalId}|${entry.role}`}>
              <span><strong>{entry.name}</strong><small>{ROLLEN_LABEL[entry.role]} · {entry.status === "active" ? "Aktiv" : "Pausiert"}</small></span>
              {onPersonRadarChange ? <div>
                {entry.authority === "local" ? <button type="button" onClick={() => onPersonRadarChange(entry, entry.status === "active" ? "pause" : "upsert")}>{entry.status === "active" ? "Pausieren" : "Fortsetzen"}</button> : null}
                <button type="button" onClick={() => onPersonRadarChange(entry, "remove")}>Entfernen</button>
              </div> : <small>Änderung derzeit nicht verfügbar.</small>}
            </li>)}</ul> : null}
            {syncProblem ? <RadarSyncProblem problem={syncProblem} onRetry={onRadarPilotSync} /> : null}
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

function RadarSyncProblem({ problem, onRetry }) {
  if (!problem) return null;
  return <div className="kd-entdecken-fehler" role="alert">
    <strong>Radar konnte die Änderung nicht synchronisieren.</strong>
    <span>Prüfe die Verbindung und versuche die Synchronisierung erneut.</span>
    {problem.retryable && typeof onRetry === "function"
      ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRetry()}>Erneut synchronisieren</button>
      : null}
  </div>;
}

function rejectedActionLabel(action) {
  return ({ upsert: "Ziel speichern", pause: "Ziel pausieren", remove: "Ziel entfernen" })[action]
    || "Radarziel ändern";
}

function rejectedReasonText(reason) {
  const value = String(reason || "").toLowerCase();
  if (/target_unavailable|target-unavailable/.test(value)) {
    return "Das Ziel ist auf dem Server nicht mehr in der erwarteten Form verfügbar.";
  }
  if (/quota|limit|too_many|too-many/.test(value)) {
    return "Für dieses Konto ist derzeit kein weiteres aktives Radarziel möglich.";
  }
  if (/forbidden|permission|berechtigung|access/.test(value)) {
    return "Das Konto ist für diese Änderung derzeit nicht berechtigt.";
  }
  if (/invalid|contract|mismatch|drift/.test(value)) {
    return "Die gespeicherten Zieldaten passen nicht mehr zum aktuellen Serververtrag.";
  }
  return "Der Server hat genau diese Änderung abgelehnt; andere Radarziele sind davon nicht automatisch betroffen.";
}

function RadarRejectedChanges({ radarState, onDismiss }) {
  const [busyId, setBusyId] = useState(null);
  const rejected = (radarState?.outbox || []).filter((entry) => entry.status === "rejected");
  if (!rejected.length) return null;
  const dismiss = async (operationId) => {
    if (busyId) return;
    setBusyId(operationId);
    try { await onDismiss?.(operationId); } finally { setBusyId(null); }
  };
  return <section className="kd-radar-ablehnungen" aria-label="Abgelehnte Radaränderungen">
    <h4>Abgelehnte Änderungen</h4>
    <ul>{rejected.map((entry) => <li key={entry.operationId} className="kd-entdecken-fehler">
      <strong>{entry.title || "Unbenanntes Radarziel"}</strong>
      <span>Vorgang: {rejectedActionLabel(entry.action)}</span>
      <span>{rejectedReasonText(entry.reason)}</span>
      {typeof onDismiss === "function" ? <button type="button" className="kd-entdecken-sekundaer"
        disabled={busyId === entry.operationId} onClick={() => void dismiss(entry.operationId)}>
        {busyId === entry.operationId ? "Wird verworfen…" : "Abgelehnte Änderung verwerfen"}
      </button> : null}
    </li>)}</ul>
  </section>;
}

function RecommendationsView({
  streamingEntdecken, streamingKnown, master, profile, useLibrary, selectedServices,
  entdeckenStatus, webDiscoveryFeed, webDiscoveryStatus, dailyVariety, selectionDay,
  recommendationPins, onRecommendationPinToggle,
}) {
  const [showAllPopular, setShowAllPopular] = useState(false);
  const selection = useMemo(() => createEntdeckenRecommendations({
    streamingEntdecken, streamingKnown, master, profile, useLibrary, selectedServices,
    entdeckenStatus, webDiscoveryFeed, dailyVariety, selectionDay,
  }), [dailyVariety, entdeckenStatus, master, profile, selectedServices, selectionDay,
    streamingEntdecken, streamingKnown, useLibrary, webDiscoveryFeed]);
  const { personal, popular } = selection;
  const popularPool = selection.popularPool || popular;
  const visiblePopular = showAllPopular ? popularPool : popular;
  const source = (entry) => entry.externalEvidence?.[0] || null;
  const mediaLabel = (entry) => ["series", "serie", "tv_series"].includes(String(entry.type || "").toLowerCase())
    ? "Serie" : "Film";
  const availabilityLabel = (entry) => entry.availability?.market === "cinema"
    ? "Kino Österreich"
    : entry.availability?.service ? `${entry.availability.service} · Streaming`
      : "Streaming Österreich";
  const meta = (entry) => [availabilityLabel(entry), entry.year, mediaLabel(entry)].filter(Boolean).join(" · ");
  const sourceLabel = (entry) => entry.sourceLabel || source(entry)?.sourceLabel || source(entry)?.domain || "Aktuelle Liste";
  const sourceStand = (entry) => {
    const day = entry.popularity?.measuredOn || source(entry)?.retrievedOn;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
    return new Date(`${day}T12:00:00`).toLocaleDateString("de-AT");
  };
  const titleHeading = (entry) => <h3>{source(entry) ? <a className="kd-entdecken-titellink"
    href={source(entry).url} rel="noopener noreferrer" target="_blank"
    aria-label={`${entry.title}: Referenz bei ${sourceLabel(entry)} öffnen`}>{entry.title}</a> : entry.title}</h3>;
  const publicPool = [5, 6, VERSIONED_DISCOVERY_FEED_FORMAT].includes(webDiscoveryFeed?.format);
  const feedNotice = webDiscoveryStatus?.responseMode === "partial"
    ? "Einige Wochentipps waren unvollständig. Angezeigt werden nur sicher belegte Titel."
    : webDiscoveryStatus?.responseMode === "degraded"
      ? "Die neuen Wochentipps waren nicht verlässlich lesbar. Der bisherige Feed bleibt sichtbar."
      : null;
  const weekMatch = String(webDiscoveryFeed?.isoWeek || "").match(/^(\d{4})-W(\d{2})$/);
  const weekLabel = [5, 6, VERSIONED_DISCOVERY_FEED_FORMAT].includes(webDiscoveryFeed?.format)
    && webDiscoveryFeed?.refreshedOn
    ? `Stand ${new Date(`${webDiscoveryFeed.refreshedOn}T12:00:00`).toLocaleDateString("de-AT")}`
    : weekMatch ? `KW ${Number(weekMatch[2])}/${weekMatch[1]}` : null;
  const pinButton = (entry) => {
    const pinned = isEntdeckenPinned(recommendationPins, entry);
    return <button type="button" className={`kd-entdecken-pin${pinned ? " aktiv" : ""}`}
      aria-label={pinned ? `${entry.title} vom Pinboard lösen` : `${entry.title} am Pinboard anpinnen`}
      aria-pressed={pinned} title={pinned ? "Vom Pinboard lösen" : "Am Pinboard anpinnen"}
      onClick={() => onRecommendationPinToggle?.(entry)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill={pinned ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4h8l-1 6 3 3v1H6v-1l3-3-1-6Z" /><path d="M12 14v6" />
      </svg>
    </button>;
  };
  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-empfehlungen">
    {feedNotice ? <p className="kd-entdecken-pending" role="status">{feedNotice}</p> : null}
    <div className="kd-entdecken-sektionskopf">
      <div><span>Dein lokaler Abgleich</span><h2 id="kd-entdecken-empfehlungen">Für mich</h2></div>
      <p>Verfügbar und noch nicht gesehen. Beste Passung zuerst.</p>
    </div>
    {profile?.beschaedigt ? <p className="kd-entdecken-warnung" role="status">Das Geschmacksprofil ist nicht lesbar. Empfehlungen bleiben vorsichtshalber leer.</p> : null}
    {personal.length ? <div className="kd-entdecken-karten kd-entdecken-auswahlkarten">{personal.map((entry) => (
      <article key={entry.targetId} className="kd-entdecken-hub-karte kd-entdecken-auswahlkarte">
        {pinButton(entry)}
        <span className="kd-entdecken-kicker">{entry.reasons[0] ? "Persönliche Passung" : "Aus dem Wochenfeed"}</span>
        {titleHeading(entry)}
        {entry.reasons[0] ? <p className="kd-entdecken-grund">{entry.reasons[0]}</p> : null}
        <small>{meta(entry)} · Quelle: {sourceLabel(entry)}{sourceStand(entry) ? ` · Stand ${sourceStand(entry)}` : ""}</small>
        {source(entry) && !publicPool ? <a className="kd-entdecken-quellenlink" href={source(entry).url}
          rel="noopener noreferrer" target="_blank">Quelle ansehen</a> : null}
      </article>
    ))}</div> : <p className="kd-entdecken-leer gross">Noch keine bestätigte Passung.</p>}
    <section className="kd-entdecken-weitere" aria-labelledby="kd-entdecken-weitere">
      <div className="kd-entdecken-sektionskopf">
        <div><span>Aktuelle österreichische Liste</span><h2 id="kd-entdecken-weitere">Diese Woche beliebt</h2></div>
        <p>{[6, VERSIONED_DISCOVERY_FEED_FORMAT].includes(webDiscoveryFeed?.format)
          ? "Aktuelle Kino-, Netflix-, Prime-Video-, Disney+- und Apple-TV+-Titel für Österreich. Popularität ist kein persönlicher Passungsgrund."
          : "Aktuelle belegte österreichische Titel. Popularität ist kein persönlicher Passungsgrund."}
          {weekLabel ? ` · ${weekLabel}` : ""}</p>
      </div>
      {visiblePopular.length ? <div id="kd-entdecken-beliebt-karten" className="kd-entdecken-beliebtliste">{visiblePopular.map((entry) => (
        <article key={entry.targetId} className="kd-entdecken-hub-karte kd-entdecken-neutral">
          <div className="kd-entdecken-listeninhalt">
            <span className="kd-entdecken-kicker">{entry.availability?.market === "cinema"
              ? "Im Kino beliebt" : mediaLabel(entry) === "Serie" ? "Beliebte Serie" : "Beliebter Streamingfilm"}</span>
            {titleHeading(entry)}
            <p>{meta(entry)}</p>
            <small>Quelle: {sourceLabel(entry)}{sourceStand(entry) ? ` · Stand ${sourceStand(entry)}` : ""}</small>
            {source(entry) && !publicPool ? <a className="kd-entdecken-quellenlink" href={source(entry).url}
              rel="noopener noreferrer" target="_blank">Quelle ansehen</a> : null}
          </div>
          <div className="kd-entdecken-listenaktionen">
            {pinButton(entry)}
          </div>
        </article>
      ))}</div> : <p className="kd-entdecken-leer gross">Noch keine aktuelle beliebte Liste geladen.</p>}
      {popularPool.length > popular.length ? <button type="button" className="kd-entdecken-mehr"
        aria-expanded={showAllPopular} aria-controls="kd-entdecken-beliebt-karten"
        onClick={() => setShowAllPopular((value) => !value)}>
        {showAllPopular ? "Weniger Titel anzeigen" : `Weitere ${popularPool.length - popular.length} Titel anzeigen`}
      </button> : null}
    </section>
  </section>;
}

function statusText(status, kind = "work") {
  const person = kind === "person";
  const franchise = kind === "franchise";
  const freeText = kind === "text";
  return ({
    active: freeText ? "Ziel gespeichert." : person ? "Person ist jetzt im Radar." : franchise ? "Reihe ist jetzt im Radar." : "Ziel ist jetzt im Radar.",
    pending: "Ziel lokal gespeichert. Die Bestätigung im Konto steht noch aus; die Suche wurde noch nicht gestartet.",
    confirmed: person ? "Bestätigte Filme oder Serien wurden gespeichert." : "Ein bestätigter Treffer wurde gespeichert.",
    no_change: "Keine neue bestätigte Änderung gefunden.",
    insufficient_evidence: freeText ? "Noch keinen passenden Starttermin gefunden." : person ? "Noch keine ausreichend belegten Filme oder Serien gefunden." : "Noch keine ausreichend belegte Änderung gefunden.",
    busy: "Dieses Ziel wird bereits geprüft.",
    forbidden: "Dieses Ziel kann gerade nicht geprüft werden.",
    unresolved: franchise ? "Die Reihe konnte nicht eindeutig bestätigt werden." : "Die Person konnte nicht eindeutig bestätigt werden.",
    unavailable: "Die Suche ist derzeit nicht verfügbar.",
    provider_error: "Die Suche ist derzeit nicht erreichbar.",
    timeout: "Die Suche hat ihre Zeitgrenze erreicht und wurde nicht wiederholt.",
    invalid_response: "Die Suche lieferte kein verlässliches Ergebnis.",
    storage_error: "Das Ergebnis konnte nicht sicher gespeichert werden.",
  })[status] || "Das Ziel konnte nicht geprüft werden.";
}

function isErrorStatus(status) {
  return ["forbidden", "unresolved", "unavailable", "provider_error", "timeout", "invalid_response", "storage_error"].includes(status);
}

function RadarView({
  radarState, master, streamingKnown, streamingDiscover, accountMode,
  radarPilotEvents = [], syncStatus, radarAutomaticAvailable = false,
  onRadarPilotSync, onRadarPilotReceipt, onRadarTextAdd,
  onRadarRejectedDismiss,
}) {
  const [targetQuery, setTargetQuery] = useState("");
  const [targetAddBusy, setTargetAddBusy] = useState(false);
  const targetAddLockRef = useRef(false);
  const activeRef = useRef(true);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const [message, setMessage] = useState(null);
  const subscriptions = radarState?.subscriptions || [];
  const people = radarState?.personSubscriptions || [];
  const syncProblem = radarSyncProblem(radarState?.outbox, syncStatus);
  const radarDay = radarViennaDay();
  const events = useMemo(() => projectRadarNews(radarPilotEvents, radarDay), [radarPilotEvents, radarDay]);
  const searchStatuses = accountMode ? radarState?.pilot?.searchStatuses : undefined;

  const addTarget = async (event) => {
    event.preventDefault();
    if (!targetQuery.trim() || targetQuery.length > 160 || targetAddLockRef.current) return;
    targetAddLockRef.current = true;
    setTargetAddBusy(true);
    setMessage({ status: "saving", text: "Ziel wird gespeichert…" });
    try {
      const result = await onRadarTextAdd?.(targetQuery, { onProgress: (status) => {
        if (activeRef.current && status === "searching") setMessage({ status, text: "Ziel gespeichert. Suche nach passenden Starts…" });
      } });
      if (!activeRef.current) return;
      const prefix = result?.saved && !["active", "pending"].includes(result.status) ? "Ziel bleibt gespeichert. " : "";
      setMessage({ status: result?.status, text: prefix + statusText(result?.status, "text") });
      if (result?.saved || ["active", "pending"].includes(result?.status)) setTargetQuery("");
    } catch {
      if (activeRef.current) setMessage({ status: "storage_error", text: statusText("storage_error") });
    } finally { targetAddLockRef.current = false; if (activeRef.current) setTargetAddBusy(false); }
  };
  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-radar">
    <div className="kd-entdecken-einleitung">
      <div><span>Deine Starttermine</span><h2 id="kd-entdecken-radar">Mein Radar</h2></div>
      <p>{radarAutomaticAvailable
        ? "Dein Radar sucht nach dem Speichern und hält aktive Ziele automatisch auf dem Laufenden."
        : accountMode
          ? "Deine Ziele bleiben gespeichert; die automatische Prüfung ist für dieses Konto derzeit nicht verfügbar."
          : "Deine Ziele bleiben auf diesem Gerät; eine automatische Prüfung ist im Gastmodus nicht verfügbar."} Neuigkeiten zeigen passende Werke mit Titel, Startdatum und Kategorie. Eine erkannte Plattform steht dabei.</p>
    </div>
    <article className="kd-entdecken-panel kd-radar-zielsuche">
      <h3>Radarziel hinzufügen</h3>
      <form className="kd-entdecken-formzeile" onSubmit={addTarget}>
        <label htmlFor="kd-radar-target-search">Wonach soll dein Radar suchen?</label>
        <input id="kd-radar-target-search" type="search" value={targetQuery} maxLength={160} disabled={targetAddBusy}
          autoComplete="off" spellCheck={false} placeholder="Person, Reihe, Titel oder Thema"
          onChange={(event) => { setTargetQuery(event.target.value); setMessage(null); }} />
        <small>Dein Suchtext bleibt unter „Meine Ziele“. Gefundene Werke erscheinen unter „Neuigkeiten“.</small>
        <button type="submit" className="kd-entdecken-primaer"
          disabled={targetAddBusy || !targetQuery.trim()}>{targetAddBusy ? message?.status === "searching" ? "Suche läuft…" : "Wird gespeichert…" : "Im Radar speichern"}</button>
      </form>
    </article>
    {message ? <p className={isErrorStatus(message.status) ? "kd-entdecken-fehler" : "kd-entdecken-pending"}
      role={isErrorStatus(message.status) ? "alert" : "status"}>{message.text}</p> : null}
    <div className="kd-entdecken-radar-grid">
      <article className="kd-entdecken-panel">
        <h3>Meine Ziele</h3>
        {!subscriptions.length && !people.length ? <p className="kd-entdecken-leer">Noch kein Ziel im Radar.</p> : null}
        {subscriptions.length ? <ul>{subscriptions.map((entry) => <li key={entry.targetId}>
          <strong>{localRadarTargetLabel(entry, { master, streamingKnown, streamingDiscover })}</strong>
          <span>{entry.status === "active" ? "Aktiv" : "Pausiert"}{entry.targetType === "text" ? " · Freitext" : ` · ${entry.targetType === "franchise" ? "Reihe" : entry.targetType === "series" ? "Serie" : "Film"}`}</span>
          {accountMode ? <span className="kd-radar-suchstatus">{radarSearchStatusLabel(searchStatuses, entry.targetId)}</span> : null}
        </li>)}</ul> : null}
        {people.length ? <ul>{people.map((entry) => <li key={`${entry.personExternalId}|${entry.role}`}>
          <strong>{entry.name}</strong><span>{ROLLEN_LABEL[entry.role]} · {entry.status === "active" ? "Aktiv" : "Pausiert"}</span>
          {accountMode ? <span className="kd-radar-suchstatus">{radarSearchStatusLabel(searchStatuses, createPersonRadarTargetId(entry.personExternalId, entry.role))}</span> : null}
        </li>)}</ul> : null}
        <RadarRejectedChanges radarState={radarState} onDismiss={onRadarRejectedDismiss} />
        {syncProblem ? <RadarSyncProblem problem={syncProblem} onRetry={onRadarPilotSync} /> : null}
      </article>
      <article className="kd-entdecken-panel">
        <h3>Neuigkeiten</h3>
        {events.length ? <ul className="kd-radar-neuigkeiten">{events.map((entry) => <li key={entry.eventVersionId}>
          <strong>{entry.title}</strong>
          <span>{entry.date} · {entry.kind === "season" ? `Staffel · ${entry.dateLabel}` : ereignisLabel(entry)}{sichtbarePlattform(entry.platform) ? ` · ${sichtbarePlattform(entry.platform)}` : ""}</span>
          {entry.kind === "season" ? <details className="kd-radar-folgen">
            <summary>{entry.episodes.length} {entry.episodes.length === 1 ? "Folge" : "Folgen"} anzeigen</summary>
            <ol>{entry.episodes.map((episode) => <li key={episode.eventVersionId}>
              <strong>Folge {episode.episodeNumber}{episode.episodeTitle ? ` · ${episode.episodeTitle}` : ""}</strong>
              <span>{episode.date}{episode.region === "AT" ? " · Österreich" : episode.region === "global" ? " · weltweit" : ""}{sichtbarePlattform(episode.platform) ? ` · ${sichtbarePlattform(episode.platform)}` : ""}</span>
            </li>)}</ol>
          </details> : null}
        </li>)}</ul> : <p className="kd-entdecken-leer">Noch keine belegte Neuigkeit. Dein Radar zeigt hier gefundene Starttermine.</p>}
      </article>
    </div>
  </section>;
}

export function EntdeckenTab({
  blogProps, fokusId, radarState, datenKontextKey = "local", seriesCatalog = [], entdeckenStatus = {}, master = [],
  streamingKnown = null, streamingDiscover = null, selectedServices = [], accountMode = false,
  webDiscoveryFeed = null, webDiscoveryStatus = null, dailyVariety = false, calendarDay = null,
  radarPilotEvents = [], syncStatus = "idle", radarAutomaticAvailable = false,
  onRadarPilotSync, onRadarPilotReceipt, onRadarTextAdd,
  onRadarRejectedDismiss,
  personRadarAvailable = false, onPersonRadarAdd, onPersonRadarChange,
  onObserveToggle, onRadarChange, onRadarPreview, onShareChange,
  recommendationPins = [], onRecommendationPinToggle,
}) {
  const [ansicht, setAnsicht] = useState(fokusId ? "meinungen" : "empfehlungen");
  const [manageOffen, setManageOffen] = useState(false);
  const [useLibrary, setUseLibrary] = useState(true);
  const [profile, setProfile] = useState(null);
  const [selectionDay] = useState(() => calendarDay || localCalendarDay());
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
    {ansicht === "empfehlungen" ? <RecommendationsView streamingEntdecken={streamingDiscover} streamingKnown={streamingKnown}
      master={master} profile={profile} useLibrary={useLibrary} selectedServices={selectedServices}
      entdeckenStatus={entdeckenStatus} webDiscoveryFeed={webDiscoveryFeed} webDiscoveryStatus={webDiscoveryStatus}
      dailyVariety={dailyVariety} selectionDay={selectionDay} recommendationPins={recommendationPins}
      onRecommendationPinToggle={onRecommendationPinToggle} /> : null}
    {ansicht === "radar" ? <RadarView key={datenKontextKey} radarState={radarState} master={master} streamingKnown={streamingKnown}
      streamingDiscover={streamingDiscover} accountMode={accountMode} onRadarPreview={onRadarPreview}
      radarPilotEvents={radarPilotEvents} syncStatus={syncStatus} onRadarPilotSync={onRadarPilotSync}
      radarAutomaticAvailable={radarAutomaticAvailable} onRadarPilotReceipt={onRadarPilotReceipt}
      onRadarTextAdd={onRadarTextAdd}
      onRadarRejectedDismiss={onRadarRejectedDismiss}
      personRadarAvailable={personRadarAvailable} onPersonRadarAdd={onPersonRadarAdd} /> : null}
    {ansicht === "meinungen" ? <div role="tabpanel" aria-label="Blog"><BlogTab {...blogProps} fokusId={fokusId} /></div> : null}
    {manageOffen ? <ManageDialog radarState={radarState} seriesCatalog={seriesCatalog} entdeckenStatus={entdeckenStatus}
      master={master} useLibrary={useLibrary} accountMode={accountMode} onUseLibrary={setUseLibrary}
      onObserveToggle={onObserveToggle} onRadarChange={onRadarChange} onPersonRadarChange={onPersonRadarChange}
      onShareChange={onShareChange} syncStatus={syncStatus} onRadarPilotSync={onRadarPilotSync}
      onBlog={openBlog} onClose={closeManage} returnFocusRef={manageButtonRef} /> : null}
  </section>;
}
