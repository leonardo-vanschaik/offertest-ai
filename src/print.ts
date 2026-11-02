// Terminal output shared by `offertest check` and `offertest demo`.
import type { Ad, RunResult } from "./types.ts";

export const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
};

export function dest(ad: Ad): string {
  const d = ad.destination;
  return d.type === "website" || d.type === "app" ? d.url : d.type === "lead_form" ? `Instant Form ${d.formId}` : d.type === "messaging" ? `${d.channel} chat` : d.type;
}

export function printResult(r: RunResult, report: string) {
  const badge = r.error ? c.red("ERROR") : r.overall === "pass" ? c.green("PASS") : r.overall === "fail" ? c.red("FAIL") : c.yellow("UNRESOLVED");
  console.log(`\n${c.bold(badge)}  ${r.boundary}  ${c.dim(`$${r.usage.usd.toFixed(2)}`)}`);
  if (r.error) console.log(c.red(`  ${r.error}`));
  const o = r.openWeights;
  if (o && !o.fallback) console.log(c.dim(`  Promises read by Muse Spark Open (open weights) on ${o.provider}, ${o.quantization}`));
  for (const v of r.verdicts) {
    const a = r.assertions.find((x) => x.id === v.assertionId);
    const mark = v.status === "supported" ? c.green("✓") : v.status === "contradicted" ? c.red("✗") : c.yellow("?");
    console.log(`  ${mark} ${a?.claim ?? v.assertionId}`);
    console.log(c.dim(`      ad: "${v.adQuote}"${v.pageQuote ? `   funnel: "${v.pageQuote.replace(/\s+/g, " ")}"` : ""}`));
  }
  if (r.fix) console.log(`\n  ${c.bold("Fix:")} ${r.fix.summary}${r.fix.steps.map((s) => `\n    - ${s}`).join("")}`);
  console.log(`\n  Report: ${report}`);
}
