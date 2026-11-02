import { z } from "zod";
import { applyFix, StoreError } from "@/lib/store";
import type { StoreFix } from "@/lib/types";

const cents = z.number().int().nonnegative();
const iso = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "must be an ISO date");

const couponSchema = z.object({
  code: z.string().min(1),
  percentOff: z.number().min(0).max(100).optional(),
  amountOffCents: cents.optional(),
  productIds: z.array(z.string()).optional(),
  minSubtotalCents: cents.optional(),
  expiresAt: iso,
  active: z.boolean(),
});

const fixSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("extend_coupon"), code: z.string(), expiresAt: iso }),
  z.object({ type: z.literal("set_coupon_percent"), code: z.string(), percentOff: z.number().min(0).max(100) }),
  z.object({ type: z.literal("create_coupon"), coupon: couponSchema }),
  z.object({ type: z.literal("set_coupon_products"), code: z.string(), productIds: z.array(z.string()).nullable() }),
  z.object({ type: z.literal("set_coupon_min_spend"), code: z.string(), minSubtotalCents: cents.nullable() }),
  z.object({ type: z.literal("set_price"), productId: z.string(), priceCents: cents }),
  z.object({ type: z.literal("set_shipping"), flatRateCents: cents, freeOverCents: cents.nullable() }),
  z.object({ type: z.literal("restock_variant"), productId: z.string(), variantId: z.string(), stock: cents }),
]);

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be a JSON StoreFix" }, { status: 400 });
  }
  const parsed = fixSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid StoreFix", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    return Response.json(await applyFix(parsed.data as StoreFix));
  } catch (e) {
    if (e instanceof StoreError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
