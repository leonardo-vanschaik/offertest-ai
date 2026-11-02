import { z } from "zod";
import { MODELS, structured } from "../meta/client.ts";
import type { Fix, RunResult } from "../types.ts";

const Schema = z.object({
  target: z.enum(["funnel", "ad"]),
  summary: z.string(),
  rationale: z.string(),
  steps: z.array(z.string()),
  adHeadline: z.string().nullable(),
  adText: z.string().nullable(),
});

const SYSTEM = `An ad-offer test failed: the funnel does not give the customer what the ad promises. You work for the advertiser. Propose ONE fix, the smallest change that makes the promise true.
- Prefer fixing the funnel when the ad states the intended offer (expired or wrong code, price drift, hidden condition, sold-out item, broken link, form that leads nowhere). Say exactly where to change it (for example "Store admin > Discounts > SAVE20 > Active dates: end Nov 9, 11:59 PM"). Name a platform (Shopify, WooCommerce) only when the evidence shows it.
- Propose new ad copy (target "ad", with adHeadline and adText) only when the funnel is right and the ad is wrong.
- summary: one sentence the owner can approve, e.g. "Extend SAVE20 to Nov 9, 11:59 PM, the ad's last day."
- rationale: one sentence on why this fix, from the evidence, e.g. "The ad is right and the checkout rejects SAVE20 as expired, so the code is what changed."
- steps: 1 to 4 short instructions, each naming the screen or setting to change. The last one says how to check it.`;

export async function proposeFix(r: RunResult): Promise<Fix> {
  const failed = r.verdicts.filter((v) => v.status === "contradicted");
  const f = await structured(r, {
    model: MODELS.wonder,
    fallbackModel: MODELS.spark,
    name: "offer_fix",
    schema: Schema,
    system: SYSTEM,
    user: `Today: ${new Date().toISOString().slice(0, 10)}
AD\nHeadline: ${r.ad.headline}\nText: ${r.ad.text}\nDestination: ${JSON.stringify(r.ad.destination)}

FAILED PROMISES
${failed
  .map((v) => {
    const a = r.assertions.find((x) => x.id === v.assertionId);
    return `- ${a?.claim}\n  ad says: "${v.adQuote}"\n  funnel shows: "${v.pageQuote}"\n  why: ${v.reason}`;
  })
  .join("\n")}`,
  });
  return {
    target: f.target,
    summary: f.summary,
    rationale: f.rationale,
    steps: f.steps,
    ...(f.target === "ad" ? { adCopy: { headline: f.adHeadline ?? r.ad.headline, text: f.adText ?? r.ad.text } } : {}),
  };
}
