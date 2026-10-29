// Scored eval on the demo store. Start it first: (cd examples/demo-store && npm run dev)
//   npx tsx eval/run.ts [--mode agent|baseline|both] [--only id1,id2] [--limit n] [--resume] [--store http://localhost:3000]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { runTest } from "../src/core/run.ts";
import type { RunResult } from "../src/types.ts";
import { CASES, type EvalCase } from "./cases.ts";

type Mode = "agent" | "baseline";
type Got = "pass" | "fail" | "unresolved";
type CaseRun = { got: Got; runId: string; usd: number; ms: number; error?: string };
type Summary = { total: number; hits: number; misses: number; falseAlarms: number; unresolved: number; completed: number; usd: number; ms: number; accuracy95: [number, number] };
type Results = {
  ranAt: string;
  agent?: Summary;
  baseline?: Summary;
  cases: { id: string; scenario: string; adHeadline: string; expected: "pass" | "fail"; agent?: CaseRun; baseline?: CaseRun }[];
};

const RESULTS_DIR = path.join(import.meta.dirname, "results");
const LATEST = path.join(RESULTS_DIR, "latest.json");

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "agent" },
    only: { type: "string" },
    limit: { type: "string" },
    resume: { type: "boolean" },
    store: { type: "string", default: "http://localhost:3000" },
  },
});
const modes: Mode[] = values.mode === "both" ? ["agent", "baseline"] : [values.mode as Mode];

async function setScenario(scenario: string) {
  const res = await fetch(`${values.store}/api/store/scenario`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) throw new Error(`demo store did not switch to ${scenario} (${res.status}). Is it running at ${values.store}?`);
}

// Wilson score interval: honest bounds for a small sample.
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function summarize(rows: Results["cases"], mode: Mode): Summary | undefined {
  const done = rows.filter((r) => r[mode]);
  if (!done.length) return undefined;
  const s: Summary = { total: done.length, hits: 0, misses: 0, falseAlarms: 0, unresolved: 0, completed: 0, usd: 0, ms: 0, accuracy95: [0, 0] };
  for (const r of done) {
    const x = r[mode]!;
    if (!x.error) s.completed++;
    if (x.got === r.expected) s.hits++;
    else if (r.expected === "fail") s.misses++;
    else if (x.got === "fail") s.falseAlarms++;
    if (x.got === "unresolved") s.unresolved++;
    s.usd += x.usd;
    s.ms += x.ms;
  }
  s.accuracy95 = wilson(s.hits, s.total);
  return s;
}

function save(results: Results) {
  results.agent = summarize(results.cases, "agent");
  results.baseline = summarize(results.cases, "baseline");
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(LATEST, JSON.stringify(results, null, 2));
}

async function runCase(c: EvalCase, mode: Mode): Promise<CaseRun> {
  await setScenario(c.scenario);
  const t0 = Date.now();
  let result: RunResult;
  try {
    ({ result } = await runTest(
      { source: "manual", ...c.ad, destination: { type: "website", url: c.landingUrl.replace("http://localhost:3000", values.store!) } },
      { outDir: path.join(RESULTS_DIR, "runs"), pay: false, baseline: mode === "baseline", maxTurns: 25 },
    ));
  } catch (err) {
    return { got: "unresolved", runId: "", usd: 0, ms: Date.now() - t0, error: String(err) };
  }
  return { got: result.overall ?? "unresolved", runId: result.id, usd: result.usage.usd, ms: Date.now() - t0, ...(result.error ? { error: result.error } : {}) };
}

async function main() {
  const only = values.only?.split(",");
  let selected = CASES.filter((c) => !only || only.includes(c.id));
  if (values.limit) selected = selected.slice(0, Number(values.limit));
  const prev: Results | null = values.resume && fs.existsSync(LATEST) ? JSON.parse(fs.readFileSync(LATEST, "utf8")) : null;
  const results: Results = { ranAt: new Date().toISOString(), cases: prev?.cases ?? [] };

  console.log(`eval: ${selected.length} cases, ${modes.join(" + ")}`);
  for (const [i, c] of selected.entries()) {
    let row = results.cases.find((r) => r.id === c.id);
    if (!row) {
      row = { id: c.id, scenario: c.scenario, adHeadline: c.ad.headline, expected: c.expected };
      results.cases.push(row);
    }
    for (const mode of modes) {
      if (row[mode]) continue; // --resume
      const x = await runCase(c, mode);
      row[mode] = x;
      save(results);
      const mark = x.got === c.expected ? "✓" : "✗";
      console.log(`[${i + 1}/${selected.length}] ${mark} ${c.id} ${mode}: expected ${c.expected}, got ${x.got}  $${x.usd.toFixed(2)} ${(x.ms / 1000).toFixed(0)}s${x.error ? `  (${x.error.slice(0, 80)})` : ""}`);
    }
  }
  await setScenario("baseline").catch(() => {});
  save(results);
  for (const mode of modes) {
    const s = results[mode];
    if (!s) continue;
    const [lo, hi] = s.accuracy95;
    console.log(
      `\n${mode}: ${s.hits}/${s.total} correct (95% CI ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%), ${s.misses} missed failures, ${s.falseAlarms} false alarms, ${s.unresolved} unresolved, $${s.usd.toFixed(2)}, ${(s.ms / 60000).toFixed(1)} min`,
    );
  }
  console.log(`\nSaved ${LATEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
