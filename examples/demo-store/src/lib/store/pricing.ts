import { formatCents } from "@/lib/types";
import type { Cart, Channel, Coupon, PricedCart, StoreConfig } from "@/lib/types";

// Pure pricing. No I/O. Safe to import anywhere.

export const COUPON_MESSAGES = {
  expired: "This code has expired.",
  invalid: "This code is not valid.",
  wrongProducts: "This code does not apply to items in your cart.",
  minSpend: (cents: number) => `Spend ${formatCents(cents)} or more to use this code.`,
  applied: (code: string, cents: number) => `${code} applied: -${formatCents(cents)}`,
} as const;

export function findCoupon(config: StoreConfig, code: string): Coupon | undefined {
  const want = code.trim().toUpperCase();
  return config.coupons.find((c) => c.code.toUpperCase() === want);
}

export function isCouponExpired(coupon: Coupon, now: Date = new Date()): boolean {
  return now.getTime() > new Date(coupon.expiresAt).getTime();
}

export function shippingFor(config: StoreConfig, merchandiseCents: number, hasItems: boolean): number {
  if (!hasItems) return 0;
  const { flatRateCents, freeOverCents } = config.shipping;
  if (freeOverCents === null) return flatRateCents;
  if (merchandiseCents >= freeOverCents) return 0;
  return flatRateCents;
}

export function priceCart(config: StoreConfig, cart: Cart, now: Date = new Date(), channel: Channel = "web"): PricedCart {
  const lines: PricedCart["lines"] = [];
  for (const item of cart.items) {
    const product = config.products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    if (!product || !variant) continue;
    const qty = Math.max(1, Math.floor(item.qty));
    lines.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      variantLabel: variant.label,
      qty,
      unitCents: product.priceCents,
      lineCents: product.priceCents * qty,
    });
  }
  const subtotalCents = lines.reduce((s, l) => s + l.lineCents, 0);

  let discountCents = 0;
  let couponApplied = false;
  let couponMessage: string | undefined;
  const rawCode = cart.couponCode?.trim();
  const couponCode = rawCode ? rawCode.toUpperCase() : undefined;

  if (couponCode) {
    const coupon = findCoupon(config, couponCode);
    if (!coupon || !coupon.active || (coupon.channels && !coupon.channels.includes(channel))) {
      couponMessage = COUPON_MESSAGES.invalid;
    } else if (isCouponExpired(coupon, now)) {
      couponMessage = COUPON_MESSAGES.expired;
    } else {
      const eligible = coupon.productIds
        ? lines.filter((l) => coupon.productIds!.includes(l.productId))
        : lines;
      const eligibleCents = eligible.reduce((s, l) => s + l.lineCents, 0);
      if (eligible.length === 0) {
        couponMessage = COUPON_MESSAGES.wrongProducts;
      } else if (coupon.minSubtotalCents != null && subtotalCents < coupon.minSubtotalCents) {
        couponMessage = COUPON_MESSAGES.minSpend(coupon.minSubtotalCents);
      } else {
        if (coupon.percentOff != null) {
          discountCents = Math.round((eligibleCents * coupon.percentOff) / 100);
        } else if (coupon.amountOffCents != null) {
          discountCents = coupon.amountOffCents;
        }
        discountCents = Math.min(discountCents, eligibleCents);
        couponApplied = true;
        couponMessage = COUPON_MESSAGES.applied(coupon.code.toUpperCase(), discountCents);
      }
    }
  }

  const merchandise = subtotalCents - discountCents;
  const shippingCents = shippingFor(config, merchandise, lines.length > 0);
  return {
    lines,
    subtotalCents,
    discountCents,
    couponCode,
    couponMessage,
    couponApplied,
    shippingCents,
    totalCents: merchandise + shippingCents,
  };
}

export function cartCount(cart: Cart): number {
  return cart.items.reduce((s, i) => s + i.qty, 0);
}

export function describeCoupon(c: Coupon, config: StoreConfig): string {
  const off =
    c.percentOff != null
      ? `${c.percentOff}% off`
      : c.amountOffCents != null
        ? `${formatCents(c.amountOffCents)} off`
        : "No discount";
  const scope = c.productIds
    ? c.productIds.map((id) => config.products.find((p) => p.id === id)?.name ?? id).join(", ")
    : "whole cart";
  const min = c.minSubtotalCents != null ? `, min spend ${formatCents(c.minSubtotalCents)}` : "";
  return `${off} ${scope}${min}`;
}

export function describeShipping(config: StoreConfig): string {
  const { flatRateCents, freeOverCents } = config.shipping;
  if (freeOverCents === 0) return "Free shipping on every order";
  if (freeOverCents === null) return `Flat rate ${formatCents(flatRateCents)} on every order`;
  return `Free shipping on orders of ${formatCents(freeOverCents)} or more (otherwise ${formatCents(flatRateCents)})`;
}
