import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlogTab } from "./BlogTab.jsx";
import { ladeProfil } from "../lib/profil.js";
import {
  createCatalogRadarTarget,
  createEntdeckenRecommendations,
  localCalendarDay,
  localRadarTargetLabel,
} from "../lib/entdeckenUi.js";
import { istBeobachtet, serienBeobachten } from "../lib/staffeln.js";
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
            })}</ul> : <p className="kd-entdecken-leer">Noch kein Ziel im Radar.</p>}
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
  streamingEntdecken, streamingKnown, master, profile, useLibrary, selectedServices,
  entdeckenStatus, webDiscoveryFeed, webDiscoveryStatus, dailyVariety, selectionDay,
  onRadarPreview, onObserveToggle,
}) {
  const selection = useMemo(() => createEntdeckenRecommendations({
    streamingEntdecken, streamingKnown, master, profile, useLibrary, selectedServices,
    entdeckenStatus, webDiscoveryFeed, dailyVariety, selectionDay,
  }), [dailyVariety, entdeckenStatus, master, profile, selectedServices, selectionDay,
    streamingEntdecken, streamingKnown, useLibrary, webDiscoveryFeed]);
  const { personal, further } = selection;
  const source = (entry) => entry.externalEvidence?.[0] || null;
  const mediaLabel = (entry) => ["series", "serie", "tv_series"].includes(String(entry.type || "").toLowerCase())
    ? "Serie" : "Film";
  const meta = (entry) => [...(entry.services || []).slice(0, 2), entry.year, mediaLabel(entry)].filter(Boolean).join(" · ");
  const observeAction = (entry) => entry.watchmodeId
    && ["series", "serie", "tv_series"].includes(String(entry.type || "").toLowerCase());
  const feedNotice = webDiscoveryStatus?.responseMode === "partial"
    ? "Einige Wochentipps waren unvollständig. Angezeigt werden nur sicher belegte Titel."
    : webDiscoveryStatus?.responseMode === "degraded"
      ? "Die neuen Wochentipps waren nicht verlässlich lesbar. Der bisherige Feed bleibt sichtbar."
      : null;
  const weekMatch = String(webDiscoveryFeed?.isoWeek || "").match(/^(\d{4})-W(\d{2})$/);
  const weekLabel = weekMatch ? `KW ${Number(weekMatch[2])}/${weekMatch[1]}` : null;
  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-empfehlungen">
    {feedNotice ? <p className="kd-entdecken-pending" role="status">{feedNotice}</p> : null}
    <div className="kd-entdecken-sektionskopf">
      <div><span>Dein lokaler Abgleich</span><h2 id="kd-entdecken-empfehlungen">Für mich</h2></div>
      <p>Verfügbar und noch nicht gesehen.{dailyVariety ? " Heute neu gemischt." : " Beste Passung zuerst."}</p>
    </div>
    {profile?.beschaedigt ? <p className="kd-entdecken-warnung" role="status">Das Geschmacksprofil ist nicht lesbar. Empfehlungen bleiben vorsichtshalber leer.</p> : null}
    {personal.length ? <div className="kd-entdecken-karten">{personal.map((entry) => {
      const target = createCatalogRadarTarget({ watchmodeId: entry.watchmodeId, title: entry.title, type: entry.type });
      return <article key={entry.targetId} className="kd-entdecken-hub-karte">
        <span className="kd-entdecken-kicker">{entry.reasons[0] ? "Persönliche Passung" : "Aus dem Wochenfeed"}</span>
        <h3>{entry.title}</h3>
        {entry.reasons[0] ? <p className="kd-entdecken-grund">{entry.reasons[0]}</p> : null}
        <small>{meta(entry)}{source(entry) ? ` · Webtipp: ${source(entry).domain}` : " · Streamingkatalog Österreich"}</small>
        {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarPreview?.(target)}>Ins Radar</button> : null}
        {observeAction(entry) ? <button type="button" className="kd-entdecken-sekundaer"
          aria-pressed={istBeobachtet(entdeckenStatus?.[entry.watchmodeId])}
          onClick={() => onObserveToggle?.(entry, !istBeobachtet(entdeckenStatus?.[entry.watchmodeId]))}>
          {istBeobachtet(entdeckenStatus?.[entry.watchmodeId]) ? "Beobachtet" : "Beobachten"}
        </button> : null}
      </article>;
    })}</div> : <p className="kd-entdecken-leer gross">Noch keine bestätigte Passung.</p>}
    <section className="kd-entdecken-weitere" aria-labelledby="kd-entdecken-weitere">
      <div className="kd-entdecken-sektionskopf">
        <div><span>Von anderen empfohlen</span><h2 id="kd-entdecken-weitere">Weitere Entdeckungen</h2></div>
        <p>Aktuell positiv belegte Wochentipps aus dem Feed.{weekLabel ? ` · ${weekLabel}` : ""}</p>
      </div>
      {further.length ? <div className="kd-entdecken-karten">{further.map((entry) => {
        const evidence = source(entry);
        const target = createCatalogRadarTarget({ watchmodeId: entry.watchmodeId, title: entry.title, type: entry.type });
        return <article key={entry.targetId} className="kd-entdecken-hub-karte kd-entdecken-neutral">
          <span className="kd-entdecken-kicker">{evidence?.domain || "Webtipp"}</span>
          <h3>{entry.title}</h3>
          <p>{meta(entry)}</p>
          {evidence ? <a className="kd-entdecken-quellenlink" href={evidence.url} rel="noopener noreferrer" target="_blank">Quelle ansehen</a> : null}
          {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={() => onRadarPreview?.(target)}>Ins Radar</button> : null}
          {observeAction(entry) ? <button type="button" className="kd-entdecken-sekundaer"
            aria-pressed={istBeobachtet(entdeckenStatus?.[entry.watchmodeId])}
            onClick={() => onObserveToggle?.(entry, !istBeobachtet(entdeckenStatus?.[entry.watchmodeId]))}>
            {istBeobachtet(entdeckenStatus?.[entry.watchmodeId]) ? "Beobachtet" : "Beobachten"}
          </button> : null}
        </article>;
      })}</div> : <p className="kd-entdecken-leer gross">Noch keine belegten Webtipps geladen.</p>}
    </section>
  </section>;
}

function statusText(status, kind = "work") {
  const person = kind === "person";
  const franchise = kind === "franchise";
  const freeText = kind === "text";
  return ({
    active: freeText ? "Ziel gespeichert." : person ? "Person ist jetzt im Radar." : franchise ? "Reihe ist jetzt im Radar." : "Ziel ist jetzt im Radar.",
    confirmed: person ? "Bestätigte Filme oder Serien wurden gespeichert." : "Ein bestätigter Treffer wurde gespeichert.",
    no_change: "Keine neue bestätigte Änderung gefunden.",
    insufficient_evidence: freeText ? "Kein belegter neuer Fund." : person ? "Noch keine ausreichend belegten Filme oder Serien gefunden." : "Noch keine ausreichend belegte Änderung gefunden.",
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

function radarResultText(result, kind) {
  const base = statusText(result?.status, kind);
  if (!["partial", "degraded"].includes(result?.responseMode)
      || typeof result?.displayText !== "string" || !result.displayText) return base;
  return `${base} ${result.displayText}`;
}

function RadarView({
  radarState, master, streamingKnown, streamingDiscover, accountMode,
  radarPilotEvents = [], radarCheckAvailable = false,
  onRadarPilotReceipt, onRadarWebsearchCheck,
  personRadarCheckAvailable = false, onPersonRadarCheck, onRadarTextAdd,
}) {
  const [targetQuery, setTargetQuery] = useState("");
  const [targetAddBusy, setTargetAddBusy] = useState(false);
  const targetAddLockRef = useRef(false);
  const [busyKey, setBusyKey] = useState("");
  const checkLockRef = useRef(false);
  const [message, setMessage] = useState(null);
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
      title: entry.title || localRadarTargetLabel(subscriptions.find((item) => item.targetId === entry.targetId) || entry.targetId, {
        master, streamingKnown, streamingDiscover,
      }),
    }))
    .sort((a, b) => `${a.date}|${a.title}`.localeCompare(`${b.date}|${b.title}`, "de-AT")),
  [master, radarPilotEvents, streamingDiscover, streamingKnown, subscriptions]);

  const addTarget = async (event) => {
    event.preventDefault();
    if (!targetQuery.trim() || targetQuery.length > 160 || targetAddLockRef.current) return;
    targetAddLockRef.current = true;
    setTargetAddBusy(true);
    setMessage(null);
    try {
      const result = await onRadarTextAdd?.(targetQuery);
      setMessage({ status: result?.status, text: statusText(result?.status, "text") });
      if (["active", "pending"].includes(result?.status)) setTargetQuery("");
    } catch {
      setMessage({ status: "storage_error", text: statusText("storage_error") });
    } finally { targetAddLockRef.current = false; setTargetAddBusy(false); }
  };
  const checkWork = async (entry) => {
    if (!radarCheckAvailable || checkLockRef.current) return;
    checkLockRef.current = true;
    setBusyKey(`work|${entry.targetId}`); setMessage(null);
    try {
      const result = await onRadarWebsearchCheck?.(entry.targetId);
      setMessage({ status: result?.status, text: radarResultText(result, entry.targetType) });
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error") }); }
    finally { checkLockRef.current = false; setBusyKey(""); }
  };
  const checkPerson = async (entry) => {
    if (!personRadarCheckAvailable || checkLockRef.current) return;
    checkLockRef.current = true;
    setBusyKey(`person|${entry.personExternalId}|${entry.role}`); setMessage(null);
    try {
      const result = await onPersonRadarCheck?.(entry);
      setMessage({ status: result?.status, text: radarResultText(result, "person") });
    } catch { setMessage({ status: "provider_error", text: statusText("provider_error", "person") }); }
    finally { checkLockRef.current = false; setBusyKey(""); }
  };

  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-radar">
    <div className="kd-entdecken-einleitung">
      <div><span>Deine Starttermine</span><h2 id="kd-entdecken-radar">Mein Radar</h2></div>
      <p>{accountMode ? "Bestätigte Ziele aus deinem Konto." : "Deine Ziele bleiben auf diesem Gerät."} Ein Fund erscheint erst, wenn Zielbezug, Österreich-Bezug und Datum eindeutig belegt sind.</p>
    </div>
    <article className="kd-entdecken-panel kd-radar-zielsuche">
      <h3>Radarziel hinzufügen</h3>
      <form className="kd-entdecken-formzeile" onSubmit={addTarget}>
        <label htmlFor="kd-radar-target-search">Wonach soll dein Radar suchen?</label>
        <input id="kd-radar-target-search" type="search" value={targetQuery} maxLength={160}
          autoComplete="off" spellCheck={false} placeholder="Zum Beispiel Mutter Teresa"
          onChange={(event) => { setTargetQuery(event.target.value); setMessage(null); }} />
        <small>Beliebiger Text, maximal 160 Zeichen. Gespeichert wird erst beim Absenden; geprüft nur auf deinen Klick.</small>
        <button type="submit" className="kd-entdecken-primaer"
          disabled={targetAddBusy || !targetQuery.trim()}>{targetAddBusy ? "Wird gespeichert…" : "Im Radar speichern"}</button>
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
          <span>{entry.status === "active" ? "Aktiv" : "Pausiert"}{entry.targetType === "text" ? "" : ` · ${entry.targetType === "franchise" ? "Reihe" : entry.targetType === "series" ? "Serie" : "Film"}`}</span>
          {entry.status === "active" && radarCheckAvailable ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={!!busyKey} onClick={() => checkWork(entry)}>
            {busyKey === `work|${entry.targetId}` ? "Wird geprüft…" : "Jetzt prüfen"}
          </button> : null}
        </li>)}</ul> : null}
        {people.length ? <ul>{people.map((entry) => <li key={`${entry.personExternalId}|${entry.role}`}>
          <strong>{entry.name}</strong><span>{ROLLEN_LABEL[entry.role]} · {entry.status === "active" ? "Aktiv" : "Pausiert"}</span>
          {entry.status === "active" && personRadarCheckAvailable ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={!!busyKey} onClick={() => checkPerson(entry)}>
            {busyKey === `person|${entry.personExternalId}|${entry.role}` ? "Wird geprüft…" : "Jetzt prüfen"}
          </button> : null}
        </li>)}</ul> : null}
        {(radarState?.outbox || []).length ? <p className="kd-entdecken-pending" role="status">Eine Änderung wartet noch auf Bestätigung.</p> : null}
      </article>
      <article className="kd-entdecken-panel">
        <h3>Neue Funde</h3>
        {events.length ? <ul>{events.map((entry) => <li key={entry.eventVersionId}>
          <strong>{entry.title}</strong>
          <span>{entry.date} · {entry.region} · {EREIGNIS_LABEL[entry.eventType] || "Bestätigter Termin"}{entry.platform && entry.platform !== "-" ? ` · ${entry.platform}` : ""}</span>
          {[...(entry.evidence || []), ...(entry.franchiseEvidence || [])].length ? <div className="kd-pilot-quellen"><span>Quellen</span><div className="kd-pilot-quellen-links">
            {[...(entry.evidence || []), ...(entry.franchiseEvidence || [])].map((item, index) => <a className="kd-pilot-quellen-link" href={item.url}
              key={`${entry.eventVersionId}-source-${index}`} rel="noopener noreferrer" target="_blank">{item.sourceDomain}</a>)}
          </div></div> : null}
          {typeof onRadarPilotReceipt === "function" ? <button type="button" className="kd-entdecken-sekundaer"
            disabled={receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status === "accepted_week"}
            onClick={() => onRadarPilotReceipt({ eventId: entry.eventId, eventVersionId: entry.eventVersionId, status: "accepted_week" })}>
            {receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status === "accepted_week" ? "Angepinnt" : "Fund anpinnen"}
          </button> : null}
        </li>)}</ul> : <p className="kd-entdecken-leer">Noch kein neuer belegter Fund für deine aktiven Ziele.</p>}
        {personResults.map((result) => {
          const matches = result.decisions.filter((entry) => entry.status === "matched" && entry.work);
          return <section className="kd-entdecken-person-result" key={`${result.personExternalId}|${result.role}`}>
            <h4>{result.name} · {ROLLEN_LABEL[result.role]}</h4>
            {matches.length ? <ul>{matches.map((entry) => <li key={entry.work.targetId}>
              <strong>{entry.work.title}</strong><span>{entry.work.year}</span>
            </li>)}</ul> : <p className="kd-entdecken-leer">Noch keine bestätigten Filme oder Serien.</p>}
          </section>;
        })}
      </article>
    </div>
  </section>;
}

export function EntdeckenTab({
  blogProps, fokusId, radarState, seriesCatalog = [], entdeckenStatus = {}, master = [],
  streamingKnown = null, streamingDiscover = null, selectedServices = [], accountMode = false,
  webDiscoveryFeed = null, webDiscoveryStatus = null, dailyVariety = false, calendarDay = null,
  radarPilotEvents = [], radarCheckAvailable = false,
  onRadarPilotReceipt, onRadarWebsearchCheck, onRadarTextAdd,
  personRadarAvailable = false, personRadarCheckAvailable = personRadarAvailable,
  onPersonRadarAdd, onPersonRadarChange, onPersonRadarCheck,
  franchiseRadarAvailable = false, onFranchiseRadarAdd,
  onObserveToggle, onRadarChange, onRadarPreview, onShareChange,
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
      dailyVariety={dailyVariety} selectionDay={selectionDay} onRadarPreview={onRadarPreview}
      onObserveToggle={onObserveToggle} /> : null}
    {ansicht === "radar" ? <RadarView radarState={radarState} master={master} streamingKnown={streamingKnown}
      streamingDiscover={streamingDiscover} accountMode={accountMode} onRadarPreview={onRadarPreview}
      radarPilotEvents={radarPilotEvents} radarCheckAvailable={radarCheckAvailable}
      onRadarPilotReceipt={onRadarPilotReceipt} onRadarWebsearchCheck={onRadarWebsearchCheck}
      onRadarTextAdd={onRadarTextAdd}
      personRadarAvailable={personRadarAvailable} onPersonRadarAdd={onPersonRadarAdd}
      personRadarCheckAvailable={personRadarCheckAvailable} onPersonRadarCheck={onPersonRadarCheck}
      franchiseRadarAvailable={franchiseRadarAvailable}
      onFranchiseRadarAdd={onFranchiseRadarAdd} /> : null}
    {ansicht === "meinungen" ? <div role="tabpanel" aria-label="Blog"><BlogTab {...blogProps} fokusId={fokusId} /></div> : null}
    {manageOffen ? <ManageDialog radarState={radarState} seriesCatalog={seriesCatalog} entdeckenStatus={entdeckenStatus}
      master={master} useLibrary={useLibrary} accountMode={accountMode} onUseLibrary={setUseLibrary}
      onObserveToggle={onObserveToggle} onRadarChange={onRadarChange} onPersonRadarChange={onPersonRadarChange}
      onShareChange={onShareChange} onBlog={openBlog} onClose={closeManage} returnFocusRef={manageButtonRef} /> : null}
  </section>;
}
