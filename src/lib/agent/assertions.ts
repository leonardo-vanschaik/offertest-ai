import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type OpenAI from "openai";
import { MODELS, structured } from "@/lib/meta/client";
import type { Ad, Assertion, Run } from "@/lib/types";

const n = <T extends z.ZodType>(t: T) => t.nullable();

const AssertionsSchema = z.object({
  assertions: z.array(
    z.object({
      kind: z.enum(["discount_code", "price", "free_shipping", "availability", "other"]),
      claim: z.string(),
      adQuote: z.string(),
      conditions: z.object({
        product: n(z.string()),
        variant: n(z.string()),
        code: n(z.string()),
        percentOff: n(z.number()),
        amountOffCents: n(z.number()),
        priceCents: n(z.number()),
        thresholdCents: n(z.number()),
        validUntil: n(z.string()),
      }),
    }),
  ),
});

const SYSTEM = `You turn an ad into typed, testable offer assertions that a shopper could check on the store.
Rules:
- One assertion per concrete promise a customer could act on: a discount code and its amount, a price, free shipping (and any threshold), availability of variants, a bundle or gift.
- "claim" is a plain test statement, e.g. "Code SAVE20 gives 20% off the Ridge trail shoe".
- "adQuote" must be copied verbatim from the ad text or headline (exact characters, no paraphrase). Prefer the shortest span that states the promise.
- Put money in integer cents. Put unknown conditions as null.
- Pure mood words ("best", "love it", "this week only" alone) are not assertions. A time limit belongs in validUntil of the promise it limits; leave it null if no date is given.
- Never invent a promise the ad does not make.`;

export async function adContent(ad: Ad): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Ad headline: ${ad.headline}\nAd text: ${ad.text}\nButton: ${ad.cta}`,
    },
  ];
  const url = await imageDataUrl(ad.imageUrl);
  if (url) parts.push({ type: "image_url", image_url: { url } });
  return parts;
}

async function imageDataUrl(imageUrl?: string): Promise<string | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:image/") && !imageUrl.startsWith("data:image/svg")) return imageUrl;
  if (imageUrl.startsWith("/") && /\.(png|jpe?g|webp)$/i.test(imageUrl)) {
    const buf = await fs.readFile(path.join(process.cwd(), "public", imageUrl)).catch(() => null);
    if (!buf) return null;
    const mime = imageUrl.toLowerCase().endsWith(".png") ? "image/png" : imageUrl.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
  return null; // SVG and remote images are skipped: the ad text carries the promise
}

export async function extractAssertions(run: Run): Promise<Assertion[]> {
  const out = await structured(run, {
    model: MODELS.spark,
    fallbackModel: MODELS.wonder,
    name: "offer_assertions",
    schema: AssertionsSchema,
    system: SYSTEM,
    user: await adContent(run.ad),
  });
  return out.assertions.map((a, i) => ({
    id: `a${i + 1}`,
    kind: a.kind,
    claim: a.claim,
    adQuote: a.adQuote,
    conditions: Object.fromEntries(
      Object.entries(a.conditions).filter(([, v]) => v !== null),
    ) as Assertion["conditions"],
  }));
}
