import { useEffect, useRef } from "react";
import { subscribeRemoteStorage } from "../services/storage.js";

/* Nur vom aktiven Kontotreiber bestätigte Änderungen übernehmen. Der Wert
   gehört genau zu diesem Pull; ein späterer asynchroner Read könnte bereits
   eine neue lokale Eingabe enthalten. Keine Schreiboperation beim Empfang. */
export function useRemoteStorageValue(key, receive, onError = null) {
  const current = useRef({ receive, onError });
  current.current = { receive, onError };
  useEffect(() => subscribeRemoteStorage((changes) => {
    const change = changes.find((item) => item.key === key);
    if (!change) return;
    try { current.current.receive(change.value); }
    catch { current.current.onError?.(); }
  }), [key]);
}
