// Checks the scored run (eval/results/latest.json) against the run folders it points to. No key, no store.
// For each case: the label is the frozen label in cases.ts, both run folders are there, each run's own
// result.json gives the scored verdict, the quote check passes again on the saved pages, every model is Meta's,
// and the promise step ran on Muse Spark Open with its provider, quantization and request ids recorded.
//   npx tsx eval/verify.ts
import fs from "node:fs";
import path from "node:path";
import { recheck } from "../src/demo.ts";
import type { RunResult } from "../src/types.ts";
import { CASES } from "./cases.ts";

type Run = { got: string; runId: string };
type Results = { ranAt: string; cases: { id: string; expected: "pass" | "fail"; agent: Run; baseline: Run }[] };

const RESULTS = path.join(import.meta.dirname, "results");
const latest = JSON.parse(fs.readFileSync(path.join(RESULTS, "latest.json"), "utf8")) as Results;
const META = new Set(["muse-wonder-1.0", "meta/muse-spark-open", "muse-spark-1.3", "sam-3.1"]);
const PARTNERS = new Set(["BaseTen", "Fireworks", "Modal"]); // OpenRouter's names for the hackathon's inference partners

const problems: string[] = [];
const providers = new Map<string, number>();
const tally = { agent: { hits: 0, caught: 0, falseAlarms: 0 }, baseline: { hits: 0, caught: 0, falseAlarms: 0 } };
for (const c of latest.cases) {
  const label = CASES.find((x) => x.id === c.id)?.expected;
  if (label !== c.expected) problems.push(`${c.id}: scored as "${c.expected}", but its label in cases.ts is "${label}"`);
  for (const mode of ["agent", "baseline"] as const) {
    const run = c[mode];
    const dir = path.join(RESULTS, "runs", run.runId);
    if (!fs.existsSync(path.join(dir, "result.json"))) {
      problems.push(`${c.id} ${mode}: no run folder ${run.runId}`);
      continue;
    }
    const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8")) as RunResult;
    const got = r.overall ?? "unresolved";
    if (got !== run.got) problems.push(`${c.id} ${mode}: scored "${run.got}", but run ${run.runId} says "${got}"`);
    try {
      recheck(dir, r);
    } catch (err) {
      problems.push(`${c.id} ${mode}: ${(err as Error).message}`);
    }
    for (const [job, model] of Object.entries(r.models)) if (!META.has(model)) problems.push(`${c.id} ${mode}: ${job} used ${model}, not a Meta model`);
    const ow = r.openWeights;
    if (ow?.model !== "meta/muse-spark-open" || !PARTNERS.has(ow.provider) || !ow.quantization || !ow.requests.length || ow.requests.some((q) => !q.id))
      problems.push(`${c.id} ${mode}: the promise step has no full open-weights record`);
    else providers.set(`${ow.provider} at ${ow.quantization}`, (providers.get(`${ow.provider} at ${ow.quantization}`) ?? 0) + 1);
    if (got === c.expected) tally[mode].hits++;
    if (c.expected === "fail" && got === "fail") tally[mode].caught++;
    if (c.expected === "pass" && got === "fail") tally[mode].falseAlarms++;
  }
}

const broken = latest.cases.filter((c) => c.expected === "fail").length;
console.log(`Scored run of ${latest.ranAt}, ${latest.cases.length} cases (${broken} with a broken offer):`);
for (const [mode, t] of Object.entries(tally))
  console.log(`  ${mode === "agent" ? "OfferTest" : "Landing-page check"}: ${t.hits} of ${latest.cases.length} right, ${t.caught} of ${broken} broken offers caught, ${t.falseAlarms} false alarms`);
console.log(`  Promise step: Muse Spark Open on ${[...providers].map(([p, n]) => `${p} (${n} runs)`).join(", ")}`);
if (problems.length) {
  console.error(`\n${problems.length} problems:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("Every scored verdict matches its run folder.");
