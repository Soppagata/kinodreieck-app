import { T } from "../lib/tokens.js";

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
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: T.rauch, border: "1px dashed " + T.rauch, borderRadius: 3, padding: "2px 6px" }}>
      UNBEWERTET
    </span>
  );
}

export function AxisChips({ bw }) {
  const items = [["WIE", bw?.wie, T.wie], ["WAS", bw?.was, T.was], ["WARUM", bw?.warum, T.warum]];
  return (
    <span className="kd-achse" style={{ display: "inline-flex", gap: 8, fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
      {items.map(([l, v, col]) => (
        <span key={l} style={{ color: col }}>{l} {v ?? "–"}</span>
      ))}
    </span>
  );
}

export function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid " + (active ? (color || T.wolfram) : T.rauch),
        background: active ? (color || T.wolfram) : "transparent",
        color: active ? T.tinte : T.rauch,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function KategorieTag({ k }) {
  const map = {
    immer_gut: ["IMMER GUT", T.wolfram],
    kult: ["KULT", T.wie],
    kult_klassiker: ["KULT-KLASSIKER", T.was],
    daemlich_aber_herrlich: ["DÄMLICH ABER HERRLICH", T.warum],
    trash: ["TRASH", T.gefahr],
    sehenswert: ["SEHENSWERT", T.rauch],
    echter_schrott: ["ECHTER SCHROTT", T.gefahr],
    // Legacy (alte Storage-Stände):
    sicher_gut: ["SICHER GUT", T.wolfram],
    wahrscheinlich_passend: ["PASSEND", T.wie],
    referenz: ["REFERENZ", T.rauch],
    zu_pruefen: ["ZU PRÜFEN", T.gefahr],
  };
  const [label, col] = map[k] || [k || "—", T.rauch];
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: col, border: "1px solid " + col, borderRadius: 3, padding: "2px 6px" }}>
      {label}
    </span>
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
