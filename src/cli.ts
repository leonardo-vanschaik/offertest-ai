#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { runTest, VERSION } from "./core/run.ts";
import { CONFIG_DIR, CONFIG_ENV, loadEnv } from "./meta/client.ts";
import { getAd, listAds, pauseAd } from "./meta/ads.ts";
import { writeReport } from "./report/html.ts";
import { serve } from "./server.ts";
import type { Ad, Overall, RunOptions, RunResult } from "./types.ts";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
};

const EXIT: Record<Overall | "error" | "usage", number> = { pass: 0, fail: 1, unresolved: 2, error: 3, usage: 4 };

const HELP = `${c.bold("offertest")} ${VERSION}: an AI agent follows your Meta ad's funnel like a customer and checks the offer holds.

${c.bold("Usage")}
  offertest check --ad <ad id>                 test one ad from Meta Ads Manager
  offertest check --account <act_123>          test every ad about to launch (paused / in review)
  offertest check --url <landing url> --headline "..." --text "..." [--image ad.png]
  offertest ads [--account <act_123>] [--live] list ads and where they send people
  offertest serve [--port 7777]                local server for the Ads Manager Chrome extension
  offertest init                               save your Meta keys to ~/.offertest/.env
  offertest install-browser                    download Chromium if you have no Chrome

${c.bold("Check options")}
  --cta <text>          ad button text (default "Shop now")
  --live                with --account: test live (ACTIVE) ads instead of ads about to launch
  --pay                 allow a test-mode payment (asks before paying; test stores only)
  --no-submit           do not submit forms (sign-up, lead, booking)
  --pause-failing       pause a failing ad in Ads Manager (asks first)
  --mobile              phone viewport and Facebook in-app browser user agent
  --headful             show the browser
  --max-turns <n>       agent turns per funnel (default 25)
  --max-usd <n>         stop a run above this model cost
  --out <dir>           run folders go here (default ./offertest-runs)
  --json                print result.json paths and verdicts as JSON
  --yes                 answer yes to approval prompts (payment, safety checks, pause)

${c.bold("Exit codes")}  0 pass · 1 fail · 2 unresolved or blocked · 3 error · 4 usage
${c.bold("Env")}  META_API_KEY (Meta Model API) · META_ACCESS_TOKEN (Marketing API, ads_read) · META_AD_ACCOUNT_ID`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      ad: { type: "string", multiple: true },
      account: { type: "string" },
      live: { type: "boolean" },
      url: { type: "string" },
      headline: { type: "string" },
      text: { type: "string", default: "" },
      cta: { type: "string", default: "Shop now" },
      image: { type: "string" },
      pay: { type: "boolean" },
      "no-submit": { type: "boolean" },
      "pause-failing": { type: "boolean" },
      mobile: { type: "boolean" },
      headful: { type: "boolean" },
      "max-turns": { type: "string" },
      "max-usd": { type: "string" },
      out: { type: "string", default: "offertest-runs" },
      json: { type: "boolean" },
      yes: { type: "boolean" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || values.help) return void console.log(HELP);
  if (cmd === "--version" || cmd === "version") return void console.log(VERSION);
  if (cmd === "init") return await init();
  if (cmd === "install-browser") return installBrowser();
  if (cmd === "ads") return await ads(values.account, values.live);
  if (cmd === "serve") return await serve(values.port ? Number(values.port) : undefined);
  if (cmd !== "check") {
    console.error(`Unknown command "${cmd}".\n\n${HELP}`);
    process.exit(EXIT.usage);
  }

  loadEnv();
  if (!process.env.META_API_KEY) {
    console.error(c.red("META_API_KEY is not set. Run `offertest init`, or add it to .env (get a key at https://dev.meta.ai)."));
    process.exit(EXIT.error);
  }
  const tty = process.stdin.isTTY && !values.json;
  const ask = async (q: string): Promise<boolean> => {
    if (values.yes) return true;
    if (!tty) return false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question(`${c.yellow("?")} ${q} ${c.dim("[y/N]")} `);
    rl.close();
    return /^y(es)?$/i.test(a.trim());
  };

  let targets: Ad[];
  if (values.ad?.length) targets = await Promise.all(values.ad.map(getAd));
  else if (values.account || (!values.url && process.env.META_AD_ACCOUNT_ID))
    targets = await listAds(values.account, values.live ? ["ACTIVE"] : undefined);
  else if (values.url && values.headline)
    targets = [{ source: "manual", headline: values.headline, text: values.text ?? "", cta: values.cta ?? "Shop now", imageUrl: values.image, destination: { type: "website", url: values.url } }];
  else {
    console.error(`Give --ad <id>, --account <act_id>, or --url with --headline.\n\n${HELP}`);
    process.exit(EXIT.usage);
  }
  if (!targets.length) {
    console.log("No ads matched.");
    return;
  }

  const opts: RunOptions = {
    outDir: values.out!,
    pay: values.pay,
    submit: !values["no-submit"],
    headful: values.headful,
    mobile: values.mobile,
    maxTurns: values["max-turns"] ? Number(values["max-turns"]) : undefined,
    maxUsd: values["max-usd"] ? Number(values["max-usd"]) : undefined,
    approve: async (req) => ask(`${req.title} ${c.dim(req.detail)}`),
    onPhase: (p) => !values.json && console.log(c.blue("●"), p),
    onStep: (s) => !values.json && console.log(c.dim(`  ${String(s.n).padStart(2)} ${s.summary}`)),
  };

  const results: { result: RunResult; report: string }[] = [];
  for (const ad of targets) {
    let current = ad;
    let retestOf: string | undefined;
    for (;;) {
      if (!values.json) console.log(`\n${c.bold("OfferTest")} ${current.source === "meta" ? `ad ${current.id} ` : ""}"${current.headline}" -> ${dest(current)}`);
      const { result, dir } = await runTest(current, { ...opts, retestOf });
      const report = writeReport(result, dir);
      results.push({ result, report });
      if (!values.json) printResult(result, report);

      if (result.overall === "fail" && current.source === "meta" && values["pause-failing"] && current.status === "ACTIVE") {
        if (await ask(`Pause ad ${current.id} in Ads Manager until the offer is fixed?`)) {
          await pauseAd(current.id!);
          console.log(c.yellow(`  Paused ad ${current.id}.`));
        }
      }
      if (result.overall !== "fail" || !tty || values.yes) break;
      if (!(await ask("Apply the fix, then re-test in a fresh session?"))) break;
      retestOf = result.id;
      if (result.fix?.adCopy && (await ask("Re-test with the proposed ad copy?"))) current = { ...current, ...result.fix.adCopy };
    }
  }

  if (values.json)
    console.log(
      JSON.stringify(
        results.map(({ result, report }) => ({ id: result.id, ad: result.ad.id ?? result.ad.headline, overall: result.overall ?? "error", boundary: result.boundary, report, verdicts: result.verdicts, fix: result.fix, error: result.error })),
        null,
        2,
      ),
    );
  const worst = Math.max(...results.map(({ result }) => (result.error ? EXIT.error : EXIT[result.overall ?? "unresolved"])));
  process.exit(worst);
}

function dest(ad: Ad): string {
  const d = ad.destination;
  return d.type === "website" || d.type === "app" ? d.url : d.type === "lead_form" ? `Instant Form ${d.formId}` : d.type === "messaging" ? `${d.channel} chat` : d.type;
}

function printResult(r: RunResult, report: string) {
  const badge = r.error ? c.red("ERROR") : r.overall === "pass" ? c.green("PASS") : r.overall === "fail" ? c.red("FAIL") : c.yellow("UNRESOLVED");
  console.log(`\n${c.bold(badge)}  ${r.boundary}  ${c.dim(`$${r.usage.usd.toFixed(2)}`)}`);
  if (r.error) console.log(c.red(`  ${r.error}`));
  for (const v of r.verdicts) {
    const a = r.assertions.find((x) => x.id === v.assertionId);
    const mark = v.status === "supported" ? c.green("✓") : v.status === "contradicted" ? c.red("✗") : c.yellow("?");
    console.log(`  ${mark} ${a?.claim ?? v.assertionId}`);
    console.log(c.dim(`      ad: "${v.adQuote}"${v.pageQuote ? `   funnel: "${v.pageQuote}"` : ""}`));
  }
  if (r.fix) console.log(`\n  ${c.bold("Fix:")} ${r.fix.summary}${r.fix.steps.map((s) => `\n    - ${s}`).join("")}`);
  console.log(`\n  Report: ${report}`);
}

async function ads(account?: string, live?: boolean) {
  const list = await listAds(account, live ? ["ACTIVE"] : undefined);
  if (!list.length) return void console.log("No ads matched.");
  for (const a of list) console.log(`${a.id}  ${c.dim((a.status ?? "").padEnd(14))} ${a.headline.slice(0, 50).padEnd(50)}  -> ${dest(a)}`);
}

async function init() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Saves keys to ${CONFIG_ENV}. Press Enter to skip one.\n`);
  const key = await rl.question("Meta Model API key (dev.meta.ai): ");
  const token = await rl.question("Meta access token with ads_read (optional, for Ads Manager): ");
  const account = await rl.question("Default ad account id, e.g. act_123 (optional): ");
  rl.close();
  const lines = [key && `META_API_KEY=${key.trim()}`, token && `META_ACCESS_TOKEN=${token.trim()}`, account && `META_AD_ACCOUNT_ID=${account.trim()}`].filter(Boolean);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_ENV, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(c.green(`\nSaved ${lines.length} value(s). Try: offertest ads`));
}

function installBrowser() {
  const cli = createRequire(import.meta.url).resolve("playwright-core/cli.js");
  const r = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

main().catch((err) => {
  console.error(c.red(err instanceof Error ? err.message : String(err)));
  process.exit(EXIT.error);
});
