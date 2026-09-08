/* Einheitlicher login-freier Testerbetrieb. PERSONAL_MODE bleibt nur als
   Kompatibilitätskonstante für wenige alte Guards; neue Oberflächen sollen
   nicht mehr zwischen separaten Builds verzweigen. */
export const PERSONAL_MODE = false;
export const EGGS_ENABLED = true;

/* EGG-PAUSE (2026-09-08): Die Eggs werden von Max überarbeitet. Showa/Neon-Noir-Modi
   und das Cage-Alphabet bleiben aktiv; Teppich, Star-Wars-Crawl (inkl.
   4.-Mai-Thema), Deep Space Horror und Klaatu→Necronomicon sind stillgelegt.
   Reaktivierung = Flag auf true drehen UND die Pause-Checks in eggs_test.mjs
   mitziehen. Die Egg-Bibliotheken (eggs.js, eggFrequenz.js, momentEggs.js)
   bleiben unverändert und getestet — pausiert ist nur die App-Verdrahtung. */
export const EGG_AKTIV = Object.freeze({
  cage: true,      // Cage-Alphabet: bleibt aktiv
  deepSpace: false, // Horror-Effekt innerhalb von Neon Noir: pausiert
  teppich: false,  // Teppich-Szene: pausiert (Überarbeitung)
  crawl: false,    // Star-Wars-Crawl + 4.-Mai-Thema: pausiert (Überarbeitung)
  klaatu: false,   // Klaatu→Necronomicon: pausiert (Überarbeitung)
});
