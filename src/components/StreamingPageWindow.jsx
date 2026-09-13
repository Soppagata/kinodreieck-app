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
  const shown = items.slice(0, visible);
  const hiddenLoaded = Math.max(0, items.length - shown.length);
  const emptyErrorText = typeof error === "string" && error.trim()
    ? error.trim() : "Titel konnten nicht geladen werden.";
  itemsLengthRef.current = items.length;
  hiddenLoadedRef.current = hiddenLoaded;
  onVisibleChangeRef.current = onVisibleChange;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver !== "function") return undefined;
    const observer = new IntersectionObserver((entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (!inView) { sentinelInViewRef.current = false; return; }
      if (sentinelInViewRef.current) return;
      sentinelInViewRef.current = true;
      if (hiddenLoadedRef.current > 0) {
        onVisibleChangeRef.current((count) => Math.min(itemsLengthRef.current, count + PORTION));
      }
    }, { rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
