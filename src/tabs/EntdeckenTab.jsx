import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import radarFixtures from "../data/radar_phase2_fixtures.json";
import { BlogTab } from "./BlogTab.jsx";
import { ladeProfil } from "../lib/profil.js";
import { decodeAndValidateLocalProposal } from "../lib/radarProposalValidator.js";
import { projectLocalRadarWeek } from "../lib/localEventRadar.js";
import {
  createCatalogRadarTarget,
  createFixtureRadarLedger,
  localRadarTargetLabel,
  rankLocalEntdeckenRecommendations,
} from "../lib/entdeckenUi.js";
import { validateRadarPilotImportPayload } from "../lib/radarPilotContracts.js";
import { serienBeobachten } from "../lib/staffeln.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

const ANSICHTEN = Object.freeze([
  ["empfehlungen", "Empfehlungen"],
  ["radar", "Radar"],
  ["meinungen", "Meinungen"],
]);

function focusableElements(root) {
  return [...(root?.querySelectorAll(
    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
  ) || [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function ManageDialog({
  radarState, seriesCatalog, entdeckenStatus, master, useLibrary, accountMode,
  onUseLibrary, onObserveToggle, onRadarChange, onShareChange, onOpinions, onClose, returnFocusRef,
}) {
  const dialogRef = useRef(null);
  const beobachtet = useMemo(
    () => serienBeobachten(entdeckenStatus || {}, seriesCatalog || []),
    [entdeckenStatus, seriesCatalog],
  );
  const subscriptions = radarState?.subscriptions || [];
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
      /* WebKit verwirft einen Fokuswechsel, der noch im Escape-Keydown und
         gleichzeitig mit dem Portalabbau passiert. Ein Frame später ist der
         Auslöser wieder der stabile, sichtbare Zielknoten. */
      requestAnimationFrame(() => {
        if (vorher?.isConnected) vorher.focus?.({ preventScroll: true });
      });
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
            <p>Serien- und Folgenstände aus dem vorhandenen Streaming-Katalog. Das ist unabhängig vom Event-Radar.</p>
            {beobachtet.length ? <ul className="kd-entdecken-verwalten-liste">{beobachtet.map((entry) => (
              <li key={entry.watchmode_id}><span><strong>{entry.titel}</strong><small>Watchmode {entry.watchmode_id}</small></span>
                <button type="button" onClick={() => onObserveToggle?.(entry, false)}>Beobachtung beenden</button></li>
            ))}</ul> : <p className="kd-entdecken-leer">Noch keine Serie beobachtet.</p>}
          </section>

          <section>
            <h3>Mein Radar</h3>
            <p>{accountMode ? "Nur der serverbestätigte Kontocache ist wirksam; lokale Änderungen warten in der Outbox." : "Diese Abos bleiben nur in deinem lokalen persönlichen Topf."}</p>
            {subscriptions.length ? <ul className="kd-entdecken-verwalten-liste">{subscriptions.map((entry) => {
              const shared = (radarState?.shares || []).some((share) => share.targetId === entry.targetId && share.status === "active");
              return <li key={entry.targetId}>
                <span><strong>{localRadarTargetLabel(entry.targetId, { master, fixtures: radarFixtures })}</strong><small>{entry.status === "active" ? "Aktiv" : "Pausiert"} · AT</small></span>
                <div>
                  <button type="button" onClick={() => onRadarChange?.(entry, entry.status === "active" ? "pause" : "upsert")}>{entry.status === "active" ? "Pausieren" : "Fortsetzen"}</button>
                  <button type="button" onClick={() => onRadarChange?.(entry, "remove")}>Entfernen</button>
                  {accountMode && entry.authority === "server" ? <button type="button" aria-pressed={shared}
                    onClick={() => onShareChange?.(entry.targetId, !shared)}>{shared ? "Nicht mehr teilen" : "Anonym teilen"}</button> : null}
                </div>
              </li>;
            })}</ul> : <p className="kd-entdecken-leer">Noch kein Radarziel aktiv.</p>}
            {pending.length ? <div className="kd-entdecken-pending"><strong>{pending.length} lokale Änderung{pending.length === 1 ? "" : "en"}</strong> warten auf Serverbestätigung. Kein Providerjob wurde gestartet.</div> : null}
          </section>

          <section>
            <h3>Empfehlungen</h3>
            <label className="kd-entdecken-check"><input type="checkbox" checked={useLibrary} onChange={(event) => onUseLibrary(event.target.checked)} />
              <span><strong>Explizit bewertete Mediathek einbeziehen</strong><small>Nur lesend; keine neuen Profilsignale und keine Telemetrie.</small></span></label>
          </section>

          <section>
            <h3>Meinungen</h3>
            <p>Deine bestehenden Blog-Daten, geteilten Artikel und Deep-Links bleiben unverändert.</p>
            <button type="button" className="kd-entdecken-primaer" onClick={onOpinions}>Meinungen öffnen</button>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function RecommendationsView({ streamingEntdecken, master, profile, useLibrary, onRadarPreview }) {
  const recommendations = useMemo(() => rankLocalEntdeckenRecommendations({
    streamingEntdecken, master, profile, useLibrary,
  }), [master, profile, streamingEntdecken, useLibrary]);

  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-empfehlungen">
    <div className="kd-entdecken-einleitung">
      <div><span>Lokal & erklärbar</span><h2 id="kd-entdecken-empfehlungen">Empfehlungen für dich</h2></div>
      <p>Deterministisch aus bestätigten Profilsignalen und – wenn gewählt – ausdrücklich bewerteten Mediathek-Einträgen. Kein LLM, kein Profil-Write.</p>
    </div>
    {profile?.beschaedigt ? <p className="kd-entdecken-warnung" role="status">Das Geschmacksprofil ist nicht lesbar. Empfehlungen bleiben vorsichtshalber leer.</p> : null}
    {recommendations.length ? <div className="kd-entdecken-karten">{recommendations.map((entry) => {
      const catalogEntry = (streamingEntdecken?.titel || []).find((item) => `watchmode:${item.watchmode_id}` === entry.targetId);
      const target = createCatalogRadarTarget({ watchmodeId: catalogEntry?.watchmode_id, title: entry.title, type: catalogEntry?.typ });
      return <article key={entry.targetId} className="kd-entdecken-hub-karte">
        <span className="kd-entdecken-kicker">Persönliche Passung · AT verfügbar</span>
        <h3>{entry.title}</h3>
        <ul>{entry.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <small>Quelle: lokaler Streaming-Katalog AT. Ein Quellenrang wird nicht als Geschmacksrang ausgegeben.</small>
        {target ? <button type="button" className="kd-entdecken-sekundaer" onClick={(event) => {
          event.currentTarget.focus(); onRadarPreview?.(target);
        }}>Ins Radar</button> : null}
      </article>;
    })}</div> : <p className="kd-entdecken-leer gross">Noch keine belastbare persönliche Empfehlung. Dafür braucht es ein bestätigtes Profilsignal oder eine passende ausdrücklich positive Mediathek-Bewertung.</p>}
    <div className="kd-entdecken-quellenblock">
      <article><strong>Streaming-Charts</strong><span>Nicht aktiv – Rechtefreigabe fehlt.</span></article>
      <article><strong>ÖFI-/Kinostart-Listen</strong><span>Nicht aktiv – Rechtefreigabe fehlt.</span></article>
    </div>
  </section>;
}

function RadarView({
  radarState,
  master,
  streamingKnown,
  streamingDiscover,
  accountMode,
  onRadarPreview,
  radarPilotClientEnabled = false,
  radarPilotActive = false,
  radarPilotEvents = [],
  radarReview = false,
  syncStatus = "disabled",
  onRadarPilotReceipt,
  onRadarPilotImport,
  onRadarPilotSync,
}) {
  const [proposalRaw, setProposalRaw] = useState("");
  const [expectedHash, setExpectedHash] = useState("");
  const [proposalResult, setProposalResult] = useState(null);
  const [pilotImportRaw, setPilotImportRaw] = useState("");
  const [pilotImportBusy, setPilotImportBusy] = useState(false);
  const [pilotSyncBusy, setPilotSyncBusy] = useState(false);
  const [pilotImportMessage, setPilotImportMessage] = useState("");
  const [pilotReceiptBusy, setPilotReceiptBusy] = useState("");
  const pilotReceiptInFlight = useRef(new Set());
  const ledger = useMemo(() => createFixtureRadarLedger(radarFixtures), []);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fixtureWeek = useMemo(() => projectLocalRadarWeek({ state: radarState, ledger, startDate: today }), [ledger, radarState, today]);
  const receiptByEvent = useMemo(() => new Map((radarState?.receipts || []).map((entry) => [
    `${entry.eventId}|${entry.versionId}`,
    entry,
  ])), [radarState?.receipts]);
  const pilotWeek = useMemo(() => (radarPilotEvents || []).map((entry) => ({
    eventId: entry.eventId,
    eventVersionId: entry.eventVersionId,
    targetId: entry.targetId,
    eventType: entry.eventType,
    date: entry.date,
    region: entry.region,
    platform: entry.platform,
    lifecycleStatus: entry.lifecycleStatus,
    verificationStatus: entry.verificationStatus,
    title: entry.title || localRadarTargetLabel(entry.targetId, {
      master, streamingKnown, streamingDiscover, fixtures: radarFixtures,
    }),
  })).filter((entry) => entry.date >= today && entry.date <= weekEnd), [radarPilotEvents, master, streamingDiscover, streamingKnown, today, weekEnd]);
  const canPilotControls = radarPilotClientEnabled && accountMode && radarPilotActive;
  const canPilotReceipt = canPilotControls && typeof onRadarPilotReceipt === "function";
  const canPilotImport = canPilotControls && radarReview === true && typeof onRadarPilotImport === "function";
  const canPilotSync = radarPilotClientEnabled && accountMode;
  const week = canPilotControls ? pilotWeek : fixtureWeek;
  const fixtureTarget = radarFixtures.catalog[0];
  const active = radarState?.subscriptions || [];
  const pending = radarState?.outbox || [];

  const ladeBeispiel = () => {
    setProposalRaw(JSON.stringify(radarFixtures.radarProposal, null, 2));
    setExpectedHash(radarFixtures.radarProposal.inputHash);
    setProposalResult(null);
  };
  const pruefe = () => setProposalResult(decodeAndValidateLocalProposal(proposalRaw, {
    sourceRegistry: radarFixtures.sourceRegistry,
    catalog: radarFixtures.catalog,
    expectedInputHash: expectedHash.trim(),
  }));
  const fuehrePilotImport = async () => {
    if (!canPilotImport || pilotImportBusy) return;
    let payload = null;
    try { payload = JSON.parse(pilotImportRaw); } catch {
      setPilotImportMessage("JSON ungültig");
      return;
    }
    const result = validateRadarPilotImportPayload(payload);
    if (!result.ok) {
      setPilotImportMessage(`Import ungültig: ${result.errors.join(", ")}`);
      return;
    }
    setPilotImportBusy(true);
    setPilotImportMessage("");
    try {
      const queued = await onRadarPilotImport(payload);
      setPilotImportMessage(queued ? "Import wurde in Outbox geschrieben." : "Import nicht gespeichert.");
    } finally {
      setPilotImportBusy(false);
    }
  };
  const fuehrePilotSync = useCallback(async () => {
    if (!canPilotSync || pilotSyncBusy) return;
    setPilotSyncBusy(true);
    try {
      await onRadarPilotSync?.();
    } finally {
      setPilotSyncBusy(false);
    }
  }, [canPilotSync, onRadarPilotSync, pilotSyncBusy]);
  const fuehrePilotReceipt = async (entry) => {
    if (!canPilotReceipt || pilotReceiptBusy === entry.eventVersionId
      || pilotReceiptInFlight.current.has(entry.eventVersionId) || !entry.eventId || !entry.eventVersionId
    ) return;
    pilotReceiptInFlight.current.add(entry.eventVersionId);
    setPilotReceiptBusy(entry.eventVersionId);
    try {
      await onRadarPilotReceipt({
        eventId: entry.eventId,
        eventVersionId: entry.eventVersionId,
        status: "seen",
      });
    } finally {
      pilotReceiptInFlight.current.delete(entry.eventVersionId);
      setPilotReceiptBusy("");
    }
  };

  return <section className="kd-entdecken-ansicht" aria-labelledby="kd-entdecken-radar">
    <div className="kd-entdecken-einleitung">
      <div><span>Lokaler Event-Radar</span><h2 id="kd-entdecken-radar">Mein Radar</h2></div>
      <p>{accountMode ? "Kontomodus: nur serverbestätigte Abos wirken; neue Aktionen bleiben lokale Outbox-Vorschläge." : "Gastmodus: Abos bleiben lokal auf diesem Gerät."} Diese Phase startet weder Provider noch Scheduler.</p>
    </div>

    <div className="kd-entdecken-radar-grid">
      <article className="kd-entdecken-panel">
        <h3>Beobachtete Ziele</h3>
        {active.length ? <ul>{active.map((entry) => <li key={entry.targetId}><strong>{localRadarTargetLabel(entry.targetId, {
          master, streamingKnown, streamingDiscover, fixtures: radarFixtures,
        })}</strong><span>{entry.status === "active" ? "Aktiv" : "Pausiert"} · {entry.region}</span></li>)}</ul>
          : <p className="kd-entdecken-leer">Noch kein Ziel im Radar.</p>}
        {pending.length ? <p className="kd-entdecken-pending">{pending.length} Änderung{pending.length === 1 ? "" : "en"} nur lokal vorgemerkt.</p> : null}
      </article>
      <article className="kd-entdecken-panel">
        <h3>Diese Woche</h3>
        {week.length ? <ul>{week.map((entry) => canPilotControls
          ? <li key={entry.eventVersionId || entry.versionId}>
            <strong>{entry.title || localRadarTargetLabel(entry.targetId, {
              master, streamingKnown, streamingDiscover, fixtures: radarFixtures,
            })}</strong>
            <span>{entry.date} · {entry.eventType} · {entry.lifecycleStatus || ""} · {entry.verificationStatus || ""} · {entry.region} · {entry.platform}</span>
            {canPilotReceipt ? <div>
              {receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`)?.status ? (
                <small>Status: {receiptByEvent.get(`${entry.eventId}|${entry.eventVersionId}`).status}</small>
              ) : null}
              <button type="button" className="kd-entdecken-sekundaer" disabled={pilotReceiptBusy === entry.eventVersionId}
                onClick={() => fuehrePilotReceipt(entry)}>
                {pilotReceiptBusy === entry.eventVersionId ? "Wird gespeichert…" : "Gesehen"}
              </button>
            </div> : null}
          </li>
          : <li key={entry.versionId}>
            <strong>{entry.title}</strong><span>{entry.date} · {entry.eventType} · nur Vorschau</span>
          </li>)}</ul>
          : <p className="kd-entdecken-leer">Keine lokal bestätigten Ereignisse für deine aktiven Ziele.</p>}
        <small>Keine Kalender- oder Erinnerungsänderung.</small>
      </article>
    </div>

    {canPilotSync || canPilotControls ? <article className="kd-entdecken-panel">
      <h3>Pilot</h3>
      <p className="kd-entdecken-kopfleiste">Status: {pilotSyncBusy ? "syncing" : syncStatus}</p>
      <button type="button" className="kd-entdecken-sekundaer" disabled={pilotSyncBusy} onClick={fuehrePilotSync}>Pilot-Sync starten</button>
    </article> : null}

    {canPilotImport ? <article className="kd-entdecken-proposal">
      <h3>Pilot-Import</h3>
      <textarea aria-label="Pilot-Import JSON" className="kd-entdecken-textarea" rows={8} value={pilotImportRaw}
        onChange={(event) => setPilotImportRaw(event.target.value)} spellCheck="false" />
      <div className="kd-entdecken-proposal-aktionen">
        <button type="button" className="kd-entdecken-sekundaer" onClick={fuehrePilotImport} disabled={pilotImportBusy || !pilotImportRaw.trim()}>
          {pilotImportBusy ? "Import läuft…" : "Pilot-Import bestätigen"}
        </button>
      </div>
      {pilotImportMessage ? <p className="kd-entdecken-kleingedruckt">{pilotImportMessage}</p> : null}
    </article> : null}

    <article className="kd-entdecken-hub-karte kd-entdecken-fixture">
      <span className="kd-entdecken-kicker">Synthetische Fixture · keine Live-Nutzerdaten</span>
      <h3>Von anderen entdeckt: {fixtureTarget.title}</h3>
      <p>Diese Karte demonstriert nur den anonymen Übergabepunkt. Sie enthält keine echte Community-Auswertung.</p>
      <button type="button" className="kd-entdecken-sekundaer" onClick={(event) => {
        event.currentTarget.focus(); onRadarPreview?.(fixtureTarget);
      }}>In mein Radar</button>
    </article>

    <article className="kd-entdecken-parked">
      <span>Bewusst geparkt</span><h3>Personen-Automatik</h3>
      <p>Der Recall-Spike hat die Abnahmegrenze verfehlt. Deshalb gibt es hier weder Personen-Schalter noch automatische Beobachtung oder Radar-Aktion.</p>
    </article>

    <details className="kd-entdecken-proposal">
      <summary>Read-only Proposal-Vorschau</summary>
      <p>Lokale JSON-Prüfung gegen synthetisches Register und Katalog. Es gibt keinen Import, keinen Retry und keine Routine.</p>
      <div className="kd-entdecken-proposal-aktionen">
        <button type="button" className="kd-entdecken-sekundaer" onClick={ladeBeispiel}>Synthetisches Beispiel einsetzen</button>
        <label>Erwarteter Input-Hash<input value={expectedHash} onChange={(event) => setExpectedHash(event.target.value)} spellCheck="false" /></label>
      </div>
      <textarea aria-label="Proposal JSON" value={proposalRaw} onChange={(event) => setProposalRaw(event.target.value)} rows={10} spellCheck="false" />
      <button type="button" className="kd-entdecken-primaer" onClick={pruefe}>Nur Vorschau prüfen</button>
      {proposalResult ? <div className={`kd-entdecken-proposal-result ${proposalResult.ok ? "ok" : "blockiert"}`} role="status">
        <strong>{proposalResult.ok ? "Vorschau geprüft" : "Vorschau blockiert"}</strong>
        <span>Status: {proposalResult.status}</span>
        {proposalResult.summary ? <span>{proposalResult.summary.matched}/{proposalResult.summary.total} passend · {proposalResult.summary.ambiguous} mehrdeutig · {proposalResult.summary.blocked} blockiert</span> : null}
        {proposalResult.errors?.length ? <span>Fehler: {proposalResult.errors.join(", ")}</span> : null}
        <span>Writes: {String(proposalResult.writes)} · Routine: {String(proposalResult.routineActivated)} · Auto-Retry: {String(proposalResult.automaticRetry)}</span>
      </div> : null}
    </details>
  </section>;
}

export function EntdeckenTab({
  blogProps, fokusId, radarState, seriesCatalog = [], entdeckenStatus = {}, master = [],
  streamingKnown = null, streamingDiscover = null, accountMode = false,
  radarPilotClientEnabled = false,
  radarPilotActive = false,
  radarPilotEvents = [],
  radarReview = false,
  syncStatus = "disabled",
  onRadarPilotReceipt,
  onRadarPilotImport,
  onRadarPilotSync,
  onObserveToggle,
  onRadarChange,
  onRadarPreview,
  onShareChange,
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
  const openOpinions = useCallback(() => { setManageOffen(false); setAnsicht("meinungen"); }, []);

  return <section className="kd-entdecken" data-testid="entdecken-tab">
    <div className="kd-entdecken-toolbar">
      <nav className="kd-entdecken-tabs" aria-label="Entdecken-Ansichten" role="tablist">
        {ANSICHTEN.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={ansicht === id}
          className={ansicht === id ? "aktiv" : ""} onClick={() => setAnsicht(id)}>{label}</button>)}
      </nav>
      <button ref={manageButtonRef} type="button" className="kd-entdecken-verwalten" onClick={(event) => {
        event.currentTarget.focus(); setManageOffen(true);
      }}>⚙ Entdecken verwalten</button>
    </div>

    {ansicht === "empfehlungen" ? <RecommendationsView streamingEntdecken={streamingDiscover} master={master}
      profile={profile} useLibrary={useLibrary} onRadarPreview={onRadarPreview} /> : null}
    {ansicht === "radar" ? <RadarView radarState={radarState} master={master} streamingKnown={streamingKnown}
      streamingDiscover={streamingDiscover} accountMode={accountMode} onRadarPreview={onRadarPreview}
      radarPilotClientEnabled={radarPilotClientEnabled} radarPilotActive={radarPilotActive} radarPilotEvents={radarPilotEvents}
      radarReview={radarReview} syncStatus={syncStatus}
      onRadarPilotReceipt={onRadarPilotReceipt} onRadarPilotImport={onRadarPilotImport} onRadarPilotSync={onRadarPilotSync} /> : null}
    {ansicht === "meinungen" ? <div role="tabpanel" aria-label="Meinungen"><BlogTab {...blogProps} fokusId={fokusId} /></div> : null}

    {manageOffen ? <ManageDialog radarState={radarState} seriesCatalog={seriesCatalog} entdeckenStatus={entdeckenStatus}
      master={master} useLibrary={useLibrary} accountMode={accountMode} onUseLibrary={setUseLibrary}
      onObserveToggle={onObserveToggle} onRadarChange={onRadarChange} onShareChange={onShareChange}
      onOpinions={openOpinions} onClose={closeManage} returnFocusRef={manageButtonRef} /> : null}
  </section>;
}
