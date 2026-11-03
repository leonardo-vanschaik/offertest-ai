import { z } from "zod";
import type OpenAI from "openai";
import { imageAsDataUrl, MODELS, structured } from "../meta/client.ts";
import { sparkOpenKey, sparkOpenModel, sparkOpenStructured } from "../meta/open.ts";
import type { Ad, Assertion, RunResult } from "../types.ts";

const Schema = z.object({
  assertions: z.array(
    z.object({
      kind: z.string(),
      claim: z.string(),
      adQuote: z.string(),
      card: z.number().nullable(),
      conditions: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  ),
  subject: z.string(), // short noun phrase for the thing advertised: "shoe", "jacket", "course"
  imageText: z.string(), // every word printed in the ad image, verbatim ("" if none)
});

const SYSTEM = `You turn an ad into typed, testable promises that a customer could check by following the ad's funnel.
- One assertion per concrete promise a customer could act on: a price, a discount or code and its amount, free shipping and its threshold, a free trial and its terms ("no credit card"), a free download or guide, a booking or consultation, an event date, availability of sizes or variants, a guarantee, a response time, a bonus or gift.
- kind: one of price, discount, free_shipping, free_trial, availability, lead_magnet, booking, event, guarantee, response_time, other.
- claim: a plain test statement, e.g. "Code SAVE20 gives 20% off the Ridge trail shoe".
- adQuote: copied verbatim from the ad text, headline, description, a card, or the words printed in the ad image (exact characters). The shortest span that states the promise.
- imageText: every word printed in the ad's images, verbatim, in reading order ("" if there is no image or no text). For a carousel card's image, start its words with "Card N: " (N is the card index).
- card: the index of the carousel card the promise belongs to, or null if it is the main ad.
- conditions: key/value facts the test needs (code, percent, amount, product, variant, threshold, date). Money as written in the ad.
- Mood words ("best", "you'll love it") are not promises. A time limit belongs in conditions of the promise it limits.
- subject: a 1-2 word noun for the advertised product or service, as it would look in a photo ("shoe", "jacket", "app screen", "person").
- Never invent a promise the ad does not make. Read text in the ad's images too, the carousel cards' images included.`;

export async function adContent(ad: Ad): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
  const cards = (ad.cards ?? []).map((c, i) => `Card ${i}: ${c.headline}${c.text ? ` / ${c.text}` : ""}`).join("\n");
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Headline: ${ad.headline}\nText: ${ad.text}\n${ad.description ? `Description: ${ad.description}\n` : ""}Button: ${ad.cta}\nDestination: ${ad.destination.type}${cards ? `\n${cards}` : ""}`,
    },
  ];
  const url = await imageAsDataUrl(ad.imageUrl);
  if (url) parts.push({ type: "image_url", image_url: { url } });
  // Carousel cards: each card's own image (up to 5), labeled with its index. The first card often repeats the main image.
  const seen = new Set([ad.imageUrl]);
  for (const [i, c] of (ad.cards ?? []).entries()) {
    if (!c.imageUrl || seen.has(c.imageUrl) || seen.size > 5) continue;
    seen.add(c.imageUrl);
    const card = await imageAsDataUrl(c.imageUrl);
    if (card) parts.push({ type: "text", text: `Card ${i} image:` }, { type: "image_url", image_url: { url: card } });
  }
  return parts;
}

// The model that reads the promises: Muse Spark Open (open weights) when OPENROUTER_API_KEY is set, else Muse Spark.
export function promiseModel(): string {
  return sparkOpenKey() ? sparkOpenModel() : MODELS.spark;
}

// If Muse Spark Open fails, Muse Spark reads the promises (Muse Wonder if Spark fails too). r.models names the
// model whose answer was used, and openWeights.fallback says why Muse Spark Open's was not.
export async function extractAssertions(r: RunResult, opts: { open?: boolean } = {}): Promise<{ assertions: Assertion[]; subject: string; imageText: string }> {
  const user = await adContent(r.ad);
  let out: z.infer<typeof Schema> | undefined;
  if (opts.open ?? !!sparkOpenKey()) {
    r.models["ad to promises"] = sparkOpenModel();
    try {
      out = await sparkOpenStructured(r, { job: "ad to promises", schema: Schema, system: SYSTEM, user });
    } catch (err) {
      r.openWeights!.fallback = (err as Error).message;
    }
  }
  out ??= await structured(r, { model: MODELS.spark, fallbackModel: MODELS.wonder, name: "offer_assertions", schema: Schema, system: SYSTEM, user, job: "ad to promises" });
  return {
    subject: out.subject,
    imageText: out.imageText,
    assertions: out.assertions.map((a, i) => ({
      id: `a${i + 1}`,
      kind: a.kind,
      claim: a.claim,
      adQuote: a.adQuote,
      conditions: Object.fromEntries(a.conditions.map((c) => [c.key, c.value])),
      ...(a.card !== null ? { card: a.card } : {}),
    })),
  };
}
