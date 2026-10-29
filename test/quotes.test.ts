import { test } from "node:test";
import assert from "node:assert/strict";
import { containsQuote, gateVerdict, overallOf } from "../src/core/quotes.ts";
import type { Ad, Verdict } from "../src/types.ts";

test("quote match respects number and word boundaries", () => {
  assert.equal(containsQuote("Total $124.00", "$24.00"), false);
  assert.equal(containsQuote("Total 124.00", "24.00"), false);
  assert.equal(containsQuote("Save $24.50 today", "$24"), false);
  assert.equal(containsQuote("SAVE20 applied: -$24.00", "SAVE20 applied: -$24.00"), true);
  assert.equal(containsQuote("This  code\nhas expired.", "this code has expired."), true);
  assert.equal(containsQuote("Get 10% off", "10% off"), true);
  assert.equal(containsQuote("Get 110% off", "10% off"), false);
  assert.equal(containsQuote("Use code “SAVE20” now", 'code "SAVE20"'), true);
  assert.equal(containsQuote("Discount  -$ 24.00\nTotal $ 96.00", "-$24.00"), true);
  assert.equal(containsQuote("Get 20 % off", "20% off"), true);
});

const ad: Ad = {
  source: "manual",
  headline: "20% off the Ridge trail shoe.",
  text: "This week only. Use code SAVE20 at checkout.",
  cta: "Shop now",
  destination: { type: "website", url: "http://localhost:3000/store" },
};

const v = (over: Partial<Verdict>): Verdict => ({
  assertionId: "a1",
  status: "contradicted",
  adQuote: "Use code SAVE20 at checkout.",
  pageQuote: "This code has expired.",
  evidenceStep: 2,
  reason: "Expired",
  quoteCheck: { adQuoteFound: false, pageQuoteFound: false },
  ...over,
});

test("quote gate keeps a verdict whose quotes exist", () => {
  const out = gateVerdict(v({}), ad, [{ step: 5, url: "/cart", text: "Discount code\nThis code has expired.\nTotal $120.00" }]);
  assert.equal(out.status, "contradicted");
  assert.equal(out.evidenceStep, 5);
});

test("quote gate downgrades an invented quote", () => {
  const out = gateVerdict(v({ pageQuote: "Code rejected" }), ad, [{ step: 2, url: "/cart", text: "Total $120.00" }]);
  assert.equal(out.status, "unresolved");
  assert.equal(out.downgraded, true);
});

test("overall verdict", () => {
  assert.equal(overallOf([v({ status: "supported" }), v({ status: "outside_scope" })]), "pass");
  assert.equal(overallOf([v({ status: "supported" }), v({ status: "contradicted" })]), "fail");
  assert.equal(overallOf([v({ status: "unresolved" })]), "unresolved");
});

test("a promise printed only in the ad image can be quoted", () => {
  const withImage: Ad = { ...ad, imageText: "ALDER TRAIL CO. 20% OFF Code SAVE20" };
  const out = gateVerdict(v({ adQuote: "20% OFF Code SAVE20" }), withImage, [{ step: 2, url: "/cart", text: "This code has expired." }]);
  assert.equal(out.status, "contradicted");
});

test("judge excerpt keeps offer lines from the bottom of a long page", async () => {
  const { excerpt } = await import("../src/core/judge.ts");
  const page = "Nav\n".repeat(3000) + "Discount code\nThis code has expired.\nTotal $120.00\n";
  const e = excerpt(page);
  assert.ok(e.length < 8000);
  assert.match(e, /This code has expired\./);
  assert.match(e, /Total \$120\.00/);
});
