import { createHash, randomUUID } from "node:crypto";
import { COUPON_MESSAGES, createOrder, describeCoupon, findCoupon, getConfig, priceCart } from "@/lib/store";
import type { CartItem, PricedCart, StoreConfig } from "@/lib/types";

// A small ACP seller (Agentic Commerce Protocol 2026-04-17): the checkout API AI agents such as ChatGPT
// buy through. One file serves all five routes so the in-memory sessions are shared.
// Sessions price with the "agent" sales channel, so a web-only code is rejected here.
// Payment: a Stripe test-mode Shared Payment Token when STRIPE_SECRET_KEY (sk_test_) is set, else any spt_ demo token.
// https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
const VERSION = "2026-04-17";
const KEY = process.env.ACP_API_KEY ?? "alder-trail-demo";
const STRIPE = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY : undefined;
const STRIPE_VERSION = "2026-09-30.preview";
// Demo mode (no Stripe key) takes any spt_ test token, like a test card; this one is always declined.
const DEMO_TOKEN = "spt_demo_4242";
const DECLINE_TOKEN = "spt_declined";
const SPEC = "https://github.com/agentic-commerce-protocol/agentic-commerce-protocol";

type Address = { name: string; line_one: string; line_two?: string; city: string; state: string; country: string; postal_code: string };
type Session = {
  id: string;
  items: CartItem[];
  codes: string[];
  details?: { name?: string; email?: string; address?: Address };
  status: "open" | "completed" | "canceled";
  order?: { id: string; permalink_url: string };
  declined?: string;
  completing?: boolean; // a complete request is paying right now
  paid?: boolean; // charged; a retry must not charge again
};
type Body = {
  currency?: string;
  line_items?: { id?: string; quantity?: number }[];
  discounts?: { codes?: string[] };
  fulfillment_details?: Session["details"];
  buyer?: { email?: string; first_name?: string; last_name?: string };
  payment_data?: { handler_id?: string; instrument?: { credential?: { type?: string; token?: string } } };
};

// Survives dev reloads.
const g = globalThis as { acpSessions?: Map<string, Session>; acpReplays?: Map<string, { hash: string; status: number; body: object }> };
const sessions = (g.acpSessions ??= new Map());
const replays = (g.acpReplays ??= new Map());

const fail = (status: number, code: string, message: string, param?: string) =>
  Response.json({ type: status >= 500 ? "processing_error" : "invalid_request", code, message, ...(param ? { param } : {}) }, { status });

// The agent may send a variant id, a product id, or the product page slug.
function itemsFrom(config: StoreConfig, lines: Body["line_items"]): CartItem[] {
  const out: CartItem[] = [];
  for (const li of lines ?? []) {
    const id = String(li.id ?? "");
    const p = config.products.find((x) => x.id === id || x.slug === id || x.variants.some((v) => v.id === id));
    if (!p) continue;
    const v = p.variants.find((x) => x.id === id) ?? p.variants.find((x) => x.stock > 0) ?? p.variants[0];
    out.push({ productId: p.id, variantId: v.id, qty: Math.max(1, Math.floor(li.quantity ?? 1)) });
  }
  return out;
}

// Lines whose size is sold out (or has less stock than the quantity). The web checkout refuses these too.
function soldOut(config: StoreConfig, items: CartItem[]): number[] {
  return items.flatMap((it, i) => {
    const v = config.products.find((p) => p.id === it.productId)?.variants.find((x) => x.id === it.variantId);
    return !v || v.stock < it.qty ? [i] : [];
  });
}

// A shipping address needs every required field filled in.
const fullAddress = (a?: Address) => !!a && [a.name, a.line_one, a.city, a.state, a.country, a.postal_code].every((x) => typeof x === "string" && x.trim().length > 0);

function reasonOf(msg: string | undefined): string {
  if (msg === COUPON_MESSAGES.expired) return "discount_code_expired";
  if (msg?.startsWith("Spend ")) return "discount_code_minimum_not_met";
  if (msg === COUPON_MESSAGES.wrongProducts) return "discount_code_user_ineligible";
  return "discount_code_invalid";
}

function handler() {
  const base = { version: VERSION, requires_pci_compliance: false, config_schema: `${SPEC}/blob/main/spec/${VERSION}/json-schema`, instrument_schemas: [] };
  return STRIPE
    ? { ...base, id: "stripe_spt", name: "dev.acp.tokenized.card", psp: "stripe", spec: "https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens", requires_delegate_payment: true, config: { test_mode: true } }
    : { ...base, id: "demo_card", name: "dev.offertest.demo_card", psp: "none", spec: SPEC, requires_delegate_payment: false, config: { test_token: DEMO_TOKEN } };
}

function view(s: Session, origin: string, config: StoreConfig = getConfig()) {
  const priced = priceCart(config, { items: s.items, couponCode: s.codes[0] }, new Date(), "agent");
  const rejected = s.codes.flatMap((code, i) =>
    i === 0 && priced.couponApplied ? [] : [{ code, reason: i === 0 ? reasonOf(priced.couponMessage) : "discount_code_combination_disallowed", message: i === 0 ? priced.couponMessage ?? COUPON_MESSAGES.invalid : "Only one code per order." }],
  );
  const coupon = priced.couponApplied && priced.couponCode ? findCoupon(config, priced.couponCode) : undefined;
  const money = (type: string, display_text: string, amount: number) => ({ type, display_text, amount });
  const messages: object[] = rejected.map((r) => ({ type: "warning", code: r.reason, param: "$.discounts.codes", content_type: "plain", content: `${r.code}: ${r.message}` }));
  if (!s.items.length) messages.push({ type: "error", code: "missing", param: "$.line_items", content_type: "plain", content: "Add an item." });
  if (!s.details?.address) messages.push({ type: "error", code: "missing", param: "$.fulfillment_details.address", resolution: "requires_buyer_input", content_type: "plain", content: "Add a shipping address." });
  else if (!fullAddress(s.details.address)) messages.push({ type: "error", code: "invalid", param: "$.fulfillment_details.address", resolution: "requires_buyer_input", content_type: "plain", content: "The shipping address is missing a name, street, city, state, country, or postal code." });
  if (s.declined) messages.push({ type: "error", code: "payment_declined", param: "$.payment_data", content_type: "plain", content: s.declined });
  const out = soldOut(config, s.items);
  for (const i of out) {
    const l = priced.lines[i];
    messages.push({ type: "error", code: "out_of_stock", param: `$.line_items[${i}]`, content_type: "plain", content: `${l ? `${l.name} (${l.variantLabel})` : "This item"} is sold out.` });
  }
  const ready = s.items.length > 0 && fullAddress(s.details?.address) && !out.length;
  return {
    id: s.id,
    status: s.status === "open" ? (ready ? "ready_for_payment" : "not_ready_for_payment") : s.status,
    currency: "usd",
    capabilities: {
      payment: { handlers: [handler()] },
      extensions: [{ name: "discount", extends: ["$.CheckoutSessionCreateRequest.discounts", "$.CheckoutSessionUpdateRequest.discounts", "$.CheckoutSession.discounts"] }],
    },
    line_items: priced.lines.map((l, i) => ({
      id: `li_${i + 1}`,
      item: { id: l.variantId, name: `${l.name} - ${l.variantLabel}`, unit_amount: l.unitCents },
      quantity: l.qty,
      name: `${l.name} - ${l.variantLabel}`,
      unit_amount: l.unitCents,
      totals: [money("items_base_amount", "Item", l.lineCents), money("total", "Total", l.lineCents)],
    })),
    fulfillment_details: s.details,
    fulfillment_options: [{ type: "shipping", id: "standard", title: "Standard shipping", totals: [money("fulfillment", "Shipping", priced.shippingCents), money("total", "Total", priced.shippingCents)] }],
    selected_fulfillment_options: [{ type: "shipping", option_id: "standard", item_ids: priced.lines.map((_, i) => `li_${i + 1}`) }],
    discounts: {
      codes: s.codes,
      applied: coupon
        ? [{ id: `disc_${coupon.code}`, code: coupon.code, coupon: { id: coupon.code, name: describeCoupon(coupon, config), ...(coupon.percentOff != null ? { percent_off: coupon.percentOff } : { amount_off: coupon.amountOffCents, currency: "usd" }) }, amount: priced.discountCents, automatic: false }]
        : [],
      rejected,
    },
    totals: totals(priced, money),
    messages,
    links: [{ type: "return_policy", title: "Returns", url: `${origin}/store` }],
    continue_url: `${origin}/store/cart`,
    ...(s.order ? { order: { id: s.order.id, checkout_session_id: s.id, permalink_url: s.order.permalink_url, status: "confirmed" } } : {}),
  };
}

function totals(p: PricedCart, money: (t: string, d: string, a: number) => object) {
  return [
    money("items_base_amount", "Items", p.subtotalCents),
    ...(p.discountCents ? [money("discount", "Discount", p.discountCents)] : []),
    money("subtotal", "Subtotal", p.subtotalCents - p.discountCents),
    money("fulfillment", "Shipping", p.shippingCents),
    money("total", "Total", p.totalCents),
  ];
}

function apply(s: Session, body: Body, config: StoreConfig) {
  if (body.line_items) s.items = itemsFrom(config, body.line_items);
  if (body.discounts?.codes) s.codes = body.discounts.codes.map((c) => c.trim().toUpperCase()).filter(Boolean); // replaces earlier codes
  const d = body.fulfillment_details;
  if (d) {
    // Keep only the spec's fields: the session schema allows no others.
    const a = d.address;
    const address = a && { name: a.name, line_one: a.line_one, ...(a.line_two ? { line_two: a.line_two } : {}), city: a.city, state: a.state, country: a.country, postal_code: a.postal_code };
    s.details = { ...s.details, ...(d.name ? { name: d.name } : {}), ...(d.email ? { email: d.email } : {}), ...(address ? { address } : {}) };
  }
  if (body.buyer?.email) s.details = { ...s.details, email: body.buyer.email };
}

// Charge a Stripe test-mode Shared Payment Token. Returns an error message or null.
// One Stripe Idempotency-Key per session, so a retried complete cannot charge twice.
async function chargeSpt(sessionId: string, token: string, cents: number): Promise<string | null> {
  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: { authorization: `Bearer ${STRIPE}`, "stripe-version": STRIPE_VERSION, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `acp-complete-${sessionId}` },
    body: new URLSearchParams({ amount: String(cents), currency: "usd", confirm: "true", "payment_method_data[shared_payment_granted_token]": token }),
  }).catch((e: Error) => ({ ok: false, json: async () => ({ error: { message: e.message } }) }) as const);
  const pi = (await res.json()) as { status?: string; error?: { message?: string } };
  if (!res.ok || pi.status !== "succeeded") return pi.error?.message ?? `Payment ${pi.status ?? "failed"}`;
  return null;
}

async function complete(s: Session, body: Body, origin: string): Promise<Response | null> {
  if (s.status !== "open") return fail(405, "conflict", `Checkout session is ${s.status}.`);
  // One payment at a time per session: a second complete waits for the first answer.
  if (s.completing) return fail(409, "complete_in_progress", "This checkout session is being paid. Read it again in a moment.");
  s.completing = true;
  try {
    return await pay(s, body, origin);
  } finally {
    s.completing = false;
  }
}

async function pay(s: Session, body: Body, origin: string): Promise<Response | null> {
  const config = getConfig();
  if (soldOut(config, s.items).length) return fail(400, "out_of_stock", "An item in this checkout session is sold out.", "$.line_items");
  if (!s.items.length || !fullAddress(s.details?.address)) return fail(400, "not_ready", "The checkout session is not ready for payment: add an item and a full shipping address.");
  const token = body.payment_data?.instrument?.credential?.token;
  if (!token) return fail(400, "missing", "payment_data.instrument.credential.token is required.", "$.payment_data");
  const priced = priceCart(config, { items: s.items, couponCode: s.codes[0] }, new Date(), "agent");
  if (!s.paid) {
    s.declined = (STRIPE ? await chargeSpt(s.id, token, priced.totalCents) : /^spt_/.test(token) && token !== DECLINE_TOKEN ? null : "Your card was declined.") ?? undefined;
    if (s.declined) return fail(400, "payment_declined", s.declined, "$.payment_data");
    s.paid = true;
  }
  const a = s.details!.address!;
  const order = createOrder({
    email: s.details!.email ?? "agent@example.com",
    name: s.details!.name ?? a.name,
    address: [a.line_one, a.line_two, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", "),
    cardLast4: "4242",
    priced,
  });
  s.status = "completed";
  s.order = { id: order.id, permalink_url: `${origin}/store/order/${order.id}` };
  return null;
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${KEY}`) return fail(401, "unauthorized", "Send Authorization: Bearer <ACP API key>.");
  const origin = new URL(req.url).origin;
  const [id, action] = (await ctx.params).path ?? [];
  if (req.method === "GET") {
    const s = id && sessions.get(id);
    return s ? Response.json(view(s, origin)) : fail(404, "not_found", "Checkout session not found.");
  }

  // Every POST needs an Idempotency-Key; a retry with the same key and body gets the first answer.
  const key = req.headers.get("idempotency-key");
  if (!key) return fail(400, "idempotency_key_required", "Send an Idempotency-Key header on every POST.");
  const raw = await req.text();
  const hash = createHash("sha256").update(raw).digest("hex");
  const slot = `${id ?? ""}/${action ?? ""}/${key}`;
  const seen = replays.get(slot);
  if (seen && seen.hash !== hash) return fail(422, "idempotency_conflict", "This Idempotency-Key was used with a different body.");
  if (seen && !seen.status) {
    const busy = fail(409, "idempotency_in_flight", "A request with this Idempotency-Key is still running.");
    busy.headers.set("retry-after", "1");
    return busy;
  }
  if (seen) return Response.json(seen.body, { status: seen.status, headers: { "idempotent-replayed": "true" } });
  // Reserve the key before any work, so a parallel retry cannot run it twice. Every answer is saved for replays.
  replays.set(slot, { hash, status: 0, body: {} });
  const res = await post(raw, id, action, origin).catch((e: Error) => fail(500, "processing_error", e.message));
  replays.set(slot, { hash, status: res.status, body: await res.clone().json() });
  return res;
}

async function post(raw: string, id: string | undefined, action: string | undefined, origin: string): Promise<Response> {
  let body: Body;
  try {
    body = (raw ? JSON.parse(raw) : {}) as Body;
  } catch {
    return fail(400, "invalid", "The body is not valid JSON.");
  }
  const config = getConfig();

  let status = 200;
  let s: Session | undefined;
  if (!id) {
    if (!body.currency) return fail(400, "missing", "currency is required.", "$.currency");
    s = { id: `cs_${randomUUID().slice(0, 12)}`, items: [], codes: [], status: "open" };
    apply(s, body, config);
    if (!s.items.length) return fail(400, "invalid", "No known item in line_items. Use a variant id, product id, or product slug.", "$.line_items");
    sessions.set(s.id, s);
    status = 201;
  } else {
    s = sessions.get(id);
    if (!s) return fail(404, "not_found", "Checkout session not found.");
    if (action === "complete") {
      const err = await complete(s, body, origin);
      if (err) return err;
    } else if (action === "cancel") {
      if (s.status !== "open") return fail(405, "conflict", `Checkout session is ${s.status}.`);
      s.status = "canceled";
    } else if (action) return fail(404, "not_found", `Unknown action ${action}.`);
    else if (s.status !== "open") return fail(405, "conflict", `Checkout session is ${s.status}.`);
    else apply(s, body, config);
  }
  return Response.json(view(s, origin), { status });
}

// Echo the Idempotency-Key on every answer.
async function withKey(req: Request, ctx: Ctx): Promise<Response> {
  const res = await handle(req, ctx);
  const key = req.headers.get("idempotency-key");
  if (key) res.headers.set("idempotency-key", key);
  return res;
}

export const GET = withKey;
export const POST = withKey;
