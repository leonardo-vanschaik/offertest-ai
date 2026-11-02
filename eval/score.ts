// Scoring for eval/promises.ts: is a labeled promise among the promises a model wrote?
import { norm } from "../src/core/quotes.ts";
import type { Assertion } from "../src/types.ts";

// A labeled promise: the kinds that fit it and the facts it must state. With `negated`, the first term must be
// stated as absent ("no credit card required"); without it, no fact may be stated as untrue ("does not give 20%").
export type Expected = { kinds: string[]; terms: string[]; negated?: boolean };

// What a promise states, clause by clause: the claim, and each condition as "key value". The ad quote is left
// out (copying the ad's words is not stating the fact), and a condition with no value states nothing.
export function clauses(a: Assertion): string[] {
  const parts = [a.claim, ...Object.entries(a.conditions).flatMap(([k, v]) => (v.trim() ? [`${k} ${v}`] : []))];
  return parts.flatMap((p) => norm(p.replace(/_/g, " ")).split(/[.;]|\sbut\s/)).map((c) => c.trim()).filter(Boolean);
}

const esc = (t: string) => norm(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole words and numbers: "20" is not in "save20", and "10" is not in "$105".
export function has(text: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(term)}([^\\p{L}\\p{N}]|$)`, "u").test(text);
}

const NOT = /(^|[^\p{L}])(not|never)([^\p{L}]|$)|n't/u;

// The term itself is negated: "no credit card", "without a credit card", "credit card is not required",
// "credit card required: no".
function negatedTerm(clause: string, term: string): boolean {
  const t = esc(term);
  return new RegExp(`(^|[^\\p{L}])(no|without|not|never)(\\s+(a|an|any))?\\s+${t}|${t}[^.;,]{0,25}?([^\\p{L}]|^)(not|n't|no|none|false)([^\\p{L}]|$)`, "u").test(clause);
}

export function found(e: Expected, as: Assertion[]): boolean {
  return as.some((a) => {
    if (!e.kinds.includes(a.kind)) return false;
    const cs = clauses(a);
    const [first, ...rest] = e.terms;
    if (e.negated) return cs.some((c) => negatedTerm(c, first)) && rest.every((t) => cs.some((c) => has(c, t)));
    // Each fact is stated somewhere, and no clause that states one says it is untrue.
    return e.terms.every((t) => cs.some((c) => has(c, t))) && !cs.some((c) => e.terms.some((t) => has(c, t)) && NOT.test(c));
  });
}
