// Gate A: one live run against the local store. Usage: npx tsx scripts/smoke.ts [scenario] [--pay] [--fix]
import { setScenario } from "@/lib/store";
import { executeRun } from "@/lib/agent/run";
import type { ScenarioName } from "@/lib/types";

const args = process.argv.slice(2);
const scenario = (args.find((a) => !a.startsWith("--")) ?? "code_expired") as ScenarioName;
const pay = args.includes("--pay");
const fix = args.includes("--fix");

async function main() {
  setScenario(scenario);
  const run = await executeRun(
    {
      ad: {
        headline: "20% off the Ridge trail shoe.",
        text: "This week only. Use code SAVE20 at checkout.",
        cta: "Shop now",
        runsUntil: "2026-11-09T23:59:00-05:00",
      },
      landingUrl: process.env.LANDING_URL ?? "http://localhost:3000/store/products/ridge-trail-shoe",
      allowPayment: pay,
    },
    { autoApprove: { payment: pay, fix, safety: true } },
  );
  console.log(JSON.stringify({ id: run.id, status: run.status, overall: run.overall, error: run.error, boundary: run.boundary, usd: run.usage.usd.toFixed(3), steps: run.steps.map((s) => s.summary), verdicts: run.verdicts, fix: run.fix, order: run.order }, null, 2));
}
main();
