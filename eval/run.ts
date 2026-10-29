// Eval harness. Usage:
//   npx tsx eval/run.ts [--mode agent|one_call|both] [--only id1,id2] [--limit n] [--dry] [--resume]
// Runs cases one at a time (one store, shared state). Saves results after every case.
import fs from "node:fs";
import path from "node:path";
import type { NewRunInput, Run, ScenarioName } from "@/lib/types";
import { CASES, type EvalCase } from "./cases";

type Mode = "agent" | "one_call";
type Got = "pass" | "fail" | "unresolved";

type CaseRunResult = { got: Got; runId: string; usd: number; ms: number; error?: string };

type CaseResult = {
  id: string;
  scenario: ScenarioName;
  adHeadline: string;
  expected: "pass" | "fail";
  agent?: CaseRunResult;
  oneCall?: CaseRunResult;
};

export type Summary = {
  total: number;
  hits: number;
  misses: number; // expected fail, got pass or unresolved
  falseAlarms: number; // expected pass, got fail
  unresolved: number; // got unresolved (includes runs that errored)
  completed: number; // runs that finished without error
  usd: number;
  ms: number;
};

type Results = {
  ranAt: string;
  agent: Summary;
  oneCall?: Summary;
  cases: CaseResult[];
};

type ExecuteRun = (
  input: NewRunInput,
  opts?: { autoApprove?: { payment: boolean; fix: boolean } },
) => Promise<Run>;

const RESULTS_DIR = path.join(__dirname, "results");
const LATEST = path.join(RESULTS_DIR, "latest.json");

// ---------- CLI ----------

function parseArgs(argv: string[]) {
  const args = { modes: ["agent"] as Mode[], only: null as string[] | null, limit: null as number | null, dry: false, resume: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === "--mode") {
      const m = next();
      if (m === "both") args.modes = ["agent", "one_call"];
      else if (m === "agent" || m === "one_call") args.modes = [m];
      else throw new Error(`bad --mode ${m}`);
    } else if (a === "--only") args.only = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--limit") args.limit = Number(next());
    else if (a === "--dry") args.dry = true;
    else if (a === "--resume") args.resume = true;
    else throw new Error(`unknown arg ${a}`);
  }
  return args;
}

// ---------- Run backends ----------

// Variable specifiers keep tsc happy while the modules are still being written; tsx resolves "@/".
const STORE_MODULE = "@/lib/store";
const RUN_MODULE = "@/lib/agent/run";

async function loadStore(dry: boolean): Promise<{ setScenario: (s: ScenarioName) => unknown } | null> {
  try {
    const mod = await import(STORE_MODULE);
    if (typeof mod.setScenario !== "function") throw new Error("setScenario is not exported");
    // resetStore is imported for parity with the contract; the eval does not delete orders.
    void mod.resetStore;
    return { setScenario: mod.setScenario };
  } catch (e) {
    if (dry) {
      console.log(`[dry] store module not loaded (${(e as Error).message.split("\n")[0]}); skipping setScenario`);
      return null;
    }
    throw e;
  }
}

// If the Next server is up, confirm it sees the scenario. Its in-memory state may differ from ours.
async function syncServerScenario(landingUrl: string, scenario: ScenarioName) {
  const origin = new URL(landingUrl).origin;
  try {
    const res = await fetch(`${origin}/api/store/config`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const cfg = (await res.json()) as { scenario?: ScenarioName };
    if (cfg.scenario === scenario) return;
    console.log(`  server scenario is ${cfg.scenario}, posting ${scenario}`);
    await fetch(`${origin}/api/store/scenario`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Server not reachable: the run itself will surface that.
  }
}

function fakeExecuteRun(): ExecuteRun {
  let n = 0;
  return async (input) => {
    await new Promise((r) => setTimeout(r, 10));
    const created = new Date();
    const roll = Math.random();
    const overall: Run["overall"] = roll < 0.45 ? "pass" : roll < 0.9 ? "fail" : "unresolved";
    const errored = Math.random() < 0.05;
    const finished = new Date(created.getTime() + 20000 + Math.floor(Math.random() * 60000));
    return {
      id: `dry-${Date.now()}-${++n}`,
      createdAt: created.toISOString(),
      finishedAt: finished.toISOString(),
      mode: input.mode ?? "agent",
      status: errored ? "error" : "done",
      phase: "done",
      ad: input.ad,
      landingUrl: input.landingUrl,
      allowPayment: input.allowPayment,
      assertions: [],
      steps: [],
      approvals: [],
      verdicts: [],
      overall: errored ? undefined : overall,
      boundary: "Tested up to payment, not paid",
      usage: { inputTokens: 0, outputTokens: 0, images: 0, usd: Math.round(Math.random() * 40) / 100 },
      error: errored ? "dry-run simulated error" : undefined,
    };
  };
}

// ---------- Scoring ----------

function summarize(cases: CaseResult[], key: "agent" | "oneCall"): Summary {
  const s: Summary = { total: 0, hits: 0, misses: 0, falseAlarms: 0, unresolved: 0, completed: 0, usd: 0, ms: 0 };
  for (const c of cases) {
    const r = c[key];
    if (!r) continue;
    s.total++;
    if (!r.error) s.completed++;
    if (r.got === c.expected) s.hits++;
    if (c.expected === "fail" && r.got !== "fail") s.misses++;
    if (c.expected === "pass" && r.got === "fail") s.falseAlarms++;
    if (r.got === "unresolved") s.unresolved++;
    s.usd += r.usd;
    s.ms += r.ms;
  }
  s.usd = Math.round(s.usd * 10000) / 10000;
  return s;
}

function toResult(run: Run, wallMs: number): CaseRunResult {
  const errored = run.status === "error";
  const got: Got = !errored && (run.overall === "pass" || run.overall === "fail") ? run.overall : "unresolved";
  const ms = run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.createdAt) : wallMs;
  const out: CaseRunResult = { got, runId: run.id, usd: run.usage?.usd ?? 0, ms: Number.isFinite(ms) ? ms : wallMs };
  if (errored) out.error = run.error ?? "run status error";
  else if (run.status !== "done") out.error = `run ended in status ${run.status}`;
  return out;
}

// ---------- Output ----------

function save(results: Results, file: string) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const body = JSON.stringify(results, null, 2);
  for (const f of [file, LATEST]) {
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, f);
  }
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

function cell(r: CaseRunResult | undefined, expected: string) {
  if (!r) return "-";
  const mark = r.error ? "ERR" : r.got === expected ? "ok" : "XX";
  return `${r.got} ${mark}`;
}

function printTable(results: Results) {
  const hasOne = results.cases.some((c) => c.oneCall);
  const hasAgent = results.cases.some((c) => c.agent);
  const head = [pad("id", 32), pad("scenario", 22), pad("exp", 5)];
  if (hasAgent) head.push(pad("agent", 16));
  if (hasOne) head.push(pad("one_call", 16));
  console.log("\n" + head.join(" "));
  console.log("-".repeat(head.join(" ").length));
  for (const c of results.cases) {
    const row = [pad(c.id, 32), pad(c.scenario, 22), pad(c.expected, 5)];
    if (hasAgent) row.push(pad(cell(c.agent, c.expected), 16));
    if (hasOne) row.push(pad(cell(c.oneCall, c.expected), 16));
    console.log(row.join(" "));
  }
  const line = (name: string, s: Summary) =>
    console.log(
      `${pad(name, 9)} hits ${s.hits}/${s.total}  misses ${s.misses}  false alarms ${s.falseAlarms}  ` +
        `unresolved ${s.unresolved}  completed ${s.completed}/${s.total}  $${s.usd.toFixed(2)}  ${(s.ms / 1000).toFixed(0)}s`,
    );
  console.log("");
  if (hasAgent) line("agent", results.agent);
  if (results.oneCall) line("one_call", results.oneCall);
}

// ---------- Main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let selected: EvalCase[] = CASES;
  if (args.only) {
    const unknown = args.only.filter((id) => !CASES.some((c) => c.id === id));
    if (unknown.length) throw new Error(`unknown case ids: ${unknown.join(", ")}`);
    selected = CASES.filter((c) => args.only!.includes(c.id));
  }
  if (args.limit != null) selected = selected.slice(0, args.limit);

  // Prior results (for --resume): keyed by case id.
  const prior = new Map<string, CaseResult>();
  if (args.resume && fs.existsSync(LATEST)) {
    const old = JSON.parse(fs.readFileSync(LATEST, "utf8")) as Results;
    for (const c of old.cases) prior.set(c.id, c);
    console.log(`resume: loaded ${prior.size} cases from latest.json`);
  }

  const byId = new Map<string, CaseResult>();
  for (const c of CASES) {
    const p = prior.get(c.id);
    // Keep prior results only if the label still matches (labels are frozen, but guard anyway).
    if (p && p.expected === c.expected && p.scenario === c.scenario) byId.set(c.id, { ...p, adHeadline: c.ad.headline });
  }

  const store = await loadStore(args.dry);
  const executeRun: ExecuteRun = args.dry
    ? fakeExecuteRun()
    : ((await import(RUN_MODULE)) as { executeRun: ExecuteRun }).executeRun;
  if (typeof executeRun !== "function") throw new Error(`${RUN_MODULE} does not export executeRun`);

  const ranAt = new Date().toISOString();
  const file = path.join(RESULTS_DIR, `${ranAt.replace(/[:.]/g, "-")}${args.dry ? "-dry" : ""}.json`);

  const build = (): Results => {
    const cases = CASES.map((c) => byId.get(c.id)).filter((c): c is CaseResult => !!c);
    const out: Results = { ranAt, agent: summarize(cases, "agent"), cases };
    if (cases.some((c) => c.oneCall)) out.oneCall = summarize(cases, "oneCall");
    return out;
  };

  console.log(`eval: ${selected.length} cases, modes ${args.modes.join("+")}${args.dry ? " (dry)" : ""}`);
  let i = 0;
  for (const c of selected) {
    i++;
    const entry: CaseResult = byId.get(c.id) ?? {
      id: c.id,
      scenario: c.scenario,
      adHeadline: c.ad.headline,
      expected: c.expected,
    };
    byId.set(c.id, entry);

    for (const mode of args.modes) {
      const key = mode === "agent" ? "agent" : "oneCall";
      const done = entry[key];
      if (args.resume && done && !done.error) {
        console.log(`[${i}/${selected.length}] ${c.id} ${mode}: skip (resume, got ${done.got})`);
        continue;
      }

      const t0 = Date.now();
      try {
        if (store) {
          await store.setScenario(c.scenario);
          if (!args.dry) await syncServerScenario(c.landingUrl, c.scenario);
        }
        const input: NewRunInput = { ad: c.ad, landingUrl: c.landingUrl, allowPayment: false, mode };
        const run = await executeRun(input, { autoApprove: { payment: false, fix: false } });
        entry[key] = toResult(run, Date.now() - t0);
      } catch (e) {
        entry[key] = { got: "unresolved", runId: "", usd: 0, ms: Date.now() - t0, error: (e as Error).message };
      }
      const r = entry[key]!;
      console.log(
        `[${i}/${selected.length}] ${c.id} ${mode}: expected ${c.expected}, got ${r.got}` +
          `${r.error ? ` (error: ${r.error})` : ""}  $${r.usd.toFixed(2)} ${(r.ms / 1000).toFixed(0)}s`,
      );
      save(build(), file);
    }
  }

  // Leave the store in baseline without deleting orders.
  if (store) {
    try {
      await store.setScenario("baseline");
      if (!args.dry) await syncServerScenario(CASES[0].landingUrl, "baseline");
    } catch {
      // ignore
    }
  }

  const results = build();
  save(results, file);
  printTable(results);
  console.log(`\nwrote ${path.relative(process.cwd(), file)} and eval/results/latest.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
