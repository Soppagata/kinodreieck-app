/* Nur die sichtbare App arbeitet automatisch. Ein Timer liest lokal den Status;
   ohne offene Writes entstehen daraus keine Netzwerkabfragen. Browser-Events
   holen zusätzlich neuere Kontodaten. Alle Aufträge laufen durch den bestehenden
   SessionCoordinator mit seinen Konto-, Freigabe- und Epochengrenzen. */
export function startAccountAutoSync({
  coordinator, status,
  eventTarget = window, documentTarget = document,
  online = () => navigator.onLine !== false,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let stopped = false, running = null, timer = null, retryDelay = 5000;
  const visible = () => documentTarget.visibilityState !== "hidden";
  const pending = () => {
    const s = status();
    return s?.configured && s.pending?.some((key) =>
      !s.conflict?.includes(key) && !s.zuGross?.includes(key) && !s.schemaVeraltet?.includes(key));
  };
  const schedule = () => {
    if (timer != null) clearTimer(timer);
    timer = null;
    if (!stopped && visible()) timer = setTimer(tick, retryDelay);
  };
  const run = () => {
    if (stopped || !visible() || !online()) return Promise.resolve();
    if (running) return running;
    running = Promise.resolve().then(() => coordinator.refresh()).catch(() => {})
      .finally(() => {
        running = null;
        retryDelay = pending() ? Math.min(retryDelay * 2, 60000) : 5000;
        schedule();
      });
    return running;
  };
  function tick() {
    timer = null;
    if (pending() && visible() && online()) return run();
    retryDelay = 5000;
    schedule();
  }
  const wake = () => {
    retryDelay = 5000;
    if (visible()) return run();
    schedule();
  };
  eventTarget.addEventListener("online", wake);
  eventTarget.addEventListener("focus", wake);
  documentTarget.addEventListener("visibilitychange", wake);
  schedule();
  return () => {
    stopped = true;
    if (timer != null) clearTimer(timer);
    eventTarget.removeEventListener("online", wake);
    eventTarget.removeEventListener("focus", wake);
    documentTarget.removeEventListener("visibilitychange", wake);
  };
}
