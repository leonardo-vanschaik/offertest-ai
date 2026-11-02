// Scoring for eval/promises.ts: is a labeled promise among the promises a model wrote?
import { norm } from "../src/core/quotes.ts";
import type { Assertion } from "../src/types.ts";

// A labeled promise: the kinds that fit it, the facts it must state, and, with `negated`, that it states them
// as absent ("no credit card required", not "credit card required").
export type Expected = { kinds: string[]; terms: string[]; negated?: boolean };

// What the promise itself states: the claim and the conditions ("credit_card_required: no" reads as
// "credit card required no"). The ad quote is left out: copying the ad's words is not stating the fact.
export function stated(a: Assertion): string {
  return norm([a.claim, ...Object.entries(a.conditions).flat()].join(" ").replace(/_/g, " "));
}

// Whole words and numbers: "20" is not in "save20", and "10" is not in "$105".
export function has(text: string, term: string): boolean {
  const t = norm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${t}([^\\p{L}\\p{N}]|$)`, "u").test(text);
}

const NEGATION = /(^|[^\p{L}])(no|not|without|none|never|false)([^\p{L}]|$)|n't/u;

export function found(e: Expected, as: Assertion[]): boolean {
  return as.some((a) => {
    if (!e.kinds.includes(a.kind)) return false;
    const text = stated(a);
    return e.terms.every((t) => has(text, t)) && (!e.negated || NEGATION.test(text));
  });
}
