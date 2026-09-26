const nativeFetch = globalThis.fetch;
let providerCalls = 0;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://api.anthropic.com/v1/messages") {
    providerCalls += 1;
    return new Response(JSON.stringify({
      id: "msg_e6_local", type: "message", role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: JSON.stringify({ echo: "E6", zeichen: 2 }) }],
      stop_reason: "end_turn", usage: { input_tokens: 12, output_tokens: 8 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return nativeFetch(input, init);
};

Deno.env.set("KD_KEIN_SERVER", "1");
const { handhabeAnfrage } = await import("../../../supabase/functions/ai-task/index.ts");
const response = await handhabeAnfrage(new Request("http://local/functions/v1/ai-task", {
  method: "POST",
  headers: {
    authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    "x-kd-api-job": Deno.args[0],
  },
}));
let body: unknown = null;
try { body = await response.json(); } catch { /* asserted by parent */ }
console.log(JSON.stringify({ status: response.status, body, providerCalls }));
if (!response.ok) Deno.exit(1);
