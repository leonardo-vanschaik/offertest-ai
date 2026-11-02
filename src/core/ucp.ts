// Agent checkout check. AI shopping agents (Meta Muse, ChatGPT, Gemini) buy through the store's
// Universal Commerce Protocol (UCP) endpoint, not its web pages. Every Shopify store publishes one at
// /.well-known/ucp. OfferTest builds a cart there with the ad's discount codes and reads the real totals.
// Carts need no key and never charge anyone. https://ucp.dev  https://shopify.dev/docs/agents

// The agent profile tells the store what we support. It must declare the discount extension, or the
// store ignores codes. Shopify's full example profile does; set OFFERTEST_UCP_PROFILE to host your own.
const PROFILE = process.env.OFFERTEST_UCP_PROFILE ?? "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json";
const FALLBACK_PROFILE = "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/cart-and-checkout.json";
const TIMEOUT = 15_000;

type Money = number | { amount?: number | string; currency?: string };
type Total = { type?: string; amount?: number; display_text?: string };
type Message = { type?: string; code?: string; path?: string; content?: string };
type Cart = {
  id?: string;
  currency?: string;
  line_items?: { item?: { id?: string; title?: string; price?: Money }; quantity?: number; totals?: Total[] }[];
  totals?: Total[];
  discounts?: { codes?: string[]; applied?: { code?: string; title?: string; amount?: number; automatic?: boolean }[] };
  messages?: Message[];
  continue_url?: string;
};

export type AgentCheckout = { url: string; text: string } | { skipped: string };

export async function discover(origin: string): Promise<{ endpoint: string; discounts: boolean } | null> {
  const res = await fetch(`${origin}/.well-known/ucp`, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: "application/json" } }).catch(() => null);
  if (!res?.ok) return null;
  const doc = (await res.json().catch(() => null)) as { ucp?: { services?: Record<string, { transport?: string; endpoint?: string }[]>; capabilities?: Record<string, unknown> } } | null;
  const ucp = doc?.ucp;
  if (!ucp) return null;
  const mcp = (ucp.services?.["dev.ucp.shopping"] ?? []).find((s) => s.transport === "mcp");
  const caps = Object.keys(ucp.capabilities ?? {});
  if (caps.length && !caps.includes("dev.ucp.shopping.cart")) return null;
  return { endpoint: mcp?.endpoint ?? `${origin}/api/ucp/mcp`, discounts: caps.includes("dev.ucp.shopping.discount") };
}

let rpcId = 0;
async function call<T>(endpoint: string, tool: string, args: Record<string, unknown>, profile = PROFILE): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: { ...args, meta: { "ucp-agent": { profile } } } } }),
  });
  const raw = await res.text();
  // Streamable HTTP servers may answer as a single SSE event.
  const body = raw.trimStart().startsWith("event:") || raw.trimStart().startsWith("data:") ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("") : raw;
  const data = JSON.parse(body) as { error?: { message?: string }; result?: { isError?: boolean; structuredContent?: T; content?: { text?: string }[] } };
  const text = data.result?.content?.[0]?.text;
  if (data.error || data.result?.isError) {
    const msg = data.error?.message ?? text ?? "tool error";
    // The store could not fetch or accept our profile: retry once with Shopify's example profile.
    if (profile !== FALLBACK_PROFILE && /profile|discovery|negotiat/i.test(msg)) return call<T>(endpoint, tool, args, FALLBACK_PROFILE);
    throw new Error(`${tool}: ${msg}`);
  }
  const out = data.result?.structuredContent ?? (text ? (JSON.parse(text) as T) : undefined);
  if (!out) throw new Error(`${tool}: empty result`);
  return out;
}

// The product on the ad's landing page, as an agent-checkout item id. Only the advertised product counts:
// the variant in the link (?variant=) if there is one, else the product page's default (first available) variant.
// No guessing: a page that matches no catalog item gives a reason instead of some other product.
async function findItem(endpoint: string, url: URL, query: string): Promise<{ id: string; title: string } | { skip: string }> {
  const want = url.searchParams.get("variant");
  // Shopify product pages have a public JSON twin with the variant ids.
  const handle = url.pathname.match(/\/products\/([^/?#]+)/)?.[1];
  if (handle) {
    const res = await fetch(`${url.origin}/products/${handle}.js`, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
    const p = res?.ok ? ((await res.json().catch(() => null)) as { title?: string; variants?: { id: number; title?: string; available?: boolean }[] } | null) : null;
    if (p?.variants?.length) {
      const v = want ? p.variants.find((x) => String(x.id) === want) : (p.variants.find((x) => x.available !== false) ?? p.variants[0]);
      if (!v) return { skip: `Agent checkout skipped: variant ${want} from the ad's link is not on ${url.pathname}` };
      if (want && v.available === false) return { skip: `Agent checkout skipped: the advertised variant (${v.title ?? want}) is sold out` };
      return { id: `gid://shopify/ProductVariant/${v.id}`, title: [p.title, v.title !== "Default Title" ? v.title : ""].filter(Boolean).join(" - ") };
    }
  }
  type Product = { title?: string; url?: string; variants?: { id?: string; title?: string; availability?: { available?: boolean }; available?: boolean }[] };
  const path = url.pathname.replace(/\/$/, "");
  // Search by the ad's subject, then by the page's own name ("ridge-trail-shoe"): a subject such as "shoes"
  // can miss a product called "Ridge trail shoe".
  const pageName = decodeURIComponent(handle ?? path.split("/").pop() ?? "").replace(/[-_]+/g, " ").trim();
  let p: Product | undefined;
  for (const q of [...new Set([query, pageName])].filter(Boolean)) {
    const found = await call<{ products?: Product[] }>(endpoint, "search_catalog", { catalog: { query: q } }).catch(() => null);
    p = (found?.products ?? []).find((x) => x.url && new URL(x.url, url).pathname.replace(/\/$/, "") === path);
    if (p) break;
  }
  if (!p) return { skip: `Agent checkout skipped: no catalog item matches the ad's landing page ${url.pathname}` };
  const isWanted = (id?: string) => !!id && (id === want || id.endsWith(`/${want}`));
  const v = want ? p.variants?.find((x) => isWanted(x.id)) : (p.variants?.find((x) => x.availability?.available !== false && x.available !== false) ?? p.variants?.[0]);
  if (!v?.id) return { skip: `Agent checkout skipped: the advertised variant is not in the store's agent catalog` };
  return { id: v.id, title: [p.title, v.title].filter(Boolean).join(" - ") };
}

export function money(amount: Money | undefined, currency = "USD"): string {
  const n = typeof amount === "object" ? Number(amount?.amount) : Number(amount);
  const cur = (typeof amount === "object" && amount?.currency) || currency;
  if (!Number.isFinite(n)) return "?";
  const v = Math.abs(n / 100).toFixed(2);
  const sign = n < 0 ? "-" : "";
  return cur === "USD" ? `${sign}$${v}` : `${sign}${v} ${cur}`;
}

export function cartText(cart: Cart, endpoint: string, codes: string[]): string {
  const cur = cart.currency ?? "USD";
  const lines = [`Agent checkout cart (UCP: the channel AI shopping agents such as Meta Muse buy through)`, `Endpoint: ${endpoint}`];
  for (const li of cart.line_items ?? []) lines.push(`Item: ${li.item?.title ?? li.item?.id} x${li.quantity ?? 1}: ${money(li.item?.price, cur)}`);
  if (codes.length) {
    lines.push(`Discount codes sent: ${codes.join(", ")}`);
    const applied = cart.discounts?.applied ?? [];
    if (!cart.discounts && !(cart.messages ?? []).some((m) => /discount/i.test(m.code ?? ""))) lines.push("The store returned no discount result for agents (codes may not be supported in agent checkout).");
    else if (!applied.length) lines.push("Discounts applied: none");
    for (const a of applied) lines.push(`Discount applied: ${a.code ?? "(automatic)"} "${a.title ?? ""}" ${money(-(a.amount ?? 0), cur)}`);
  }
  for (const m of cart.messages ?? []) lines.push(`Store message (${m.type ?? "info"}${m.code ? ` ${m.code}` : ""}): ${m.content ?? ""}`);
  for (const t of cart.totals ?? []) lines.push(`${t.display_text ?? t.type}: ${money(t.amount, cur)}`);
  if (cart.continue_url) lines.push(`Cart link: ${cart.continue_url}`);
  return lines.join("\n");
}

// Codes the ad tells customers to use, from the extracted promises.
export function codesFrom(conditions: Record<string, string>[]): string[] {
  const out = new Set<string>();
  for (const c of conditions)
    for (const [k, v] of Object.entries(c)) if (/code/i.test(k) && /^[A-Z0-9][A-Z0-9_-]{2,30}$/i.test(v.trim())) out.add(v.trim().toUpperCase());
  return [...out];
}

export async function agentCheckout(landing: string, codes: string[], query: string): Promise<AgentCheckout> {
  const url = new URL(landing);
  const ucp = await discover(url.origin);
  if (!ucp) return { skipped: `${url.host} has no agent checkout (no UCP profile at /.well-known/ucp)` };
  try {
    const item = await findItem(ucp.endpoint, url, query);
    if ("skip" in item) return { skipped: item.skip };
    const result = await call<{ cart?: Cart } & Cart>(ucp.endpoint, "create_cart", {
      cart: { line_items: [{ quantity: 1, item: { id: item.id } }], ...(codes.length ? { discounts: { codes } } : {}) },
    });
    const cart = result.cart ?? result;
    const first = cart.line_items?.[0];
    if (first && !first.item?.title) first.item = { ...first.item, title: item.title };
    return { url: `ucp://${url.host}/cart`, text: cartText(cart, ucp.endpoint, codes) };
  } catch (e) {
    return { skipped: `Agent checkout error: ${(e as Error).message}` };
  }
}
