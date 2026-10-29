import type { Ad, Verdict } from "@/lib/types";

export type Evidence = { step: number; url: string; text: string };

export function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function adText(ad: Ad): string {
  return `${ad.headline}\n${ad.text}\n${ad.cta}`;
}

// The quote gate: a verdict that claims evidence must point at text that really exists.
export function gateVerdict(v: Verdict, ad: Ad, evidence: Evidence[]): Verdict {
  const adQuoteFound = !!v.adQuote && norm(adText(ad)).includes(norm(v.adQuote));
  let pageQuoteFound = false;
  let evidenceStep = v.evidenceStep;
  if (v.pageQuote) {
    const q = norm(v.pageQuote);
    const own = evidence.find((e) => e.step === v.evidenceStep);
    if (own && norm(own.text).includes(q)) pageQuoteFound = true;
    else {
      const hit = evidence.find((e) => norm(e.text).includes(q));
      if (hit) {
        pageQuoteFound = true;
        evidenceStep = hit.step;
      }
    }
  }
  const out: Verdict = { ...v, evidenceStep, quoteCheck: { adQuoteFound, pageQuoteFound } };
  if ((v.status === "contradicted" || v.status === "supported") && !(adQuoteFound && pageQuoteFound)) {
    out.downgraded = true;
    out.reason = `${v.reason} (Downgraded from ${v.status}: ${!adQuoteFound ? "ad quote" : "page quote"} not found verbatim.)`;
    out.status = "unresolved";
  }
  return out;
}

export function overallOf(verdicts: Verdict[]): "pass" | "fail" | "unresolved" {
  if (verdicts.some((v) => v.status === "contradicted")) return "fail";
  if (verdicts.length && verdicts.every((v) => v.status === "supported" || v.status === "outside_scope") && verdicts.some((v) => v.status === "supported"))
    return "pass";
  return "unresolved";
}
