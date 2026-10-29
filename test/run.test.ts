import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationOf, shouldRetryVisible } from "../src/core/run.ts";
import type { FunnelResult } from "../src/core/funnel.ts";

const funnel = (pages: [string, string][], extra: Partial<FunnelResult> = {}): FunnelResult => ({
  evidence: pages.map(([url, text], i) => ({ step: i + 2, url, text })),
  notes: "",
  stoppedAtPayment: false,
  paid: false,
  stepLimitHit: false,
  ...extra,
});

test("a /checkout/confirm URL without confirmation text is not a confirmation", () => {
  const f = funnel([
    ["https://shop.example/products/a", "Ridge shoe $96"],
    ["https://shop.example/checkout/confirm", "Review your order\nPlace order"],
  ]);
  assert.equal(confirmationOf(f, {}), undefined);
});

test("a funnel stopped at payment never counts as confirmed", () => {
  const f = funnel(
    [
      ["https://shop.example/products/a", "Ridge shoe"],
      ["https://shop.example/checkout", "Thank you for shopping with us\nPlace order"],
    ],
    { stoppedAtPayment: true },
  );
  assert.equal(confirmationOf(f, {}), undefined);
});

test("confirmation text near the top counts", () => {
  const f = funnel([
    ["https://shop.example/guide", "Free guide"],
    ["https://shop.example/thanks", "You're all set\nCheck your email for the guide."],
  ]);
  assert.equal(confirmationOf(f, {})?.text, "You're all set");
});

test("the first page of a funnel is never the confirmation", () => {
  assert.equal(confirmationOf(funnel([["https://shop.example/thanks", "Thank you"]]), {}), undefined);
});

test("visible retry only when asked for, and never for a password page", () => {
  const blocked = funnel([], { blocked: "Cloudflare bot check" });
  assert.equal(shouldRetryVisible(blocked, false, {}), false);
  assert.equal(shouldRetryVisible(blocked, false, { retryHeadful: true }), true);
  assert.equal(shouldRetryVisible(blocked, true, { retryHeadful: true }), false);
  assert.equal(shouldRetryVisible(funnel([], { blocked: "Store is password protected" }), false, { retryHeadful: true }), false);
});
