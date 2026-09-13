import { useEffect, useRef } from "react";
import { T, btnStyle } from "../lib/tokens.js";

const PORTION = 20;

export function StreamingPageWindow({
  items = [], visible, onVisibleChange, hasMore = false, backgroundLoading = false,
  status = "idle", error = null, total = null, children,
}) {
  const sentinelRef = useRef(null);
  const shown = items.slice(0, visible);
  const hiddenLoaded = Math.max(0, items.length - shown.length);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || hiddenLoaded <= 0 || typeof IntersectionObserver !== "function") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onVisibleChange((count) => Math.min(items.length, count + PORTION));
      }
    }, { rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hiddenLoaded, items.length, onVisibleChange]);

  return <>
    {children(shown)}
    <div ref={sentinelRef} className="kd-streaming-page-more" data-testid="streaming-page-more">
      {hiddenLoaded > 0 ? <button type="button" style={{ ...btnStyle(true), padding: "8px 14px" }}
        onClick={() => onVisibleChange((count) => Math.min(items.length, count + PORTION))}>
        Weitere {Math.min(PORTION, hiddenLoaded)} anzeigen
      </button> : null}
      {hiddenLoaded > 0 ? <span>{shown.length} von {typeof total === "number" ? total : items.length}</span> : null}
      {hiddenLoaded === 0 && (hasMore || backgroundLoading) ? <span role="status">Weitere Titel werden vorbereitet …</span> : null}
      {status === "loading" && shown.length === 0 ? <span role="status">Erste Titel werden geladen …</span> : null}
      {status === "refreshing" && shown.length > 0 ? <span role="status">Katalog wird aktualisiert …</span> : null}
      {status === "error" ? <span role="status" className="kd-streaming-page-error">
        {shown.length > 0 ? "Weitere Titel konnten nicht geladen werden. Die vorhandenen Karten bleiben verfügbar." : (error || "Titel konnten nicht geladen werden.")}
      </span> : null}
    </div>
  </>;
}

export const STREAMING_PAGE_PORTION = PORTION;
