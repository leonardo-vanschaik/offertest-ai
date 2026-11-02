import { z } from "zod";
import type { OpenWeights, RunResult } from "../types.ts";
import { loadEnv, stripFences, type ChatContent } from "./client.ts";

// Muse Spark Open, Meta's open-weight model, through OpenRouter on the hackathon's inference partners
// (Baseten, Fireworks, Modal: no other host). It reads the ad's promises when OPENROUTER_API_KEY is set.
// Each answer comes with OpenRouter's request id, so the provider's record of the model can be checked.
// Settings are read when used, after loadEnv(), so values in a .env file count.

function env(name: string, fallback: string): string {
  loadEnv();
  return process.env[name] || fallback;
}
export const sparkOpenModel = () => env("OFFERTEST_SPARK_OPEN_MODEL", "meta/muse-spark-open");
const providers = () =>
  env("OFFERTEST_SPARK_OPEN_PROVIDERS", "baseten,fireworks,modal")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
const base = () => env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/+$/, "");

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
  return `OpenRouter key works (${sparkOpenModel()} on ${providers().join(", ")})`;
}

// The quantization each provider serves, as OpenRouter lists it ("fp4"). Some providers do not publish one.
const quantizations = new Map<string, Promise<Map<string, string>>>();
async function quantizationOf(model: string, provider: string): Promise<string> {
  if (!quantizations.has(model))
    quantizations.set(
      model,
      call<{ data?: { endpoints?: { provider_name: string; quantization?: string }[] } }>(`/models/${model}/endpoints`, undefined, 20_000)
        .then((r) => new Map((r.data?.endpoints ?? []).map((e) => [e.provider_name.toLowerCase(), e.quantization ?? "unknown"])))
        .catch(() => new Map()),
    );
  const q = (await quantizations.get(model)!).get(provider.toLowerCase());
  return !q || q === "unknown" ? "not published by the provider" : q;
}

type Reply = { id: string; provider?: string; choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };

// JSON that matches the schema, checked with zod. Baseten does not take response_format, so the schema goes in
// the prompt, and one more try covers an answer that does not parse. Each request keeps its own provider.
export async function sparkOpenStructured<T>(r: RunResult, opts: { job: string; schema: z.ZodType<T>; system: string; user: ChatContent }): Promise<T> {
  const schema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  const model = sparkOpenModel();
  const ow: OpenWeights = (r.openWeights ??= { job: opts.job, model, route: "OpenRouter", provider: "", quantization: "", requests: [], ms: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  const body = {
    model,
    provider: { order: providers(), allow_fallbacks: false },
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
    ow.ms += Date.now() - t0;
    const u = res.usage ?? {};
    const provider = res.provider ?? "unknown";
    const req = { id: res.id, provider, quantization: await quantizationOf(model, provider), inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, usd: u.cost ?? 0, accepted: false };
    ow.requests.push(req);
    ow.inputTokens += req.inputTokens;
    ow.outputTokens += req.outputTokens;
    ow.usd += req.usd;
    r.usage.inputTokens += req.inputTokens;
    r.usage.outputTokens += req.outputTokens;
    r.usage.usd += req.usd;
    try {
      const out = opts.schema.parse(JSON.parse(stripFences(res.choices?.[0]?.message?.content ?? "")));
      req.accepted = true;
      ow.provider = req.provider;
      ow.quantization = req.quantization;
      return out;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Muse Spark Open did not return valid ${opts.job} after 2 tries: ${String(lastError).slice(0, 200)}`);
}
