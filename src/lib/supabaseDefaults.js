/* ---------- Supabase Build-Defaults (Phase 5, nur für den Demo-anon-Read) ----------
   Der anon/publishable-Key ist öffentlich und RLS-gesichert — er DARF in den Build.
   Der Sync-Schlüssel NIE (der bleibt pro Gerät im localStorage).

   Diese Defaults speisen ausschließlich den login-freien Demo-Read (scope=demo) im
   Tester-Build (PERSONAL_MODE=false). Im Personal-Modus greift die Demo-Startwahl
   nicht, und der Sync läuft über die in den Einstellungen eingetragene Konfig.

   Leer lassen = Demo-anon-Read inaktiv (die App fällt auf die alte Demo-Beilage
   zurück). Für den Tester-Build trägt Max hier sein Projekt ein:
     export const SB_DEFAULT_URL  = "https://<ref>.supabase.co";
     export const SB_DEFAULT_ANON = "sb_publishable_…";
*/
export const SB_DEFAULT_URL = "";
export const SB_DEFAULT_ANON = "";
