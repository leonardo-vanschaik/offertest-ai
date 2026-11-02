import { z } from "zod";
import type { OpenWeights, RunResult } from "../types.ts";
import { loadEnv, stripFences, type ChatContent } from "./client.ts";

// Muse Spark Open, Meta's open-weight model, through OpenRouter on the hackathon's inference partners
// (Baseten, Fireworks, Modal: no other host). It reads the ad's promises when OPENROUTER_API_KEY is set.
// Each answer comes with OpenRouter's request id, so the provider's record of the model can be checked.

export const SPARK_OPEN = process.env.OFFERTEST_SPARK_OPEN_MODEL ?? "meta/muse-spark-open";
const PROVIDERS = (process.env.OFFERTEST_SPARK_OPEN_PROVIDERS ?? "baseten,fireworks,modal").split(",").map((p) => p.trim()).filter(Boolean);
const base = () => (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");

export function sparkOpenKey(): string | undefined {
  loadEnv();
  return process.env.OPENROUTER_API_KEY || undefined;
}

async function call<T>(p: string, body?: object, timeoutMs = 180_000): Promise<T> {
  const res = await fetch(`${base()}${p}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${sparkOpenKey()}`, "content-type": "application/json", "x-title": "OfferTest AI" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: { error?: { message?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OpenRouter sent a reply that is not JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.error) throw new Error(`Muse Spark Open failed (${res.status}): ${json.error?.message ?? text.slice(0, 200)}`);
  return json as T;
}

// For `offertest doctor`: does the key work. Costs nothing.
export async function sparkOpenStatus(): Promise<string> {
  await call("/key", undefined, 15_000);
  return `OpenRouter key works (${SPARK_OPEN} on ${PROVIDERS.join(", ")})`;
}

// The quantization each provider serves, as OpenRouter lists it ("fp4"). Some providers do not publish one.
let quantizations: Promise<Map<string, string>> | undefined;
function quantizationOf(provider: string): Promise<string> {
  quantizations ??= call<{ data?: { endpoints?: { provider_name: string; quantization?: string }[] } }>(`/models/${SPARK_OPEN}/endpoints`, undefined, 20_000)
    .then((r) => new Map((r.data?.endpoints ?? []).map((e) => [e.provider_name.toLowerCase(), e.quantization ?? "unknown"])))
    .catch(() => new Map());
  return quantizations.then((m) => {
    const q = m.get(provider.toLowerCase());
    return !q || q === "unknown" ? "not published by the provider" : q;
  });
}

type Reply = { id: string; provider?: string; choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };

// JSON that matches the schema, checked with zod. Baseten does not take response_format, so the schema goes in
// the prompt, and one more try covers an answer that does not parse.
export async function sparkOpenStructured<T>(r: RunResult, opts: { job: string; schema: z.ZodType<T>; system: string; user: ChatContent }): Promise<T> {
  const schema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  const ow: OpenWeights = (r.openWeights ??= { job: opts.job, model: SPARK_OPEN, route: "OpenRouter", provider: "", quantization: "", requests: [], calls: 0, ms: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  const body = {
    model: SPARK_OPEN,
    provider: { order: PROVIDERS, allow_fallbacks: false },
    reasoning: { effort: "low" },
    max_tokens: 16_000,
    messages: [
      { role: "system", content: `${opts.system}\n\nAnswer with one JSON object that matches this JSON schema, and nothing else:\n${JSON.stringify(schema)}` },
      { role: "user", content: opts.user },
    ],
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    let res: Reply;
    try {
      res = await call<Reply>("/chat/completions", body);
    } catch (err) {
      lastError = err;
      continue;
    }
    ow.calls++;
    ow.ms += Date.now() - t0;
    ow.requests.push(res.id);
    ow.provider = res.provider ?? "unknown";
    ow.quantization = await quantizationOf(ow.provider);
    const u = res.usage ?? {};
    ow.inputTokens += u.prompt_tokens ?? 0;
    ow.outputTokens += u.completion_tokens ?? 0;
    ow.usd += u.cost ?? 0;
    r.usage.inputTokens += u.prompt_tokens ?? 0;
    r.usage.outputTokens += u.completion_tokens ?? 0;
    r.usage.usd += u.cost ?? 0;
    try {
      return opts.schema.parse(JSON.parse(stripFences(res.choices?.[0]?.message?.content ?? "")));
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Muse Spark Open did not return valid ${opts.job} after 2 tries: ${String(lastError).slice(0, 200)}`);
}
