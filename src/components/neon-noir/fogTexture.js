/* Keep the original fog paths and gradient in one self-contained image. Its
   small, static blur can be cached while the three scene patterns keep moving.
   Neighbour tiles supply blur samples across the repeating left/right edge. */
const fogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="144" viewBox="0 -12 600 144">
  <defs>
    <linearGradient id="fog-fill" x2="0" y2="1"><stop stop-color="#9cbecb" stop-opacity="0"/><stop offset=".43" stop-color="#85aebb" stop-opacity=".17"/><stop offset="1" stop-color="#53798c" stop-opacity="0"/></linearGradient>
    <filter id="mist-soft" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
    <g id="fog-shape">
      <path d="M0 30C44 30 51 8 97 18S166 51 216 33 278 13 325 26 396 54 451 34 501 14 546 20 571 30 600 30V110H0Z" fill="url(#fog-fill)"/>
      <path d="M0 42C44 42 62 31 98 33S160 56 218 43 287 29 326 39 392 50 451 41 501 33 547 37 572 42 600 42" fill="none" stroke="#9fc3cb" stroke-width="8" opacity=".055"/>
    </g>
  </defs>
  <g filter="url(#mist-soft)"><use href="#fog-shape" x="-600"/><use href="#fog-shape"/><use href="#fog-shape" x="600"/></g>
</svg>`;

export const NEON_FOG_TEXTURE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fogSvg)}`;
