import { T, kontrastFarbe } from "../lib/tokens.js";
import { bewertungskategorieLabel } from "../lib/kategorien.js";
import { quelleBadges, QUELLEN_KLASSEN } from "../lib/quellen.js";

/* ---------- Dreieck-Glyph (Signatur) ----------
   bw == null (unbewertet): NUR der Umriss, gestrichelt — ein leeres Dreieck ist
   klar unterscheidbar von einer echten 0/0/0-Bewertung. */
export function Dreieck({ bw, size = 44 }) {
  const c = size / 2, r = size / 2 - 3;
  const ang = [-90, 30, 150];
  const pt = (a, rad) => [c + rad * Math.cos((a * Math.PI) / 180), c + rad * Math.sin((a * Math.PI) / 180)];
  const outer = ang.map((a) => pt(a, r).join(",")).join(" ");
  if (bw == null) {
    return (
      <svg width={size} height={size} viewBox={"0 0 " + size + " " + size} aria-label="unbewertet">
        <polygon points={outer} fill="none" stroke={T.rauch} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      </svg>
    );
  }
  const vals = [bw?.wie ?? 0, bw?.was ?? 0, bw?.warum ?? 0];
  const inner = ang.map((a, i) => pt(a, (Math.max(vals[i], 0.35) / 5) * r).join(",")).join(" ");
  const dots = ang.map((a, i) => ({ p: pt(a, (Math.max(vals[i], 0.35) / 5) * r), col: [T.wie, T.was, T.warum][i] }));
  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size} aria-label={"wie " + vals[0] + ", was " + vals[1] + ", warum " + vals[2]}>
      <polygon points={outer} fill="none" stroke={T.rauch} strokeWidth="1" opacity="0.5" />
      <polygon points={inner} fill={T.wolfram} opacity="0.22" stroke={T.wolfram} strokeWidth="1.4" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.p[0]} cy={d.p[1]} r="2.4" fill={d.col} />
      ))}
    </svg>
  );
}

/* Sichtbarer unbewertet-Zustand (ersetzt den KategorieTag, solange bewertung null ist). */
export function UnbewertetTag() {
  return (
    <span className="kd-tag kd-tag-unbewertet" style={{ "--kd-tag-markierung": T.rauch }}>
      UNBEWERTET
    </span>
  );
}

export function AxisChips({ bw }) {
  const items = [["WIE", bw?.wie, T.wie], ["WAS", bw?.was, T.was], ["WARUM", bw?.warum, T.warum]];
  return (
    <span className="kd-achse" style={{ display: "inline-flex", gap: 8 }}>
      {items.map(([l, v, col]) => (
        <span key={l} className="kd-achse-wert" style={{ "--kd-achse-markierung": col }}>{l} {v ?? "–"}</span>
      ))}
    </span>
  );
}

/* `title` wird DURCHGEREICHT. Es fehlte, und damit war jeder Tooltip, den ein
   Aufrufer mitgab, wirkungslos — betroffen sämtliche Signal-Chips im Finder
   ("Harter Filter — schränkt die Treffer ein" / "Weicher Wunsch — sortiert nur
   um") und der Merken-Chip mit seiner Erklärung des Lern-Kreislaufs. Die
   Unterscheidung der Chip-Klassen hing danach allein an der Farbe. */
export function Chip({ active, onClick, children, color, title }) {
  const aktiveFarbe = color || T.wolfram;
  return (
    <button
      onClick={onClick}
      title={title}
      className="kd-chip"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 600,
        fontSize: "calc(14px * var(--kd-schriftfaktor, 1))",
        lineHeight: 1.35,
        minHeight: 44,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid " + (active ? aktiveFarbe : "var(--kd-control-muted, " + T.rauch + ")"),
        background: active ? aktiveFarbe : "transparent",
        color: active ? kontrastFarbe(aktiveFarbe) : "var(--kd-control-muted, " + T.rauch + ")",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Etappe 2: Mobile-Bausteine ----------
   ChipReihe: EINE horizontal wischbare Zeile am Handy (<=760px); auf dem
   Desktop wrappt sie wie die bisherigen Flex-Reihen. Das Verhalten steckt
   KOMPLETT in .kd-chiprow (index.css, Media-Query) — hier bewusst KEIN
   flexWrap/overflow inline, sonst schlägt der Inline-Style die Media-Query
   (Scrim-Bug-Lehre, index.css:181-184). style nur für gap/marginBottom. */
export function ChipReihe({ children, style }) {
  return <div className="kd-chiprow" style={style}>{children}</div>;
}

/* SegmentedControl: exklusiver Umschalter. options = [{id, label, badge?}],
   badge wird als " (n)" angehängt (Tests matchen auf diese Textform, z. B.
   /^Im Besitz \(/). Optik = die bisherigen Inline-Knopf-Fabriken (Barlow 15px);
   die Mobile-Verdichtung übernimmt .kd-seg (index.css). dataTour landet am
   Container — Tour-Anker wie data-tour="streaming-views" bleiben erhalten. */
export function SegmentedControl({ options, value, onChange, dataTour, style, className = "" }) {
  /* style nur für Layout im Umfeld (marginBottom/flex) — flexWrap/overflow
     NIE inline setzen, das steuert .kd-seg per Media-Query. */
  return (
    <div className={("kd-seg " + className).trim()} role="group" data-tour={dataTour} style={style}>
      {options.map((o) => (
        <button className="kd-seg-control" key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: "calc(14px * var(--kd-schriftfaktor, 1))",
            lineHeight: 1.35, minHeight: 44, padding: "8px 12px",
            border: "1px solid " + (value === o.id ? T.wolfram : T.rauch), borderRadius: 8, cursor: "pointer",
            background: value === o.id ? T.wolfram : "transparent", color: value === o.id ? kontrastFarbe(T.wolfram) : T.rauch,
          }}>
          {o.label}{o.badge != null ? ` (${o.badge})` : ""}
        </button>
      ))}
    </div>
  );
}

/* Klappe: <details>-Accordion mit kompakter Kopfzeile für die Einstellungs-
   Blöcke (Etappe 2). tour setzt data-tour am <details>, damit Tour-Anker
   auch bei zugeklapptem Block ein Ziel haben. offen = Startzustand;
   danach togglet der Browser nativ (kein JS-State). */
export function Klappe({ titel, offen = false, tour, id, markiert = false, status = null, children }) {
  return (
    <details id={id} className={"kd-klappe" + (markiert ? " kd-klappe-markiert" : "")}
      open={offen || undefined} data-tour={tour}>
      <summary className="kd-klappe-kopf" style={{ color: T.wolfram }}>
        {titel}
        {status && <span className="kd-klappe-status">{status}</span>}
      </summary>
      <div className="kd-klappe-inhalt">{children}</div>
    </details>
  );
}

export function KategorieTag({ k }) {
  const farben = {
    immer_gut: T.wolfram,
    kult: T.wie,
    kult_klassiker: T.was,
    daemlich_aber_herrlich: T.warum,
    trash: T.gefahr,
    sehenswert: T.rauch,
    echter_schrott: T.gefahr,
    // Legacy (alte Storage-Stände):
    sicher_gut: T.wolfram,
    wahrscheinlich_passend: T.wie,
    referenz: T.rauch,
    zu_pruefen: T.gefahr,
  };
  const legacyLabel = {
    sicher_gut: "SICHER GUT",
    wahrscheinlich_passend: "PASSEND",
    referenz: "REFERENZ",
    zu_pruefen: "ZU PRÜFEN",
  };
  const label = (bewertungskategorieLabel(k) || legacyLabel[k] || k || "—").toUpperCase();
  const col = farben[k] || T.rauch;
  return (
    <span className="kd-tag" style={{ "--kd-tag-markierung": col }}>
      {label}
    </span>
  );
}

export function QuellenBadges({ quelle }) {
  const farben = {
    [QUELLEN_KLASSEN.PHYSISCH]: T.wie,
    [QUELLEN_KLASSEN.DIGITAL_GEKAUFT]: T.was,
    [QUELLEN_KLASSEN.ABO]: T.wolfram,
    [QUELLEN_KLASSEN.SONSTIG]: T.rauch,
  };
  const badges = quelleBadges(quelle);
  if (!badges.length) return null;
  return (
    <span className="kd-quellenbadges" aria-label="Gespeicherte Quellen">
      {badges.map(({ key, label, klasse }) => (
        <span key={key} className={`kd-quellenbadge kd-quellenbadge-${klasse}`}
          style={{ "--kd-quellenfarbe": farben[klasse], borderColor: farben[klasse] }}>
          {label}
        </span>
      ))}
    </span>
  );
}

export function KinoTicket({ titel, jahr, kino, termin, expanded, onToggle, children }) {
  const vars = {
    "--kd-leinwand": T.leinwand, "--kd-leinwandTief": T.leinwandTief,
    "--kd-tinte": T.tinte, "--kd-rauch": T.rauch, "--kd-wolfram": T.wolfram,
  };
  const bedienbar = typeof onToggle === "function";
  const klappbar = typeof expanded === "boolean";
  return (
    <article className={`kd-dash-ticket kd-kino-ticket${expanded ? " offen" : ""}`} style={vars}>
      <button type="button" className="kd-kino-ticket-trigger" onClick={onToggle}
        disabled={!bedienbar} aria-expanded={klappbar ? expanded : undefined}>
        <span className="kd-dash-tbody">
          <span className="kd-dash-film">{titel}</span>
          <span className="kd-dash-meta">{[jahr, kino].filter(Boolean).join(" · ")}</span>
          {termin && <span className="kd-dash-showtime"><IconClock size={12} /> {termin}</span>}
        </span>
        {klappbar && <span className="kd-kino-ticket-pfeil" aria-hidden="true"><IconChevronDown /></span>}
      </button>
      {expanded && children && <div className="kd-kino-ticket-details">{children}</div>}
    </article>
  );
}

/* ---------- UI-Icons (Inline-SVG, fill=currentColor) ----------
   Als Komponenten, NICHT als Bilddateien: so folgen sie automatisch der
   Button-Farbe (inkl. gefahr), Hover und Disabled. Assets: ui/*.svg. */
const svgProps = (size) => ({ width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", style: { display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0 } });
export function IconSettings({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M13.6 2h-3.2l-.5 2.3a8 8 0 0 0-1.7 1L6 4.6 4.6 6l.7 2.2a8 8 0 0 0-1 1.7L2 10.4v3.2l2.3.5c.25.62.58 1.2 1 1.7L4.6 18 6 19.4l2.2-.7c.53.42 1.1.75 1.7 1l.5 2.3h3.2l.5-2.3a8 8 0 0 0 1.7-1l2.2.7 1.4-1.4-.7-2.2c.42-.53.75-1.1 1-1.7l2.3-.5v-3.2l-2.3-.5a8 8 0 0 0-1-1.7l.7-2.2L18 4.6l-2.2.7a8 8 0 0 0-1.7-1L13.6 2Zm-1.6 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" /></svg>;
}
export function IconImport({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M11 2h2v9.2l3.1-3.1 1.4 1.4-5.5 5.5-5.5-5.5 1.4-1.4L11 11.2V2Z" /><path fill="currentColor" d="M3 15h2v5h14v-5h2v7H3v-7Z" /></svg>;
}
export function IconExport({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M13 16h-2V6.8L7.9 9.9 6.5 8.5 12 3l5.5 5.5-1.4 1.4L13 6.8V16Z" /><path fill="currentColor" d="M3 15h2v5h14v-5h2v7H3v-7Z" /></svg>;
}
export function IconDelete({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M9 2h6v2h5v2H4V4h5V2Z" /><path fill="currentColor" d="M5 7h14l-1 15H6L5 7Zm4.2 2 .4 11h1.6l-.3-11H9.2Zm3.9 0-.3 11h1.6l.4-11h-1.7Z" /></svg>;
}
export function IconClose({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" /></svg>;
}
export function IconSearch({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M10.5 3a7.5 7.5 0 1 0 4.62 13.4L20 21.3l1.3-1.3-4.9-4.88A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" /></svg>;
}
export function IconPlus({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z" /></svg>;
}
export function IconStar({ size = 16, filled = false }) {
  return <svg {...svgProps(size)} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
}
export function IconCheck({ size = 16 }) {
  return <svg {...svgProps(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>;
}
export function IconChevronDown({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="m6.7 8.5 5.3 5.3 5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7 1.4-1.4Z" /></svg>;
}
export function IconArrowRight({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="m13 4-1.4 1.4 5.6 5.6H4v2h13.2l-5.6 5.6L13 20l8-8-8-8Z" /></svg>;
}
export function IconPin({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.1 7 13 7 13s7-7.9 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" /></svg>;
}
export function IconClock({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 2v5.6l4.3 2.6 1-1.7-3.3-2V7h-2Z" /></svg>;
}
export function IconHelp({ size = 16 }) {
  return <svg {...svgProps(size)}><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm0-4.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm0-10.2a3.5 3.5 0 0 0-3.5 3.5h2a1.5 1.5 0 1 1 2.4 1.2c-.95.73-2.4 1.68-2.4 3.7v.5h2V14c0-.82.48-1.2 1.62-2.08A3.5 3.5 0 0 0 12 5.6Z" /></svg>;
}

/* ---------- Logo / Bildmarke (dreigeteiltes Dreieck) ----------
   Fugen sind transparent (Maske) -> nehmen die Untergrundfarbe an.
   Keil-Farben fix aus dem Design-System (wie/warum/was). Assets: logo/logo.svg. */
export function Logo({ size = 120 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label="Kinodreieck" style={{ display: "block" }}>
      <mask id="kd-logo-mask">
        <rect width="1024" height="1024" fill="#fff" />
        <path fill="#000" d="M527,475 L527,120 L497,120 L497,475 Z" />
        <path fill="#000" d="M502.8,486.8 L875.2,776.8 L893.6,753.2 L521.2,463.2 Z" />
        <path fill="#000" d="M502.8,463.2 L130.4,753.2 L148.8,776.8 L521.2,486.8 Z" />
      </mask>
      <g mask="url(#kd-logo-mask)">
        <path fill="#6FA8DC" d="M512,475 L139.6,765 L512,120 Z" />
        <path fill="#E3A63B" d="M512,475 L512,120 L884.4,765 Z" />
        <path fill="#B08BD9" d="M512,475 L884.4,765 L139.6,765 Z" />
      </g>
    </svg>
  );
}
