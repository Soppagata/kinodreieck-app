import {
  BLOG_REFERENCE_CONTRACT_VERSION,
  BLOG_REFERENCE_MAX_CANDIDATES,
  BLOG_REFERENCE_MAX_RESPONSE_BYTES,
  BLOG_REFERENCE_MODEL_ALIAS,
  BLOG_REFERENCE_TASK_CAP_USD_CENT,
  blogReferenceContentHmac,
  buildBlogReferencePrompt,
  readBlogReferenceInput,
  validateBlogReferenceResult,
} from "./supabase/functions/ai-task/blogReferenceExtract.ts";
import {
  baueAnbieterKoerper,
  schaetzeAnbieterEingabeTokens,
} from "./supabase/functions/ai-task/providerContract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function candidate(
  mention: string,
  quote: string,
  kind = "film",
  year: number | null = null,
) {
  return {
    mention,
    titleSuggestion: mention,
    kind,
    year,
    interpretation: "direct",
    evidence: { field: "text", quote },
  };
}

Deno.test("blog reference input is exact and byte bounded", () => {
  assertEquals(readBlogReferenceInput({ title: "Titel", text: "Text" }), {
    title: "Titel",
    text: "Text",
  }, "valid input");
  for (
    const invalid of [
      { title: "Titel", text: "Text", accountId: "private" },
      { title: "", text: "Text" },
      { title: "x".repeat(513), text: "Text" },
      { title: "Titel", text: "x".repeat(18_001) },
    ]
  ) {
    let rejected = false;
    try {
      readBlogReferenceInput(invalid);
    } catch {
      rejected = true;
    }
    assert(
      rejected,
      `invalid input must fail: ${JSON.stringify(Object.keys(invalid))}`,
    );
  }
});

Deno.test("provider contract contains only title/text and explicitly disables thinking", () => {
  const input = readBlogReferenceInput({
    title: "Meine Sicht",
    text: "Ich hoerte Beethoven und sah Alien.",
  });
  const prompt = buildBlogReferencePrompt(input);
  assert(
    prompt.user.includes('"title":"Meine Sicht"'),
    "title reaches provider prompt",
  );
  assert(
    prompt.user.includes('"text":"Ich hoerte Beethoven und sah Alien."'),
    "text reaches provider prompt",
  );
  assert(!prompt.user.includes("accountId"), "no account identifier");
  const body = baueAnbieterKoerper(
    "claude-sonnet-5",
    prompt.system,
    prompt.user,
    8192,
    prompt.schema,
    [],
    { thinkingDisabled: true },
  );
  assertEquals(body.thinking, { type: "disabled" }, "thinking is disabled");
  assertEquals(body.model, "claude-sonnet-5", "resolved gross model is used");
  const estimated = schaetzeAnbieterEingabeTokens(
    "claude-sonnet-5",
    prompt.system,
    prompt.user,
    8192,
    prompt.schema,
    [],
    { thinkingDisabled: true },
  );
  assert(
    Number.isSafeInteger(estimated) && estimated > 0,
    "same body options are estimable",
  );
  assertEquals(BLOG_REFERENCE_MODEL_ALIAS, "gross", "fixed alias");
  assertEquals(BLOG_REFERENCE_TASK_CAP_USD_CENT, 30, "fixed task cap");
  assertEquals(
    BLOG_REFERENCE_MAX_RESPONSE_BYTES,
    64 * 1024,
    "response byte cap",
  );
});

Deno.test("evidence is exact, UTF-16 based and years follow media bounds", () => {
  const text =
    "🎬 Alien (1979), Beethovens Neunte (1824) und Don Quijote (1605).";
  const input = readBlogReferenceInput({ title: "Werke", text });
  const raw = {
    candidates: [
      candidate("Alien", "Alien (1979)", "film", 1979),
      candidate("Beethovens Neunte", "Beethovens Neunte (1824)", "music", 1824),
      candidate("Don Quijote", "Don Quijote (1605)", "other", 1605),
      candidate("Alien", "Alien (1979)", "film", 1869),
    ],
  };
  const result = validateBlogReferenceResult(raw, input);
  assert(result !== null, "root is valid");
  assertEquals(
    result.candidates.length,
    3,
    "only media-valid candidates remain",
  );
  assertEquals(result.partial, true, "discarded item marks partial");
  assertEquals(
    result.candidates[0].evidence.start,
    text.indexOf("Alien (1979)"),
    "UTF-16 start",
  );
  assertEquals(
    result.candidates[0].evidence.end,
    text.indexOf("Alien (1979)") + "Alien (1979)".length,
    "UTF-16 end",
  );
});

Deno.test("untrusted or unbound candidate fields are dropped without repair", () => {
  const input = readBlogReferenceInput({
    title: "Titel",
    text: "Alien (1979) bleibt.",
  });
  const valid = candidate("Alien", "Alien (1979)", "film", 1979);
  const result = validateBlogReferenceResult({
    candidates: [
      valid,
      { ...valid, externalId: "tt0078748" },
      candidate("Alien", "https://imdb.test/tt0078748", "film", 1979),
      candidate("Blade Runner", "Alien (1979)", "film", 1979),
      candidate("Alien", "Alien (1979)", "film", 1980),
    ],
  }, input);
  assert(result !== null, "root stays valid");
  assertEquals(
    result.candidates.length,
    1,
    "only exact bound candidate remains",
  );
  assertEquals(
    result.partial,
    true,
    "invalid candidates make the preview partial",
  );
  assertEquals(validateBlogReferenceResult({ candidates: [] }, input), {
    candidates: [],
    partial: false,
  }, "empty result is valid");
  assertEquals(
    validateBlogReferenceResult({ candidates: [], extra: true }, input),
    null,
    "unknown root fields reject the response",
  );
});

Deno.test("candidate and result limits are deterministic", () => {
  const entries = Array.from(
    { length: BLOG_REFERENCE_MAX_CANDIDATES + 5 },
    (_, index) => {
      const mention = `Werk ${index}`;
      return candidate(mention, mention, "other", null);
    },
  );
  const text = entries.map((entry) => entry.mention).join("; ");
  const input = readBlogReferenceInput({ title: "Liste", text });
  const first = validateBlogReferenceResult({ candidates: entries }, input);
  const second = validateBlogReferenceResult({ candidates: entries }, input);
  assert(first !== null && second !== null, "results validate");
  assertEquals(
    first.candidates.length,
    BLOG_REFERENCE_MAX_CANDIDATES,
    "candidate cap",
  );
  assertEquals(first.partial, true, "overflow is explicit");
  assertEquals(first, second, "candidate IDs and truncation are deterministic");
  assert(
    new TextEncoder().encode(JSON.stringify({
      contractVersion: BLOG_REFERENCE_CONTRACT_VERSION,
      candidates: first.candidates,
      partial: first.partial,
      expiresAt: "9999-12-31T23:59:59.999Z",
    })).length <= 32 * 1024,
    "normalized result stays bounded",
  );
});

Deno.test("content HMAC is deterministic and version bound", async () => {
  const input = readBlogReferenceInput({ title: "Titel", text: "Text" });
  const one = await blogReferenceContentHmac(
    input,
    "server-only-key",
    "account-a",
  );
  const two = await blogReferenceContentHmac(
    input,
    "server-only-key",
    "account-a",
  );
  const changed = await blogReferenceContentHmac(
    readBlogReferenceInput({ title: "Titel", text: "Text!" }),
    "server-only-key",
    "account-a",
  );
  const otherAccount = await blogReferenceContentHmac(
    input,
    "server-only-key",
    "account-b",
  );
  assert(/^[a-f0-9]{64}$/.test(one), "HMAC shape");
  assertEquals(one, two, "same input and versions share cache key");
  assert(one !== changed, "content change changes cache key");
  assert(one !== otherAccount, "cache HMAC is account-bound");
});

Deno.test("backend wiring keeps legacy health and export byte shape opt-in", async () => {
  const ai = await Deno.readTextFile("supabase/functions/ai-task/index.ts");
  const account = await Deno.readTextFile(
    "supabase/functions/account-self-service/index.ts",
  );
  assert(
    ai.includes("capabilityRequest.length === 1"),
    "capability must be explicitly negotiated",
  );
  assert(
    ai.includes("capabilityRequest[0] === BLOG_REFERENCE_CONTRACT_VERSION"),
    "exact capability version",
  );
  assert(
    ai.includes("providerOptionen: { thinkingDisabled: true }"),
    "task-specific no-thinking option",
  );
  assert(
    ai.includes("task !== BLOG_REFERENCE_TASK"),
    "provider raw diagnostic excludes blog references",
  );
  assert(
    account.includes(
      'include !== null && include !== "blog-reference-extract-v1"',
    ),
    "unknown includes fail",
  );
  assert(
    account.includes('include === "blog-reference-extract-v1"'),
    "export addition is opt-in",
  );
  assert(
    account.includes("kd_blog_reference_extract_own_data"),
    "dedicated export RPC",
  );
});
