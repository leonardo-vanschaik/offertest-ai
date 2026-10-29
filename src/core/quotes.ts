import type { Ad, Overall, Verdict } from "../types.ts";

export type Evidence = { step: number; url: string; text: string };

export function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function adText(ad: Ad): string {
  const cards = (ad.cards ?? []).map((c) => `${c.headline}\n${c.text ?? ""}`).join("\n");
  return [ad.headline, ad.text, ad.description ?? "", ad.cta, cards].join("\n");
}

// Whole-token match: "24.00" must not match inside "124.00", and "$24" not inside "$24.50".
export function containsQuote(haystack: string, quote: string): boolean {
  const h = norm(haystack);
  const q = norm(quote);
  if (q.length < 2) return false;
  const alnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
  for (let i = h.indexOf(q); i >= 0; i = h.indexOf(q, i + 1)) {
    const before = h[i - 1];
    const after = h[i + q.length];
    const afterNext = h[i + q.length + 1];
    if (alnum(q[0]) && alnum(before)) continue;
    if (alnum(q[q.length - 1]) && alnum(after)) continue;
    if (/\d/.test(q[q.length - 1]) && (after === "." || after === ",") && /\d/.test(afterNext ?? "")) continue;
    return true;
  }
  return false;
}

// The quote gate: a verdict that claims evidence must point at text that really exists.
export function gateVerdict(v: Verdict, ad: Ad, evidence: Evidence[]): Verdict {
  const adQuoteFound = !!v.adQuote && containsQuote(adText(ad), v.adQuote);
  let pageQuoteFound = false;
  let evidenceStep = v.evidenceStep;
  if (v.pageQuote) {
    const own = evidence.find((e) => e.step === v.evidenceStep);
    if (own && containsQuote(own.text, v.pageQuote)) pageQuoteFound = true;
    else {
      const hit = evidence.find((e) => containsQuote(e.text, v.pageQuote!));
      if (hit) {
        pageQuoteFound = true;
        evidenceStep = hit.step;
      }
    }
  }
  const out: Verdict = { ...v, evidenceStep, quoteCheck: { adQuoteFound, pageQuoteFound } };
  if ((v.status === "contradicted" || v.status === "supported") && !(adQuoteFound && pageQuoteFound)) {
    out.downgraded = true;
    out.reason = `${v.reason} (Downgraded from ${v.status}: the ${!adQuoteFound ? "ad" : "page"} quote was not found word for word.)`;
    out.status = "unresolved";
  }
  return out;
}

export function overallOf(verdicts: Verdict[]): Overall {
  if (verdicts.some((v) => v.status === "contradicted")) return "fail";
  if (verdicts.some((v) => v.status === "supported") && verdicts.every((v) => v.status === "supported" || v.status === "outside_scope"))
    return "pass";
  return "unresolved";
}
