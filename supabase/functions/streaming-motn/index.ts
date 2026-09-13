import { parseFlixPatrolServiceKeys } from "../flixpatrol-usage/core.js";
import { createMotnHandler } from "./core.js";
import { createClient } from "npm:@supabase/supabase-js@2";

const serviceKeys = parseFlixPatrolServiceKeys(
  Deno.env.get("SUPABASE_SECRET_KEYS") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKeys[0], {
  auth: { persistSession: false, autoRefreshToken: false },
});
if (import.meta.main) Deno.serve(createMotnHandler({ serviceKeys,
  apiKey: Deno.env.get("MotN_API_key") || "",
  rpc: async (name: string, args?: Record<string,unknown>) => {
    const {data,error} = await admin.rpc(name,args);
    if (error) throw new Error("MOTN_STORAGE_FAILED");
    return data;
  },
}));
