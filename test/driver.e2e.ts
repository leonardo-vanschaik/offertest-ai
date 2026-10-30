// Needs the demo store: (cd examples/demo-store && npm run dev). Run: node --import tsx --test test/driver.e2e.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Driver } from "../src/core/driver.ts";

const STORE = process.env.DEMO_STORE ?? "http://localhost:3000";

async function center(d: Driver, selector: string) {
  const box = await d.page.locator(selector).first().boundingBox();
  assert.ok(box, `no element for ${selector}`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

test("payment guard stops 'Place order' but not shopping clicks", async () => {
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
  const d = new Driver();
  await d.start(`${STORE}/store/products/ridge-trail-shoe`);
  try {
    await d.page.getByRole("button", { name: /10/ }).first().click();
    const add = await center(d, "button:has-text('Add to cart')");
    assert.equal(await d.guard({ type: "click", ...add }), null);
    await d.execute({ type: "click", ...add });
    await d.page.goto(`${STORE}/store/checkout`);
    const place = await center(d, "[data-requires-approval]");
    const g = await d.guard({ type: "click", ...place });
    assert.equal(g?.kind, "payment");
    assert.ok(await d.onPaymentPage());
    // Enter in a checkout field submits the form, whose default button is "Place order".
    await d.page.locator("input[type=email], input[name=email]").first().focus();
    assert.equal((await d.guard({ type: "keypress", keys: ["Enter"] }))?.kind, "payment");
    assert.equal((await d.guard({ type: "type", text: "4242\n" }))?.kind, "payment");
    assert.equal(await d.guard({ type: "type", text: "Test Shopper" }), null);
    const text = await d.text();
    assert.match(text, /Place order/);
    assert.match(text, /accessibility snapshot/);
    assert.equal(await d.blockedReason(), null);
  } finally {
    await d.close();
  }
});

test("a file download shows up in the page evidence", async () => {
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
  const d = new Driver();
  await d.start(`${STORE}/store/guides/first-thru-hike`);
  try {
    await d.page.locator("input[type=email]").first().fill("test@offertest.ai");
    await d.page.locator("form button[type=submit], form button").first().click();
    await d.page.waitForURL(/thanks/);
    const link = await center(d, "a:has-text('Download')");
    await d.execute({ type: "click", ...link });
    await d.page.waitForTimeout(1000);
    assert.match(await d.text(), /Downloaded file: .*\.pdf/);
  } finally {
    await d.close();
  }
});

test("Space on a focused pay button needs approval", async () => {
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
  const d = new Driver();
  await d.start(`${STORE}/store/products/ridge-trail-shoe`);
  try {
    await d.page.getByRole("button", { name: /10/ }).first().click();
    await d.page.locator("button:has-text('Add to cart')").first().click();
    await d.page.waitForURL(/cart/);
    await d.page.goto(`${STORE}/store/checkout`);
    await d.page.locator("[data-requires-approval]").focus();
    assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "payment");
    await d.page.locator("input[type=email], input[name=email]").first().focus();
    assert.equal(await d.guard({ type: "type", text: "Test Shopper" }), null);
  } finally {
    await d.close();
  }
});

test("Enter in the discount-code field is not payment", async () => {
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"code_expired"}' });
  const d = new Driver();
  await d.start(`${STORE}/store/products/ridge-trail-shoe`);
  try {
    await d.page.getByRole("button", { name: /10/ }).first().click();
    await d.page.locator("button:has-text('Add to cart')").first().click();
    await d.page.waitForURL(/cart/);
    const code = d.page.getByPlaceholder(/code/i).or(d.page.locator("input[name*=code i]")).first();
    await code.click();
    await d.execute({ type: "type", text: "SAVE20" });
    assert.equal(await d.guard({ type: "keypress", keys: ["Enter"] }), null);
    await d.execute({ type: "keypress", keys: ["Enter"] });
    assert.match(await d.text(), /This code has expired\./);
  } finally {
    await d.close();
    await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
  }
});

test("agent checkout (UCP) rejects a web-only code that the website accepts", async () => {
  const { agentCheckout } = await import("../src/core/ucp.ts");
  const set = (scenario: string) =>
    fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
  try {
    await set("baseline");
    const ok = await agentCheckout(`${STORE}/store/products/ridge-trail-shoe`, ["SAVE20"], "Ridge trail shoe");
    assert.ok("text" in ok && /Discount applied: SAVE20/.test(ok.text) && /Total: \$96\.00/.test(ok.text));
    await set("agent_code_rejected");
    const bad = await agentCheckout(`${STORE}/store/products/ridge-trail-shoe`, ["SAVE20"], "Ridge trail shoe");
    assert.ok("text" in bad && /This code is not valid\./.test(bad.text) && /Total: \$120\.00/.test(bad.text));
  } finally {
    await set("baseline");
  }
});

test("ACP checkout buys in test mode and catches a web-only code", async () => {
  const { acpCheckout } = await import("../src/core/acp.ts");
  const set = (scenario: string) =>
    fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
  const o = { endpoint: `${STORE}/api/acp`, key: "alder-trail-demo", item: "ridge-trail-shoe", codes: ["SAVE20"] };
  try {
    await set("baseline");
    const ok = await acpCheckout(o);
    assert.ok("text" in ok, JSON.stringify(ok));
    assert.match(ok.text, /Discount applied: SAVE20/);
    assert.match(ok.text, /Test purchase: completed, order AT-\d+, paid \$96\.00 in test mode/);
    await set("agent_code_rejected");
    const bad = await acpCheckout({ ...o, buy: false });
    assert.ok("text" in bad);
    assert.match(bad.text, /Discount rejected: SAVE20 \(discount_code_invalid\)/);
    assert.match(bad.text, /Total: \$120\.00/);
    const locked = await acpCheckout({ ...o, key: "wrong" });
    assert.ok("skipped" in locked && /401/.test(locked.skipped));
  } finally {
    await set("baseline");
  }
});

test("ACP seller: parallel completes pay once, and a sold-out size is never sold", async () => {
  const set = (scenario: string) =>
    fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
  const acp = (path: string, body: object, key: string = crypto.randomUUID()) =>
    fetch(`${STORE}/api/acp/checkout_sessions${path}`, {
      method: "POST",
      headers: { authorization: "Bearer alder-trail-demo", "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    });
  const address = { name: "Test Shopper", line_one: "100 Test Street", city: "Columbus", state: "OH", country: "US", postal_code: "43215" };
  const orders = async () => ((await (await fetch(`${STORE}/api/store/orders`)).json()) as unknown[]).length;
  const pay = { payment_data: { handler_id: "demo_card", instrument: { type: "card", credential: { type: "spt", token: "spt_demo_4242" } } } };
  try {
    await set("baseline");
    const s = (await (await acp("", { line_items: [{ id: "ridge-trail-shoe" }], currency: "usd", fulfillment_details: { address } })).json()) as { id: string };
    const before = await orders();
    const answers = await Promise.all([acp(`/${s.id}/complete`, pay), acp(`/${s.id}/complete`, pay), acp(`/${s.id}/complete`, pay, "same"), acp(`/${s.id}/complete`, pay, "same")]);
    assert.equal(answers.filter((r) => r.status === 200).length >= 1, true);
    assert.equal((await orders()) - before, 1, "exactly one order for one session");

    await set("size_sold_out");
    const sold = (await (await acp("", { line_items: [{ id: "ridge-slate-10" }], currency: "usd", fulfillment_details: { address } })).json()) as { id: string; status: string; messages: { code: string }[] };
    assert.equal(sold.status, "not_ready_for_payment");
    assert.ok(sold.messages.some((m) => m.code === "out_of_stock"));
    const refused = await acp(`/${sold.id}/complete`, pay);
    assert.equal(refused.status, 400);
  } finally {
    await set("baseline");
  }
});
