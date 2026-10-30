import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { acpCheckout, itemFromUrl, sessionText, testSpt } from "../src/core/acp.ts";

test("the item id defaults to the product page slug", () => {
  assert.equal(itemFromUrl("https://shop.example/store/products/ridge-trail-shoe/?utm_source=fb"), "ridge-trail-shoe");
});

test("a rejected code shows the reason, the store's words, and full totals", () => {
  const text = sessionText(
    {
      id: "cs_1",
      status: "ready_for_payment",
      line_items: [{ name: "Ridge trail shoe - Size 7", quantity: 1, unit_amount: 12000 }],
      discounts: { codes: ["SAVE20"], applied: [], rejected: [{ code: "SAVE20", reason: "discount_code_invalid", message: "This code is not valid." }] },
      totals: [{ type: "items_base_amount", amount: 12000 }, { type: "total", display_text: "Total", amount: 12000 }],
    },
    { endpoint: "https://shop.example/api/acp", codes: ["SAVE20"] },
    "Test purchase: not attempted (--no-buy)",
  );
  assert.match(text, /Discounts applied: none/);
  assert.match(text, /Discount rejected: SAVE20 \(discount_code_invalid\): This code is not valid\./);
  assert.match(text, /Total: \$120\.00/);
  assert.doesNotMatch(text, /items_base_amount/);
});

test("an applied discount reads as a minus amount whatever its sign", () => {
  const text = sessionText(
    { id: "cs_1", discounts: { applied: [{ code: "SAVE20", coupon: { name: "20% off" }, amount: 2400 }] }, totals: [{ type: "discount", display_text: "Discount", amount: 2400 }] },
    { endpoint: "e", codes: ["SAVE20"] },
    "",
  );
  assert.match(text, /Discount applied: SAVE20 "20% off" -\$24\.00/);
  assert.match(text, /Discount: -\$24\.00/);
});

test("only test-mode Stripe keys can make a payment token", async () => {
  await assert.rejects(testSpt("sk_live_123", 1000), /sk_test_/);
});

test("a Stripe store with no test key stops before payment and says what to set", async () => {
  const srv = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (!req.headers["idempotency-key"] || req.headers.authorization !== "Bearer k") return void res.writeHead(400).end("{}");
    res.writeHead(201).end(
      JSON.stringify({
        id: "cs_9",
        status: "ready_for_payment",
        currency: "usd",
        capabilities: { payment: { handlers: [{ id: "stripe_spt", name: "dev.acp.tokenized.card", psp: "stripe" }] } },
        discounts: { codes: ["SAVE20"], applied: [{ code: "SAVE20", amount: 2400 }], rejected: [] },
        totals: [{ type: "total", display_text: "Total", amount: 9600 }],
      }),
    );
  });
  await new Promise<void>((r) => srv.listen(0, r));
  try {
    const r = await acpCheckout({ endpoint: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/acp`, key: "k", item: "shoe", codes: ["SAVE20"] });
    assert.ok("text" in r);
    assert.match(r.url, /^acp:\/\/127\.0\.0\.1:\d+\/checkout_sessions\/cs_9$/);
    assert.match(r.text, /Discount applied: SAVE20/);
    assert.match(r.text, /Test purchase: not attempted \(set STRIPE_TEST_KEY/);
  } finally {
    srv.close();
  }
});
