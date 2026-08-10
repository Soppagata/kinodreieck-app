/* Sichtbare Buildflags sind Komfortschalter, keine Sicherheitsgrenze. Jeder
   unbekannte oder fehlende Wert bleibt fail-closed `false`. */

export const ENTDECKEN_FLAG_ENV = Object.freeze({
  radarUi: "VITE_RADAR_UI_ENABLED",
  radarPeople: "VITE_RADAR_PEOPLE_ENABLED",
  radarShares: "VITE_RADAR_SHARES_ENABLED",
  recommendations: "VITE_RECOMMENDATIONS_ENABLED",
  popularity: "VITE_POPULARITY_ENABLED",
});

export const RADAR_SERVER_FLAG_NAMES = Object.freeze([
  "radar_aktiv",
  "radar_scheduler_aktiv",
  "radar_provider_aktiv",
  "radar_proposal_import_aktiv",
  "radar_shares_aktiv",
]);

/* Der Pflichtspike aus §6.1 hat die Personen-Automatik nicht getragen.
   Dieses Compile-Time-Parkschloss verhindert eine versehentliche Aktivierung
   allein durch eine Umgebungsvariable. Eine Wiederöffnung braucht Codeänderung,
   neue Tests und einen neuen Owner-STOP. */
export const ENTDECKEN_PARKED_FLAGS = Object.freeze(["radarPeople"]);

function enabled(value) { return value === true || value === "true"; }

export function createEntdeckenFlags(env = {}) {
  const flags = {};
  for (const [name, envName] of Object.entries(ENTDECKEN_FLAG_ENV)) {
    flags[name] = ENTDECKEN_PARKED_FLAGS.includes(name) ? false : enabled(env[envName]);
  }
  return Object.freeze(flags);
}

const viteEnv = (typeof import.meta.env !== "undefined" && import.meta.env) || {};
export const entdeckenFlags = createEntdeckenFlags(viteEnv);
