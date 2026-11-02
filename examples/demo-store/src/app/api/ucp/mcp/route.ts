import { randomUUID } from "node:crypto";
import { getConfig, priceCart } from "@/lib/store";
import { COUPON_MESSAGES } from "@/lib/store/pricing";
import type { CartItem, StoreConfig } from "@/lib/types";

// A small UCP agent checkout (MCP over JSON-RPC): search_catalog, create_cart, get_cart.
// Carts price with the "agent" sales channel, so a web-only code is rejected here.
const VERSION = "2026-08-25";
const carts = new Map<string, { items: CartItem[]; codes: string[] }>();

type Rpc = { jsonrpc: "2.0"; id?: number | string; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const TOOLS = [
  { name: "search_catalog", description: "Search products.", inputSchema: { type: "object" } },
  { name: "create_cart", description: "Create a cart with line items and discount codes.", inputSchema: { type: "object" } },
  { name: "get_cart", description: "Get a cart.", inputSchema: { type: "object" } },
];

function product(config: StoreConfig, origin: string, p: StoreConfig["products"][number]) {
  return {
    id: p.id,
    title: p.name,
    url: `${origin}/store/products/${p.slug}`,
    variants: p.variants.map((v) => ({
      id: v.id,
      title: v.label,
      price: { amount: p.priceCents, currency: "USD" },
      availability: { available: v.stock > 0 },
    })),
  };
}

function cartView(config: StoreConfig, origin: string, id: string) {
  const c = carts.get(id)!;
  const priced = priceCart(config, { items: c.items, couponCode: c.codes[0] }, new Date(), "agent");
  const msg = priced.couponMessage;
  const rejected = c.codes.length && !priced.couponApplied;
  const code =
    msg === COUPON_MESSAGES.expired ? "discount_code_expired" : msg === COUPON_MESSAGES.invalid ? "discount_code_invalid" : "discount_code_user_ineligible";
  return {
    ucp: { version: VERSION },
    id,
    currency: "USD",
    line_items: priced.lines.map((l, i) => ({
      id: `li_${i + 1}`,
      item: { id: l.variantId, title: `${l.name} - ${l.variantLabel}`, price: l.unitCents },
      quantity: l.qty,
      totals: [{ type: "subtotal", amount: l.lineCents }],
    })),
    discounts: {
      codes: c.codes,
      applied: priced.couponApplied ? [{ code: priced.couponCode, title: msg, amount: priced.discountCents }] : [],
    },
    messages: rejected ? [{ type: "warning", code, path: "$.discounts.codes[0]", content: msg }] : [],
    totals: [
      { type: "subtotal", display_text: "Subtotal", amount: priced.subtotalCents },
      ...(priced.discountCents ? [{ type: "discount", display_text: "Discount", amount: -priced.discountCents }] : []),
      { type: "fulfillment", display_text: "Shipping", amount: priced.shippingCents },
      { type: "total", display_text: "Total", amount: priced.totalCents },
    ],
    continue_url: `${origin}/store/cart`,
  };
}

async function call(name: string, args: Record<string, unknown>, origin: string) {
  const config = await getConfig();
  if (name === "search_catalog") {
    const q = String((args.catalog as { query?: string } | undefined)?.query ?? "").toLowerCase();
    const words = q.split(/\W+/).filter((w) => w.length > 2);
    const hits = config.products.filter((p) => !words.length || words.some((w) => `${p.name} ${p.description}`.toLowerCase().includes(w)));
    return { ucp: { version: VERSION }, products: hits.map((p) => product(config, origin, p)) };
  }
  if (name === "create_cart") {
    const cart = (args.cart ?? {}) as { line_items?: { item?: { id?: string }; quantity?: number }[]; discounts?: { codes?: string[] } };
    const items: CartItem[] = [];
    for (const li of cart.line_items ?? []) {
      const p = config.products.find((x) => x.variants.some((v) => v.id === li.item?.id));
      if (p) items.push({ productId: p.id, variantId: li.item!.id!, qty: li.quantity ?? 1 });
    }
    const id = `cart_${randomUUID().slice(0, 8)}`;
    carts.set(id, { items, codes: (cart.discounts?.codes ?? []).map((x) => x.toUpperCase()) });
    return { cart: cartView(config, origin, id) };
  }
  if (name === "get_cart") {
    const id = String(args.id ?? args.cart_id ?? "");
    if (!carts.has(id)) throw new Error("Cart not found");
    return { cart: cartView(config, origin, id) };
  }
  throw new Error(`Unknown tool ${name}`);
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const rpc = (await req.json().catch(() => null)) as Rpc | null;
  if (!rpc?.method) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  const reply = (body: object) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, ...body });
  if (rpc.method === "initialize") return reply({ result: { protocolVersion: "2025-06-18", serverInfo: { name: "alder-trail-ucp", version: "1.0.0" }, capabilities: { tools: {} } } });
  if (rpc.method === "tools/list") return reply({ result: { tools: TOOLS } });
  if (rpc.method !== "tools/call") return reply({ error: { code: -32601, message: "Method not found" } });
  try {
    const out = await call(rpc.params?.name ?? "", rpc.params?.arguments ?? {}, origin);
    return reply({ result: { structuredContent: out, content: [{ type: "text", text: JSON.stringify(out) }] } });
  } catch (e) {
    return reply({ result: { isError: true, content: [{ type: "text", text: (e as Error).message }] } });
  }
}
