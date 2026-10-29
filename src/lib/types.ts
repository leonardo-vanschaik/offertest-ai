// Shared contract between the test store, the agent runner, the dashboard, and the eval harness.
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
};

export type Shipping = {
  flatRateCents: number; // charged when not free
  freeOverCents: number | null; // 0 = always free, null = never free
};

export type StoreConfig = {
  storeName: string; // "Alder Trail Co."
  products: Product[];
  coupons: Coupon[];
  shipping: Shipping;
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
};

export type ScenarioName =
  | "baseline" // everything matches the ads
  | "code_expired" // SAVE20 expired yesterday: "This code has expired."
  | "code_wrong_percent" // SAVE20 gives 10% instead of 20%
  | "code_missing" // SAVE20 does not exist: "This code is not valid."
  | "code_excludes_product" // SAVE20 does not apply to the Ridge shoe
  | "code_min_spend" // SAVE20 needs a $150 subtotal
  | "price_raised" // Ridge costs $135.00 instead of $120.00
  | "shipping_charged" // $8.95 shipping, free only over $150
  | "size_sold_out" // Ridge Slate size 10 sold out (other sizes in stock)
  | "shipping_threshold_ok"; // free shipping over $50 only (Ridge still ships free)

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

// ---------- OfferTest runs ----------

export type Ad = {
  headline: string;
  text: string;
  cta: string; // "Shop now"
  imageUrl?: string; // public path or data URL
  runsUntil?: string; // ISO end of the ad's flight, used when a fix extends an offer
};

export type AssertionKind =
  | "discount_code"
  | "price"
  | "free_shipping"
  | "availability"
  | "other";

export type Assertion = {
  id: string; // "a1"
  kind: AssertionKind;
  claim: string; // plain test statement: "Code SAVE20 gives 20% off the Ridge trail shoe"
  adQuote: string; // verbatim span from the ad
  conditions: {
    product?: string;
    variant?: string;
    code?: string;
    percentOff?: number;
    amountOffCents?: number;
    priceCents?: number;
    thresholdCents?: number;
    validUntil?: string;
  };
};

export type VerdictStatus = "supported" | "contradicted" | "unresolved" | "outside_scope";

export type Verdict = {
  assertionId: string;
  status: VerdictStatus;
  adQuote: string;
  pageQuote: string | null; // verbatim text from a captured page
  evidenceStep: number | null; // Step.n where pageQuote was seen
  reason: string;
  quoteCheck: { adQuoteFound: boolean; pageQuoteFound: boolean };
  downgraded?: boolean; // true if a "contradicted" verdict failed the quote gate
};

export type ComputerAction =
  | { type: "click"; button?: string; x: number; y: number }
  | { type: "double_click"; x: number; y: number }
  | { type: "drag"; path: { x: number; y: number }[] }
  | { type: "keypress"; keys: string[] }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: "type"; text: string }
  | { type: "screenshot" }
  | { type: "wait" };

export type Step = {
  n: number;
  at: string;
  kind: "action" | "note" | "approval" | "model";
  summary: string; // one line for the timeline
  actions?: ComputerAction[];
  screenshot?: string; // URL: /api/runs/[id]/shots/[n].jpg
  url?: string; // page URL after the step
  modelText?: string; // text the model said this turn
};

export type ApprovalKind = "payment" | "fix" | "safety_check";

export type Approval = {
  id: string;
  kind: ApprovalKind;
  status: "pending" | "approved" | "declined";
  title: string; // "Pay $96.00 with test card 4242?"
  detail: string;
  createdAt: string;
  decidedAt?: string;
};

export type FixProposal = {
  summary: string; // "Extend SAVE20 to Nov 9, 11:59 PM, the ad's last day."
  rationale: string;
  target: "store" | "ad";
  storeFix?: StoreFix;
  adCopy?: { headline: string; text: string };
  status: "proposed" | "approved" | "declined" | "applied";
  approvalId: string;
  retestRunId?: string;
};

export type SamBox = {
  label: string; // noun phrase, e.g. "shoe"
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number; // source image width
  h: number; // source image height
};

export type RunStatus =
  | "queued"
  | "extracting"
  | "shopping"
  | "awaiting_approval"
  | "judging"
  | "proposing_fix"
  | "done"
  | "error";

export type Run = {
  id: string;
  createdAt: string;
  finishedAt?: string;
  parentRunId?: string; // set on a fresh re-test after a fix
  mode: "agent" | "one_call";
  status: RunStatus;
  phase: string; // human label for the current phase
  ad: Ad;
  landingUrl: string;
  allowPayment: boolean;
  scenario?: ScenarioName; // store scenario at run start (for the log, not shown to the agent)
  assertions: Assertion[];
  steps: Step[];
  approvals: Approval[];
  verdicts: Verdict[];
  overall?: "pass" | "fail" | "unresolved";
  fix?: FixProposal;
  order?: { id: string; totalCents: number; confirmedInAdmin: boolean };
  sam?: { screenshot: string; boxes: SamBox[] };
  boundary: string; // "Full test-mode purchase on the owned store" | "Tested up to payment, not paid"
  usage: { inputTokens: number; outputTokens: number; images: number; usd: number };
  error?: string;
};

export type NewRunInput = {
  ad: Ad;
  landingUrl: string;
  allowPayment: boolean;
  mode?: "agent" | "one_call";
  parentRunId?: string;
};

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
