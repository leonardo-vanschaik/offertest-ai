import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { agentCheckout } from "../src/core/ucp.ts";

// A small Shopify-like store: /.well-known/ucp, a product JSON twin, and create_cart that echoes the item.
async function shop() {
  const srv = http.createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    const origin = `http://${req.headers.host}`;
    if (req.url === "/.well-known/ucp")
      return void res.end(JSON.stringify({ ucp: { services: { "dev.ucp.shopping": [{ transport: "mcp", endpoint: `${origin}/mcp` }] }, capabilities: { "dev.ucp.shopping.cart": [{}] } } }));
    if (req.url === "/products/shoe.js")
      return void res.end(JSON.stringify({ title: "Shoe", variants: [{ id: 111, title: "7", available: true }, { id: 222, title: "10", available: true }, { id: 333, title: "12", available: false }] }));
    if (req.url === "/mcp") {
      let raw = "";
      for await (const c of req) raw += c;
      const rpc = JSON.parse(raw);
      const args = rpc.params.arguments;
      const out =
        rpc.params.name === "search_catalog"
          ? { products: [{ title: "Other", url: `${origin}/products/other`, variants: [{ id: "v9", title: "Default" }] }] }
          : { cart: { line_items: [{ item: { id: args.cart.line_items[0].item.id }, quantity: 1 }], totals: [] } };
      return void res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { structuredContent: out } }));
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((r) => srv.listen(0, r));
  return { origin: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
}

test("agent checkout uses the variant in the ad's link", async () => {
  const s = await shop();
  try {
    const r = await agentCheckout(`${s.origin}/products/shoe?variant=222`, [], "shoe");
    assert.ok("text" in r && /Shoe - 10/.test(r.text), JSON.stringify(r));
  } finally {
    s.close();
  }
});

test("a sold-out or unknown advertised variant is reported, not swapped for another", async () => {
  const s = await shop();
  try {
    const sold = await agentCheckout(`${s.origin}/products/shoe?variant=333`, [], "shoe");
    assert.ok("skipped" in sold && /sold out/.test(sold.skipped));
    const gone = await agentCheckout(`${s.origin}/products/shoe?variant=999`, [], "shoe");
    assert.ok("skipped" in gone && /not on/.test(gone.skipped));
  } finally {
    s.close();
  }
});

test("a landing page that matches no catalog item is skipped, not replaced by the first search hit", async () => {
  const s = await shop();
  try {
    const r = await agentCheckout(`${s.origin}/collections/sale`, ["SAVE20"], "sale");
    assert.ok("skipped" in r && /no catalog item matches/.test(r.skipped), JSON.stringify(r));
  } finally {
    s.close();
  }
});
