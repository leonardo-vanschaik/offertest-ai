// The demo store's privacy and checkout safety. Needs examples/demo-store installed; the HTTP tests also need it
// running on :3000. Run: node --import tsx --test test/store.e2e.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STORE = process.env.DEMO_STORE ?? "http://localhost:3000";
const DEMO = path.resolve(import.meta.dirname, "../examples/demo-store");

// Run a snippet against the store library in a fresh folder (its own data/store.json), with the store's
// import paths. `st` is src/lib/store/state.ts. Returns what the snippet prints as JSON.
function withStore(code: string, files: Record<string, string> = {}): unknown {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-store-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
    fs.writeFileSync(path.join(cwd, rel), text);
  }
  const script = `const st = await import(${JSON.stringify(path.join(DEMO, "src/lib/store/state.ts"))});\n${code}`;
  const r = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", script], {
    cwd,
    env: { ...process.env, TSX_TSCONFIG_PATH: path.join(DEMO, "tsconfig.json") },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop()!);
}

const priced = { lines: [{ productId: "ridge" }], subtotalCents: 12000, discountCents: 0, shippingCents: 0, totalCents: 12000 };

test("an order keeps no full contact data, and one ACP session makes at most one order", () => {
  const out = withStore(`
const input = { email: "jane@example.com", name: "Jane Q Public", address: "1 Main St, Springfield", cardLast4: "4242", priced: ${JSON.stringify(priced)}, checkoutSessionId: "cs_1" };
const a = await st.createOrder(input);
const b = await st.createOrder(input); // a retry after a failed write: finds the first order
console.log(JSON.stringify({ a, b, count: (await st.listOrders()).length }));`) as { a: { id: string; email: string; name: string; address: string }; b: { id: string }; count: number };
  assert.equal(out.a.email, "j***@example.com");
  assert.equal(out.a.name, "Jane P.");
  assert.doesNotMatch(out.a.address, /Main/);
  assert.equal(out.b.id, out.a.id);
  assert.equal(out.count, 1);
});

test("orders saved before redaction are redacted when read", () => {
  const legacy = {
    version: 1,
    config: { scenario: "baseline", products: [], coupons: [], shipping: { flatRateCents: 0, freeOverCents: null } },
    orders: [{ id: "AT-10427", createdAt: "2026-10-30T12:00:00Z", email: "jane@example.com", name: "Jane Q Public", address: "1 Main St, Springfield", cardLast4: "4242", testMode: true, priced }],
    nextOrderNumber: 10428,
    cartEpoch: 1,
  };
  const out = withStore(`console.log(JSON.stringify(await st.getOrder("AT-10427")));`, { "data/store.json": JSON.stringify(legacy) }) as { email: string; name: string; address: string };
  assert.equal(out.email, "j***@example.com");
  assert.equal(out.name, "Jane P.");
  assert.doesNotMatch(out.address, /Main/);
});

test("the shared key-value store: first write wins, compare-and-swap, and records expire after 24 hours", () => {
  const out = withStore(`
const first = await st.kvSet("k", "a", null);
const second = await st.kvSet("k", "b", null);
const stale = await st.kvSet("k", "c", "b");
const swap = await st.kvSet("k", "c", "a");
const now = Date.now;
Date.now = () => now() + st.KV_TTL_MS + 1000;
await st.kvPrune();
console.log(JSON.stringify({ first, second, stale, swap, after: await st.kvGet("k") }));`) as Record<string, unknown>;
  assert.deepEqual(out, { first: true, second: false, stale: false, swap: true, after: null });
});

test("ACP: a completed session and its saved replies hide the buyer's address and email", async () => {
  const acp = (p: string, body: object, key = crypto.randomUUID()) =>
    fetch(`${STORE}/api/acp/checkout_sessions${p}`, {
      method: "POST",
      headers: { authorization: "Bearer alder-trail-demo", "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    });
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
  const address = { name: "Jane Q Public", line_one: "1 Main St", city: "Springfield", state: "OH", country: "US", postal_code: "45501" };
  const create = { line_items: [{ id: "ridge-trail-shoe" }], currency: "usd", fulfillment_details: { email: "jane@example.com", address } };
  const created = await acp("", create, "create-1");
  const s = (await created.json()) as { id: string; fulfillment_details: { address: { line_one: string } } };
  assert.equal(s.fulfillment_details.address.line_one, "1 Main St", "an open session keeps the address it needs");
  // A retry of the same request gets the saved reply, which never holds the full address.
  const replay = (await (await acp("", create, "create-1")).json()) as { fulfillment_details: { email: string; address: { line_one: string; postal_code: string } } };
  assert.equal(replay.fulfillment_details.address.line_one, "Hidden");
  assert.equal(replay.fulfillment_details.email, "j***@example.com");
  const pay = { payment_data: { handler_id: "demo_card", instrument: { type: "card", credential: { type: "spt", token: "spt_demo_4242" } } } };
  assert.equal((await acp(`/${s.id}/complete`, pay)).status, 200);
  const done = (await (await fetch(`${STORE}/api/acp/checkout_sessions/${s.id}`, { headers: { authorization: "Bearer alder-trail-demo" } })).json()) as {
    status: string;
    fulfillment_details: { email: string; address: { line_one: string; postal_code: string } };
  };
  assert.equal(done.status, "completed");
  assert.equal(done.fulfillment_details.address.line_one, "Hidden");
  assert.equal(done.fulfillment_details.address.postal_code, "Hidden");
  assert.equal(done.fulfillment_details.email, "j***@example.com");
});
