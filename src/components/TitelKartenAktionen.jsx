import { T, kontrastFarbe } from "../lib/tokens.js";
import { IconCheck, IconStar } from "./ui.jsx";
import "./titel-karten-aktionen.css";

function PinIcon({ aktiv = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17"
      fill={aktiv ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8l-1 6 3 3v1H6v-1l3-3-1-6Z" /><path d="M12 14v6" />
    </svg>
  );
}

const aktivStil = (aktiv) => ({
  background: aktiv ? T.kartenAkzent : "none",
  color: aktiv ? kontrastFarbe(T.kartenAkzent) : T.kartenTextWeich,
});

export function TitelKartenAktionen({
  pinAktiv = false,
  pinDisabled = false,
  pinLabel,
  onPin,
  markiert = false,
  markierLabel,
  onMarkieren,
  gesehen = false,
  gesehenLabel,
  onGesehen,
}) {
  return (
    <div className="kd-entdecken-aktionen kd-titelkarten-aktionen">
      <button type="button" className={`kd-entdecken-pin${pinAktiv ? " aktiv" : ""}`}
        disabled={pinDisabled} aria-disabled={pinDisabled || undefined}
        aria-label={pinLabel} aria-pressed={pinAktiv} title={pinLabel}
        onClick={(event) => { event.stopPropagation(); if (!pinDisabled) onPin?.(); }}>
        <PinIcon aktiv={pinAktiv} />
      </button>
      <button type="button" aria-label={markierLabel} title={markierLabel} aria-pressed={markiert}
        style={{ ...aktivStil(markiert), cursor: "pointer", fontSize: 16, padding: 0 }}
        onClick={(event) => { event.stopPropagation(); onMarkieren?.(); }}>
        <IconStar size={18} filled={markiert} />
      </button>
      <button type="button" aria-label={gesehenLabel} title={gesehenLabel} aria-pressed={gesehen}
        style={{ ...aktivStil(gesehen), cursor: "pointer", fontSize: 15, padding: 0 }}
        onClick={(event) => { event.stopPropagation(); onGesehen?.(); }}>
        <IconCheck size={18} />
      </button>
    </div>
  );
}
