/* The accepted motion study uses one ~30 fps loop, with no React frame state. */
export function startNeonNoirAnimation(svg) {
  if (!svg) return undefined;
  const doc = svg.ownerDocument;
  const win = doc.defaultView;
  if (!win) return undefined;
  const parts = new Map([...svg.querySelectorAll("[data-neon-part]")]
    .map((element) => [element.dataset.neonPart, element]));
  const part = (name) => parts.get(name);
  const motionPreference = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const steam = ["steam-left", "steam-right"].map((name) => [...part(name).children]);
  const turn = Math.PI * 2;
  const mod = (value, period) => ((value % period) + period) % period;
  let width = 430;
  let elapsed = 0;
  let lastStamp = null;
  let lastDraw = -Infinity;
  let raf = null;
  let disposed = false;

  function renderAt(t) {
    // Brightness stays constant. Only the projection's rig moves.
    const sway = `translate(${Math.sin(t * turn / 12) * 1.2} ${Math.sin(t * turn / 8) * 1.4}) rotate(${Math.sin(t * turn / 12) * 1.2} 42 235)`;
    const nod = `rotate(${Math.sin(t * turn / 8) * 3.2} 58 120)`;
    for (const name of ["holo-sway", "holo-face-sway", "holo-bob-sway"]) part(name).setAttribute("transform", sway);
    for (const name of ["holo-head", "holo-face", "holo-bob-head"]) part(name).setAttribute("transform", nod);
    part("holo-arm").setAttribute("transform", `rotate(${Math.sin(t * turn / 12) * 6} 83 146)`);
    part("holo-tail").setAttribute("transform", `rotate(${Math.sin(t * turn / 8 + 1) * 3} 91 245)`);
    part("rain-far").setAttribute("patternTransform", `skewX(-8) translate(0 ${mod(t * 120, 192)})`);
    part("rain-near").setAttribute("patternTransform", `skewX(-8) translate(0 ${mod(t * 330, 264)})`);
    part("fog-far-pattern").setAttribute("patternTransform", `translate(${-mod(t * 12.5, 300)} 0)`);
    part("fog-middle-pattern").setAttribute("patternTransform", `translate(${-mod(t * 400 / 24 + 140, 400)} 0)`);
    part("fog-front-pattern").setAttribute("patternTransform", `translate(${-mod(t * 25 + 180, 600)} 0)`);
    steam.forEach((puffs, side) => puffs.forEach((puff, index) => {
      const progress = mod(t / 6 + index / 5 + side * .3, 1);
      const x = side ? width - 46 : 38;
      const y = side ? 878 : 843;
      puff.setAttribute("cx", x + (side ? -1 : 1) * (Math.sin(progress * 3) * 11 + progress * 19));
      puff.setAttribute("cy", y - progress * 61);
      puff.setAttribute("r", 2.5 + progress * 12);
      puff.setAttribute("opacity", Math.sin(progress * Math.PI) * .11);
    }));
    const progress = (mod(t, 24) - 3) / 7;
    if (progress >= 0 && progress <= 1) {
      part("flyby").setAttribute("opacity", String(Math.min(1, progress * 12, (1 - progress) * 12) * .8));
      part("flyby").setAttribute("transform", `translate(${-60 + (width + 125) * progress} ${342 - Math.sin(progress * Math.PI) * 28 - progress * 22}) scale(.64) rotate(${-3 + Math.sin(progress * turn) * 2})`);
    } else {
      part("flyby").setAttribute("opacity", "0");
    }
  }

  function resize() {
    if (disposed) return;
    const rect = svg.getBoundingClientRect();
    width = 932 * rect.width / Math.max(1, rect.height);
    svg.setAttribute("viewBox", `0 0 ${width} 932`);
    for (const name of ["sky-rect", "depth-rect", "rain-back-rect", "rain-front-rect", "fog-far-rect", "fog-middle-rect", "fog-front-rect"]) {
      part(name).setAttribute("width", width);
    }
    for (const name of ["right-back", "right-front"]) part(name).setAttribute("transform", `translate(${width - 430} 0)`);
    for (const name of ["distant", "middle"]) part(name).setAttribute("transform", `scale(${width / 430} 1)`);
    renderAt(elapsed);
  }

  const mayAnimate = () => !disposed && !motionPreference?.matches && !doc.hidden;
  function tick(stamp) {
    raf = null;
    if (!mayAnimate()) { lastStamp = null; return; }
    if (lastStamp === null) lastStamp = stamp;
    elapsed += Math.min((stamp - lastStamp) / 1000, .1);
    lastStamp = stamp;
    if (stamp - lastDraw > 31) { renderAt(elapsed); lastDraw = stamp; }
    raf = win.requestAnimationFrame(tick);
  }

  function syncMotion() {
    if (raf !== null) win.cancelAnimationFrame(raf);
    raf = null;
    lastStamp = null;
    if (mayAnimate() && win.requestAnimationFrame) raf = win.requestAnimationFrame(tick);
  }

  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
  observer?.observe(svg);
  if (!observer) win.addEventListener("resize", resize);
  motionPreference?.addEventListener?.("change", syncMotion);
  doc.addEventListener("visibilitychange", syncMotion);
  resize();
  syncMotion();

  return () => {
    disposed = true;
    syncMotion();
    observer?.disconnect();
    if (!observer) win.removeEventListener("resize", resize);
    motionPreference?.removeEventListener?.("change", syncMotion);
    doc.removeEventListener("visibilitychange", syncMotion);
  };
}
