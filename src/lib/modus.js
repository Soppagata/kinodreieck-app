/* ---------- Betriebsmodus ----------
   PERSONAL_MODE = Max' eigene Version: kein Installations-Popup, keine
   Demo/Clean-StartWahl, kein „Git verbinden" als StartWahl-Option. Die App
   bootet direkt in die persönliche Nutzung; Git-Sync läuft über
   Einstellungen → Geräte-Sync.

   Für eine spätere Tester-/Beta-Auslieferung diesen Schalter auf `false`
   setzen — die komplette Tester-Kulisse (StartWahl, Installer-Hinweis,
   Demo/Clean, Willkommens-Tour) ist im Code erhalten und wird dann wieder
   sichtbar. Kein Neubau nötig, nur dieser eine Wert. */
export const PERSONAL_MODE = true;
