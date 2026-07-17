import { T } from "../lib/tokens.js";
import { kinoLink, istImAbo, NONSTOP_PROGRAMM_URL } from "../lib/kinos.js";

/* Kinonamen als klickbare Buchungs-/Programmlinks */
export function KinoLinks({ kinos }) {
  const liste = kinos || [];
  if (!liste.length) return null;
  return (
    <span>
      {liste.map((k, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <a href={kinoLink(k)} target="_blank" rel="noopener noreferrer"
            style={{ color: "inherit", textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}
            title={kinoLink(k) === NONSTOP_PROGRAMM_URL ? "Zur Nonstop-Programmseite (Buchung dort)" : "Zur Kino-Website / Buchung"}>
            {k}&thinsp;↗
          </a>
          {istImAbo(k) && <span title="Im Nonstop-Abo (Sonderveranstaltungen ggf. ausgenommen)" style={{ color: T.wolfram }}> ✓</span>}
        </span>
      ))}
    </span>
  );
}
