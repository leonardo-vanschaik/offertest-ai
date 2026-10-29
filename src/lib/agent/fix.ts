import { z } from "zod";
import { MODELS, structured } from "@/lib/meta/client";
import type { FixProposal, Run, StoreConfig, StoreFix } from "@/lib/types";

const FixSchema = z.object({
  target: z.enum(["store", "ad"]),
  summary: z.string(),
  rationale: z.string(),
  fixType: z.enum([
    "extend_coupon",
    "set_coupon_percent",
    "set_coupon_products",
    "set_coupon_min_spend",
    "create_coupon",
    "set_price",
    "set_shipping",
    "restock_variant",
    "ad_copy",
  ]),
  code: z.string().nullable(),
  expiresAt: z.string().nullable(),
  percentOff: z.number().nullable(),
  amountOffCents: z.number().nullable(),
  productIds: z.array(z.string()).nullable(),
  minSubtotalCents: z.number().nullable(),
  productId: z.string().nullable(),
  variantId: z.string().nullable(),
  stock: z.number().nullable(),
  priceCents: z.number().nullable(),
  flatRateCents: z.number().nullable(),
  freeOverCents: z.number().nullable(),
  adHeadline: z.string().nullable(),
  adText: z.string().nullable(),
});

const SYSTEM = `An ad-offer test failed: the store does not deliver what the ad promises. You work for the store owner. Propose exactly ONE fix that makes the ad's promise true for a customer, with the smallest change.
Prefer a store fix when the ad reflects the owner's intended offer (expired code during the ad's flight, wrong percent, missing code, wrong product scope, price drift, sold-out variant, shipping rule). Propose an ad copy change only when the store is clearly right and the ad is wrong.
Fill only the fields your fixType needs; set the rest to null.
- extend_coupon: code, expiresAt (ISO with offset; use the end of the ad's flight when known).
- set_coupon_percent: code, percentOff. set_coupon_products: code, productIds (null means whole cart). set_coupon_min_spend: code, minSubtotalCents (null removes it).
- create_coupon: code, percentOff or amountOffCents, productIds, expiresAt.
- set_price: productId, priceCents. set_shipping: flatRateCents, freeOverCents (0 = always free). restock_variant: productId, variantId, stock.
- ad_copy: adHeadline, adText.
"summary" is one short sentence a store owner approves, e.g. "Extend SAVE20 to Nov 9, 11:59 PM, the ad's last day." Use real ids from the store config.`;

export async function proposeFix(run: Run, config: StoreConfig): Promise<Omit<FixProposal, "status" | "approvalId">> {
  const failed = run.verdicts.filter((v) => v.status === "contradicted");
  const f = await structured(run, {
    model: MODELS.wonder,
    fallbackModel: MODELS.spark,
    name: "offer_fix",
    schema: FixSchema,
    system: SYSTEM,
    user: `Today: ${new Date().toISOString()}
Ad flight ends: ${run.ad.runsUntil ?? "unknown"}
AD\nHeadline: ${run.ad.headline}\nText: ${run.ad.text}

FAILED ASSERTIONS
${failed
  .map((v) => {
    const a = run.assertions.find((x) => x.id === v.assertionId);
    return `- ${a?.claim}\n  ad says: "${v.adQuote}"\n  store shows: "${v.pageQuote}"\n  reason: ${v.reason}`;
  })
  .join("\n")}

STORE CONFIG (owner's admin view)
${JSON.stringify({ products: config.products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, variants: p.variants })), coupons: config.coupons, shipping: config.shipping }, null, 1)}`,
  });
  let storeFix: StoreFix | undefined;
  const req = <T>(v: T | null, field: string): T => {
    if (v === null || v === undefined) throw new Error(`fix is missing ${field}`);
    return v;
  };
  switch (f.fixType) {
    case "extend_coupon":
      storeFix = { type: "extend_coupon", code: req(f.code, "code"), expiresAt: req(f.expiresAt, "expiresAt") };
      break;
    case "set_coupon_percent":
      storeFix = { type: "set_coupon_percent", code: req(f.code, "code"), percentOff: req(f.percentOff, "percentOff") };
      break;
    case "set_coupon_products":
      storeFix = { type: "set_coupon_products", code: req(f.code, "code"), productIds: f.productIds };
      break;
    case "set_coupon_min_spend":
      storeFix = { type: "set_coupon_min_spend", code: req(f.code, "code"), minSubtotalCents: f.minSubtotalCents };
      break;
    case "create_coupon":
      storeFix = {
        type: "create_coupon",
        coupon: {
          code: req(f.code, "code"),
          ...(f.percentOff !== null ? { percentOff: f.percentOff } : {}),
          ...(f.amountOffCents !== null ? { amountOffCents: f.amountOffCents } : {}),
          ...(f.productIds ? { productIds: f.productIds } : {}),
          expiresAt: f.expiresAt ?? run.ad.runsUntil ?? new Date(Date.now() + 7 * 864e5).toISOString(),
          active: true,
        },
      };
      break;
    case "set_price":
      storeFix = { type: "set_price", productId: req(f.productId, "productId"), priceCents: req(f.priceCents, "priceCents") };
      break;
    case "set_shipping":
      storeFix = { type: "set_shipping", flatRateCents: f.flatRateCents ?? config.shipping.flatRateCents, freeOverCents: f.freeOverCents };
      break;
    case "restock_variant":
      storeFix = {
        type: "restock_variant",
        productId: req(f.productId, "productId"),
        variantId: req(f.variantId, "variantId"),
        stock: f.stock ?? 25,
      };
      break;
    case "ad_copy":
      break;
  }
  return {
    summary: f.summary,
    rationale: f.rationale,
    target: f.fixType === "ad_copy" ? "ad" : "store",
    storeFix,
    adCopy:
      f.fixType === "ad_copy"
        ? { headline: f.adHeadline ?? run.ad.headline, text: f.adText ?? run.ad.text }
        : undefined,
  };
}
