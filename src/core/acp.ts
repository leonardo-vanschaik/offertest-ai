import { randomUUID } from "node:crypto";
import { money, type AgentCheckout } from "./ucp.ts";

// ACP purchase check. The Agentic Commerce Protocol (Stripe, OpenAI, Meta) is the checkout API that AI agents
// such as ChatGPT buy through. The store owner issues the agent a key, so this runs on stores you own.
// OfferTest opens a checkout session with the ad's codes, reads what the store applied or rejected, and
// finishes a test purchase: never real money (a Stripe test-mode token, or the store's demo token).
// Spec 2026-04-17: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol

const VERSION = "2026-04-17";
const STRIPE_VERSION = "2026-09-30.preview";
const TIMEOUT = 20_000;
// The same test shopper the browser agent uses.
const SHOPPER = {
  name: "Test Shopper",
  email: "test@offertest.ai",
  address: { name: "Test Shopper", line_one: "100 Test Street", city: "Columbus", state: "OH", country: "US", postal_code: "43215" },
};

type Total = { type?: string; display_text?: string; amount?: number };
type Handler = { id: string; name?: string; psp?: string; config?: { test_token?: string } };
type Session = {
  id: string;
  status?: string;
  currency?: string;
  line_items?: { item?: { id?: string; name?: string }; name?: string; quantity?: number; unit_amount?: number }[];
  totals?: Total[];
  discounts?: { codes?: string[]; applied?: { code?: string; coupon?: { name?: string }; amount?: number }[]; rejected?: { code?: string; reason?: string; message?: string }[] };
  messages?: { type?: string; code?: string; content?: string }[];
  capabilities?: { payment?: { handlers?: Handler[] } };
  order?: { id?: string; permalink_url?: string };
};

export type AcpOptions = {
  endpoint: string; // base URL that has /checkout_sessions, e.g. https://shop.example/api/acp
  key: string; // the store's ACP API key (Authorization: Bearer)
  item: string; // product, variant, or SKU id in the store's ACP catalog
  codes: string[];
  buy?: boolean; // finish a test purchase (default true)
  stripeTestKey?: string; // sk_test_ key of the store's Stripe account, to make a test payment token
};

async function acp(o: AcpOptions, path: string, body?: object): Promise<Session> {
  const res = await fetch(`${o.endpoint.replace(/\/$/, "")}/checkout_sessions${path}`, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(TIMEOUT),
    headers: {
      authorization: `Bearer ${o.key}`,
      "api-version": VERSION,
      "content-type": "application/json",
      "user-agent": "OfferTest",
      ...(body ? { "idempotency-key": randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Session & { message?: string; code?: string };
  if (!res.ok) throw new Error(`${res.status} ${data.code ?? ""} ${data.message ?? ""}`.trim());
  return data;
}

// A one-time Stripe test-mode Shared Payment Token for this amount (what an agent's wallet would grant).
export async function testSpt(stripeTestKey: string, cents: number, currency = "usd"): Promise<string> {
  if (!stripeTestKey.startsWith("sk_test_")) throw new Error("OfferTest only makes test-mode payment tokens: use an sk_test_ key");
  const res = await fetch("https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { authorization: `Bearer ${stripeTestKey}`, "stripe-version": STRIPE_VERSION, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      payment_method: "pm_card_visa",
      "usage_limits[currency]": currency,
      "usage_limits[max_amount]": String(cents),
      "usage_limits[expires_at]": String(Math.floor(Date.now() / 1000) + 3600),
    }),
  });
  const t = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !t.id) throw new Error(`Stripe test token: ${t.error?.message ?? res.status}`);
  return t.id;
}

const totalOf = (s: Session) => s.totals?.find((t) => t.type === "total")?.amount ?? 0;

export function sessionText(s: Session, o: Pick<AcpOptions, "endpoint" | "codes">, purchase: string): string {
  const cur = (s.currency ?? "usd").toUpperCase();
  const lines = [`Agent checkout session (ACP: the checkout API AI agents such as ChatGPT buy through)`, `Endpoint: ${o.endpoint}`, `Session: ${s.id} (${s.status})`];
  for (const li of s.line_items ?? []) lines.push(`Item: ${li.name ?? li.item?.name ?? li.item?.id} x${li.quantity ?? 1}: ${money(li.unit_amount, cur)}`);
  if (o.codes.length) {
    lines.push(`Discount codes sent: ${o.codes.join(", ")}`);
    const applied = s.discounts?.applied ?? [];
    const rejected = s.discounts?.rejected ?? [];
    if (!s.discounts) lines.push("The store returned no discount result for agents (codes may not be supported in agent checkout).");
    else if (!applied.length) lines.push("Discounts applied: none");
    for (const a of applied) lines.push(`Discount applied: ${a.code ?? "(automatic)"} "${a.coupon?.name ?? ""}" -${money(Math.abs(a.amount ?? 0), cur)}`);
    for (const r of rejected) lines.push(`Discount rejected: ${r.code} (${r.reason})${r.message ? `: ${r.message}` : ""}`);
  }
  for (const m of s.messages ?? []) lines.push(`Store message (${m.type ?? "info"}${m.code ? ` ${m.code}` : ""}): ${m.content ?? ""}`);
  for (const t of s.totals ?? []) if (t.type !== "items_base_amount") lines.push(`${t.display_text ?? t.type}: ${t.type === "discount" ? "-" : ""}${money(t.type === "discount" ? Math.abs(t.amount ?? 0) : t.amount, cur)}`);
  lines.push(purchase);
  return lines.join("\n");
}

// Pick a way to pay without real money, or say why there is none.
async function testCredential(o: AcpOptions, s: Session): Promise<{ handler: string; token: string } | string> {
  const handlers = s.capabilities?.payment?.handlers ?? [];
  const demo = handlers.find((h) => h.config?.test_token);
  if (demo) return { handler: demo.id, token: demo.config!.test_token! };
  const stripe = handlers.find((h) => h.psp === "stripe" || /tokenized\.card/.test(h.name ?? ""));
  if (!stripe) return `the store offers no test payment method (${handlers.map((h) => h.name ?? h.id).join(", ") || "none"})`;
  if (!o.stripeTestKey) return "set STRIPE_TEST_KEY (your store's sk_test_ key) to finish a test purchase";
  return { handler: stripe.id, token: await testSpt(o.stripeTestKey, totalOf(s), s.currency ?? "usd") };
}

export async function acpCheckout(o: AcpOptions): Promise<AgentCheckout> {
  try {
    let s = await acp(o, "", {
      line_items: [{ id: o.item }],
      currency: "usd",
      capabilities: { extensions: ["discount"] },
      ...(o.codes.length ? { discounts: { codes: o.codes } } : {}),
      fulfillment_details: SHOPPER,
      buyer: { email: SHOPPER.email, first_name: "Test", last_name: "Shopper" },
    });
    let purchase = "Test purchase: not attempted (--no-buy)";
    if (o.buy !== false) {
      if (s.status !== "ready_for_payment") purchase = `Test purchase: not attempted (session is ${s.status})`;
      else {
        const cred = await testCredential(o, s);
        if (typeof cred === "string") purchase = `Test purchase: not attempted (${cred})`;
        else {
          const done = await acp(o, `/${s.id}/complete`, { payment_data: { handler_id: cred.handler, instrument: { type: "card", credential: { type: "spt", token: cred.token } } } }).catch((e: Error) => e);
          if (!(done instanceof Error)) s = done;
          purchase = done instanceof Error
            ? `Test purchase: refused by the store (${done.message})`
            : s.status === "completed"
            ? `Test purchase: completed, order ${s.order?.id ?? "?"}, paid ${money(totalOf(s), (s.currency ?? "usd").toUpperCase())} in test mode${s.order?.permalink_url ? ` (${s.order.permalink_url})` : ""}`
            : `Test purchase: not completed (session is ${s.status})`;
        }
      }
    }
    return { url: `acp://${new URL(o.endpoint).host}/checkout_sessions/${s.id}`, text: sessionText(s, o, purchase) };
  } catch (e) {
    return { skipped: `ACP checkout error: ${(e as Error).message}` };
  }
}

// The ACP item id for a landing page: the last path segment (a product slug), unless one is given.
export function itemFromUrl(url: string): string {
  return new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
}
