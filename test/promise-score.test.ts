import { test } from "node:test";
import assert from "node:assert/strict";
import { found, type Expected } from "../eval/score.ts";
import type { Assertion } from "../src/types.ts";

const a = (kind: string, claim: string, conditions: Record<string, string> = {}, adQuote = ""): Assertion => ({ id: "a1", kind, claim, adQuote, conditions });

const TRIAL: Expected = { kinds: ["free_trial"], terms: ["30"] };
const NO_CARD: Expected = { kinds: ["free_trial", "other"], terms: ["credit card"], negated: true };
const TRAIL10: Expected = { kinds: ["discount"], terms: ["trail10", "10"] };

test("the right promise is found, in the claim or in its conditions", () => {
  assert.ok(found(TRIAL, [a("free_trial", "Trail Club is free for 30 days")]));
  assert.ok(found(NO_CARD, [a("free_trial", "No credit card is needed to start the trial")]));
  assert.ok(found(NO_CARD, [a("free_trial", "The trial starts without payment details", { credit_card_required: "no" })]));
  assert.ok(found(TRAIL10, [a("discount", "Code TRAIL10 gives $10 off the Summit rain jacket")]));
});

test("a wrong duration is not found, even when the ad quote has the right one", () => {
  assert.ok(!found(TRIAL, [a("free_trial", "Trail Club is free for 14 days", { days: "14" }, "Try Trail Club free for 30 days.")]));
});

test("a required credit card does not count as no credit card", () => {
  assert.ok(!found(NO_CARD, [a("free_trial", "A credit card is required for the trial", { credit_card_required: "true" }, "No credit card required.")]));
});

test("a wrong amount is not found: the code's own digits do not count", () => {
  assert.ok(!found(TRAIL10, [a("discount", "Code TRAIL10 gives $15 off the Summit rain jacket")]));
  assert.ok(!found(TRAIL10, [a("discount", "Code TRAIL10 gives $105 off")]));
});

test("the right facts under the wrong kind are not found", () => {
  assert.ok(!found(TRIAL, [a("price", "Trail Club is free for 30 days")]));
});
