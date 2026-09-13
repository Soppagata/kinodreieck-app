import { useEffect, useRef } from "react";

const PORTION = 20;

export function StreamingPageWindow({
  items = [], visible, onVisibleChange, hasMore = false, backgroundLoading = false,
  status = "idle", error = null, total = null, children,
}) {
  const sentinelRef = useRef(null);
  const itemsLengthRef = useRef(items.length);
  const hiddenLoadedRef = useRef(0);
  const onVisibleChangeRef = useRef(onVisibleChange);
  const sentinelInViewRef = useRef(false);
  const encounterConsumedRef = useRef(false);
  const revealForEncounterRef = useRef(() => {});
  const shown = items.slice(0, visible);
  const hiddenLoaded = Math.max(0, items.length - shown.length);
  const emptyErrorText = typeof error === "string" && error.trim()
    ? error.trim() : "Titel konnten nicht geladen werden.";
  itemsLengthRef.current = items.length;
  hiddenLoadedRef.current = hiddenLoaded;
  onVisibleChangeRef.current = onVisibleChange;
  revealForEncounterRef.current = () => {
    if (!sentinelInViewRef.current || encounterConsumedRef.current || hiddenLoadedRef.current <= 0) return;
    encounterConsumedRef.current = true;
    onVisibleChangeRef.current((count) => Math.min(itemsLengthRef.current, count + PORTION));
  };

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver !== "function") return undefined;
    const observer = new IntersectionObserver((entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (!inView) {
        sentinelInViewRef.current = false;
        encounterConsumedRef.current = false;
        return;
      }
      sentinelInViewRef.current = true;
      revealForEncounterRef.current();
    }, { rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* Eine bereits sichtbare Begegnung darf auf das nächste vorab geladene
     Paket warten. Seine Ankunft verbraucht diese Begegnung genau einmal. */
  useEffect(() => { revealForEncounterRef.current(); }, [hiddenLoaded]);

  return <>
    {children(shown)}
    <div ref={sentinelRef} className="kd-streaming-page-more" data-testid="streaming-page-more">
      {hiddenLoaded > 0 ? <span>{shown.length} von {typeof total === "number" ? total : items.length}</span> : null}
      {hiddenLoaded === 0 && (hasMore || backgroundLoading) ? <span role="status">Weitere Titel werden vorbereitet …</span> : null}
      {status === "loading" && shown.length === 0 ? <span role="status">Erste Titel werden geladen …</span> : null}
      {status === "refreshing" && shown.length > 0 ? <span role="status">Katalog wird aktualisiert …</span> : null}
      {status === "error" ? <span role="status" className="kd-streaming-page-error">
        {shown.length > 0 ? "Weitere Titel konnten nicht geladen werden. Die vorhandenen Karten bleiben verfügbar." : emptyErrorText}
      </span> : null}
    </div>
  </>;
}

export const STREAMING_PAGE_PORTION = PORTION;
