/* ---------- Öffentliche Supabase-Buildwerte ----------
   Der anon/publishable-Key ist öffentlich und RLS-gesichert — er DARF in den Build.
   Service-Role- und andere geheime Schlüssel bleiben serverseitig.
*/
import { runtimeConfig } from "../config/runtime.js";

/* Die Projekt-URL ist keine geheime Information und wird beim Pages-Build aus
   der Repository-Variable VITE_SUPABASE_URL eingesetzt. Auch ein Publishable-
   Key ist öffentliche Browserkonfiguration; geheime Schlüssel bleiben draußen. */
export const SB_DEFAULT_URL = runtimeConfig.supabaseUrl;
export const SB_DEFAULT_ANON = runtimeConfig.supabasePublishableKey;
