import React, { useEffect, useId, useRef } from "react";
import { NeonNoirScene } from "./neon-noir/NeonNoirScene.jsx";
import { startNeonNoirAnimation } from "./neon-noir/animateNeonNoir.js";
import "../styles/neon-noir.css";

/** Rein dekorative Neon-Noir-Kulisse ohne Interaktionen oder externe Assets. */
export function NeonNoirOverlay() {
  const sceneRef = useRef(null);
  const idPrefix = `kd-neon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  useEffect(() => startNeonNoirAnimation(sceneRef.current), []);

  return (
    <div className="kd-fx kd-fx-neon-noir kd-neon-noir-overlay" aria-hidden="true">
      <NeonNoirScene sceneRef={sceneRef} idPrefix={idPrefix} />
    </div>
  );
}

export default NeonNoirOverlay;
