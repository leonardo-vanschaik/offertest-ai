// Types for the Alder Trail Co. demo store.
// Money is always integer cents. Times are ISO strings.

// ---------- Test store (Alder Trail Co.) ----------

export type Variant = {
  id: string; // e.g. "ridge-slate-10"
  label: string; // e.g. "Size 10"
  stock: number;
};

export type Product = {
  id: string; // e.g. "ridge"
  slug: string; // URL slug: /store/products/[slug]
  name: string; // "Ridge trail shoe"
  color: string; // "Slate"
  description: string;
  priceCents: number;
  image: string; // public path, e.g. "/store/ridge.svg"
  variants: Variant[];
};

export type Coupon = {
  code: string; // "SAVE20" (match is case-insensitive)
  percentOff?: number; // 20
  amountOffCents?: number; // 1000
  productIds?: string[]; // limit to these products; undefined = whole cart
  minSubtotalCents?: number;
  expiresAt: string; // ISO
  active: boolean;
  channels?: Channel[]; // sales channels the code works in; undefined = all
};

// "web" is the online store; "agent" is the agent checkout (UCP) that AI shopping agents use.
export type Channel = "web" | "agent";

export type Shipping = {
  flatRateCents: number; // charged when not free
  freeOverCents: number | null; // 0 = always free, null = never free
};

// Non-checkout funnels: the Trail Club free trial and the First Thru-Hike Guide lead magnet.
export type Funnels = {
  trialDays: number; // 30 in baseline
  trialRequiresCard: boolean; // false in baseline
  guide: "ok" | "broken_link" | "paywalled"; // "ok" in baseline
};

export type StoreConfig = {
  storeName: string; // "Alder Trail Co."
  products: Product[];
  coupons: Coupon[];
  shipping: Shipping;
  funnels: Funnels;
  scenario: ScenarioName;
};

export type CartItem = { productId: string; variantId: string; qty: number };
export type Cart = { items: CartItem[]; couponCode?: string };

export type PricedCart = {
  lines: {
    productId: string;
    variantId: string;
    name: string;
    variantLabel: string;
    qty: number;
    unitCents: number;
    lineCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  couponCode?: string;
  // Exact customer-facing message, e.g. "SAVE20 applied: -$24.00" or "This code has expired."
  couponMessage?: string;
  couponApplied: boolean;
  shippingCents: number;
  totalCents: number;
};

export type Order = {
  id: string; // "AT-10427"
  createdAt: string;
  email: string;
  name: string;
  address: string;
  cardLast4: string;
  testMode: true;
  priced: PricedCart;
  checkoutSessionId?: string; // ACP: one order per checkout session, even when complete is retried
};

export type ScenarioName =
  | "baseline" // everything matches the ads
  | "code_expired" // SAVE20 expired yesterday: "This code has expired."
  | "agent_code_rejected" // SAVE20 works on the website but not in agent checkout (UCP)
  | "code_wrong_percent" // SAVE20 gives 10% instead of 20%
  | "code_missing" // SAVE20 does not exist: "This code is not valid."
  | "code_excludes_product" // SAVE20 does not apply to the Ridge shoe
  | "code_min_spend" // SAVE20 needs a $150 subtotal
  | "price_raised" // Ridge costs $135.00 instead of $120.00
  | "shipping_charged" // $8.95 shipping, free only over $150
  | "size_sold_out" // Ridge Slate size 10 sold out (other sizes in stock)
  | "shipping_threshold_ok" // free shipping over $50 only (Ridge still ships free)
  | "trial_requires_card" // Trail Club join form asks for a card
  | "trial_14_days" // Trail Club trial is 14 days, not 30
  | "guide_link_broken" // guide download link is a 404
  | "guide_paywalled"; // guide costs $4.99 after the email form

// Fixes the agent may propose for the owned store. Applied only after human approval.
export type StoreFix =
  | { type: "extend_coupon"; code: string; expiresAt: string }
  | { type: "set_coupon_percent"; code: string; percentOff: number }
  | { type: "create_coupon"; coupon: Coupon }
  | { type: "set_coupon_products"; code: string; productIds: string[] | null }
  | { type: "set_coupon_min_spend"; code: string; minSubtotalCents: number | null }
  | { type: "set_price"; productId: string; priceCents: number }
  | { type: "set_shipping"; flatRateCents: number; freeOverCents: number | null }
  | { type: "restock_variant"; productId: string; variantId: string; stock: number };

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
