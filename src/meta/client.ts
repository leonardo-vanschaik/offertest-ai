import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import type { RunResult } from "../types.ts";

// Meta Model API is OpenAI-compatible: https://dev.meta.ai/docs
// Read when used, after loadEnv(), so a model set in a .env file counts.
export const MODELS = {
  get wonder(): string {
    loadEnv();
    return process.env.OFFERTEST_WONDER_MODEL || "muse-wonder-1.0";
  },
  get spark(): string {
    loadEnv();
    return process.env.OFFERTEST_SPARK_MODEL || "muse-spark-1.3";
  },
  sam: "sam-3.1",
};

// USD per 1M tokens (dev.meta.ai/docs/pricing-rate-limits, 29 Oct 2026)
const PRICES: Record<string, { in: number; out: number }> = {
  "muse-wonder-1.0": { in: 4, out: 20 },
  "muse-spark-1.3": { in: 1.25, out: 4.25 },
};
const SAM_PER_IMAGE = 2.5 / 1000;

export const CONFIG_DIR = path.join(os.homedir(), ".offertest");
export const CONFIG_ENV = path.join(CONFIG_DIR, ".env");

// Env files, first match wins per variable: ./.env.local, ./.env, ~/.offertest/.env
export function loadEnv() {
  for (const f of [".env.local", ".env", CONFIG_ENV]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {}
    }
  }
}

let client: OpenAI | null = null;
export function meta(): OpenAI {
  if (!client) {
    loadEnv();
    const apiKey = process.env.META_API_KEY;
    if (!apiKey) throw new Error("META_API_KEY is not set. Run `offertest init` or add it to .env");
    client = new OpenAI({
      apiKey,
      baseURL: process.env.META_BASE_URL ?? "https://api.meta.ai/v1",
      timeout: 180_000,
      maxRetries: 3, // the SDK backs off on 429 and 5xx
    });
  }
  return client;
}

export function addUsage(r: RunResult, model: string, inputTokens = 0, outputTokens = 0, images = 0) {
  r.usage.inputTokens += inputTokens;
  r.usage.outputTokens += outputTokens;
  r.usage.images += images;
  if (model === MODELS.sam) {
    r.usage.usd += images * SAM_PER_IMAGE;
    return;
  }
  const p = PRICES[model] ?? PRICES["muse-wonder-1.0"];
  r.usage.usd += (inputTokens * p.in + outputTokens * p.out) / 1e6;
}

export type ChatContent = OpenAI.Chat.Completions.ChatCompletionContentPart[] | string;

// Structured output over Chat Completions (response_format json_schema), validated with zod.
export async function structured<T>(
  r: RunResult,
  // job: when set, r.models[job] names the model whose answer was used (the fallback, if it was needed)
  opts: { model: string; name: string; schema: z.ZodType<T>; system: string; user: ChatContent; fallbackModel?: string; job?: string },
): Promise<T> {
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const call = async (model: string) => {
    const res = await meta().chat.completions.create({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: opts.name, schema: jsonSchema, strict: true } },
    });
    addUsage(r, model, res.usage?.prompt_tokens, res.usage?.completion_tokens);
    const text = res.choices[0]?.message?.content ?? "";
    const out = opts.schema.parse(JSON.parse(stripFences(text)));
    if (opts.job) r.models[opts.job] = model;
    return out;
  };
  try {
    return await call(opts.model);
  } catch (err) {
    if (!opts.fallbackModel) throw err;
    return await call(opts.fallbackModel);
  }
}

export function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

export function dataUrl(buf: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// Ad images can be a URL, a data URL, or a local file. Returns a data URL the models accept (no SVG).
export async function imageAsDataUrl(src?: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:image/")) return src.startsWith("data:image/svg") ? null : src;
  try {
    if (/^https?:\/\//.test(src)) {
      const res = await fetch(src);
      if (!res.ok) return null;
      const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      if (!mime.startsWith("image/") || mime.includes("svg")) return null;
      return dataUrl(Buffer.from(await res.arrayBuffer()), mime);
    }
    const ext = path.extname(src).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
    if (!mime) return null;
    return dataUrl(fs.readFileSync(src), mime);
  } catch {
    return null;
  }
}
