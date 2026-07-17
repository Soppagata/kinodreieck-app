/* Box-Platzierung der Tour-Hinweise (rein, testbar).
   Regel: die Textbox liegt AUSSERHALB des eingerahmten Elements — unten, sonst
   oben. Nur wenn die Box (Höhe boxH + Abstand gap) auf KEINER Seite passt, weil
   das Element fast den ganzen Viewport füllt (Streaming-Quellen), landet sie in
   der Ecke — der einzige erlaubte Fall "im Rahmen".
   r  = getBoundingClientRect des Ziels (top/bottom), vh = Viewport-Höhe. */
export function boxPlatzierung(r, vh, boxH, gap = 22) {
  const raumUnten = vh - r.bottom, raumOben = r.top;
  if (raumUnten >= boxH + gap) return { modus: "unten", top: r.bottom + gap };
  if (raumOben >= boxH + gap) return { modus: "oben", top: Math.max(12, r.top - gap - boxH) };
  return { modus: "ecke" };
}
