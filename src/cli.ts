#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { runTest, VERSION } from "./core/run.ts";
import { loadEnv } from "./meta/client.ts";
import { getAd, listAdIds, pauseAd } from "./meta/ads.ts";
import { writeReport } from "./report/html.ts";
import { serve } from "./server.ts";
import { doctor, init } from "./onboarding.ts";
import { acpCheckout, itemFromUrl } from "./core/acp.ts";
import { agentCheckout } from "./core/ucp.ts";
import { demo } from "./demo.ts";
import { c, dest, printResult } from "./print.ts";
import type { Ad, Overall, RunOptions, RunResult } from "./types.ts";

const EXIT: Record<Overall | "error" | "usage", number> = { pass: 0, fail: 1, unresolved: 2, error: 3, usage: 4 };

const HELP = `${c.bold("offertest")} ${VERSION}: an AI agent follows your Meta ad's funnel like a customer and checks the offer holds.

${c.bold("Usage")}
  offertest demo [--fast] [--no-open]          replay real recorded runs: no key, no cost (start here)
  offertest check --ad <ad id>                 test one ad from Meta Ads Manager
  offertest check --account <act_123>          test every ad about to launch (paused / in review)
  offertest check --url <landing url> --headline "..." --text "..." [--image ad.png]
  offertest agent-checkout --url <product url> [--code SAVE20]
                                               test a code in the store's AI-agent checkout (no keys, free)
  offertest acp --acp-url <endpoint> --item <id> [--code SAVE20]
                                               buy through your store's ACP agent checkout in test mode
  offertest ads [--account <act_123>] [--live] list ads and where they send people
  offertest serve [--port 7777]                local server for the Ads Manager Chrome extension
  offertest init                               guided setup: Meta API key, Ads Manager, browser, agent skill
  offertest doctor                             check the setup and print the fix for anything wrong
  offertest install-browser                    download Chromium if you have no Chrome

${c.bold("Check options")}
  --cta <text>          ad button text (default "Shop now")
  --live                with --account: test live (ACTIVE) ads instead of ads about to launch
  --pay                 allow a test-mode payment (asks before paying; test stores only)
  --no-submit           do not submit forms (sign-up, lead, booking)
  --no-agent-checkout   skip the agent checkout (UCP) check of the offer
  --acp-url <url>       also test your store's ACP checkout; with --pay it buys in test mode after you approve
                        (key in --acp-key or OFFERTEST_ACP_KEY)
  --no-buy              with acp or --acp-url: never finish the ACP purchase
  --item <id>           ACP item id (default: the last part of the landing page path)
  --pause-failing       pause a failing ad in Ads Manager (asks first)
  --mobile              phone viewport and Facebook in-app browser user agent
  --headless            hide the browser (default when not in a terminal)
  --headful             show the browser even when not in a terminal
  --limit <n>           with --account: test at most n ads (default 5)
  --max-turns <n>       agent turns per funnel (default 25)
  --max-usd <n>         stop a run above this model cost
  --out <dir>           run folders go here (default ./offertest-runs)
  --retest-of <run id>  mark this run as the re-test of an earlier run (after a fix)
  --json                print result.json paths and verdicts as JSON
  --yes                 answer yes to approval prompts (payment, pause)

${c.bold("Exit codes")}  0 pass · 1 fail · 2 unresolved or blocked · 3 error · 4 usage
${c.bold("Env")}  META_API_KEY (Meta Model API) · META_ACCESS_TOKEN (Marketing API, ads_read) · META_AD_ACCOUNT_ID
     OFFERTEST_ACP_URL · OFFERTEST_ACP_KEY (your store's ACP checkout) · STRIPE_TEST_KEY (sk_test_, for ACP test payments)`;

async function agentCheckoutCmd(url: string | undefined, codes: string[]) {
  if (!url) {
    console.error(`Give --url <product page>.\n\n${HELP}`);
    process.exit(EXIT.usage);
  }
  codes = codes.map((x) => x.toUpperCase());
  const r = await agentCheckout(url, codes, new URL(url).pathname.split("/").pop()?.replace(/[-_]/g, " ") ?? "");
  if ("skipped" in r) {
    console.log(c.yellow(r.skipped));
    process.exit(EXIT.unresolved);
  }
  console.log(r.text);
  if (!codes.length) process.exit(EXIT.pass);
  if (/no discount result/.test(r.text)) {
    console.log(c.yellow("\nThe store did not say whether the code works for agents."));
    process.exit(EXIT.unresolved);
  }
  const failed = codes.filter((code) => !r.text.includes(`Discount applied: ${code}`));
  console.log(failed.length ? c.red(`\nDoes not work in agent checkout: ${failed.join(", ")}`) : c.green("\nThe code works in agent checkout."));
  process.exit(failed.length ? EXIT.fail : EXIT.pass);
}

function acpOptions(v: { "acp-url"?: string; "acp-key"?: string; item?: string; "no-buy"?: boolean }) {
  const endpoint = v["acp-url"] ?? process.env.OFFERTEST_ACP_URL;
  if (!endpoint) return undefined;
  const key = v["acp-key"] ?? process.env.OFFERTEST_ACP_KEY;
  if (!key) {
    console.error(`Give your store's ACP API key: --acp-key <key> or OFFERTEST_ACP_KEY.`);
    process.exit(EXIT.usage);
  }
  return { endpoint, key, item: v.item, stripeTestKey: process.env.STRIPE_TEST_KEY, buy: !v["no-buy"] };
}

async function acpCmd(v: { "acp-url"?: string; "acp-key"?: string; item?: string; url?: string; "no-buy"?: boolean }, codes: string[]) {
  loadEnv();
  const o = acpOptions(v);
  const item = v.item ?? (v.url ? itemFromUrl(v.url) : undefined);
  if (!o || !item) {
    console.error(`Give --acp-url <your store's ACP endpoint> and --item <id> (or --url <product page>).\n\n${HELP}`);
    process.exit(EXIT.usage);
  }
  codes = codes.map((x) => x.toUpperCase());
  const r = await acpCheckout({ ...o, item, codes, buy: !v["no-buy"] });
  if ("skipped" in r) {
    console.log(c.yellow(r.skipped));
    process.exit(EXIT.unresolved);
  }
  console.log(r.text);
  const failed = codes.filter((code) => !r.text.includes(`Discount applied: ${code}`));
  if (failed.length) console.log(c.red(`\nDoes not work in ACP checkout: ${failed.join(", ")}`));
  else if (codes.length) console.log(c.green("\nThe code works in ACP checkout."));
  const bought = /Test purchase: completed/.test(r.text);
  if (!v["no-buy"]) console.log(bought ? c.green("The test purchase went through.") : c.yellow(r.text.split("\n").pop()!));
  process.exit(failed.length ? EXIT.fail : bought || v["no-buy"] ? EXIT.pass : EXIT.unresolved);
}

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
      "no-agent-checkout": { type: "boolean" },
      code: { type: "string", multiple: true },
      "acp-url": { type: "string" },
      "acp-key": { type: "string" },
      item: { type: "string" },
      "no-buy": { type: "boolean" },
      "pause-failing": { type: "boolean" },
      mobile: { type: "boolean" },
      headful: { type: "boolean" },
      headless: { type: "boolean" },
      limit: { type: "string" },
      "max-turns": { type: "string" },
      "max-usd": { type: "string" },
      out: { type: "string", default: "offertest-runs" },
      json: { type: "boolean" },
      yes: { type: "boolean" },
      "retest-of": { type: "string" },
      fast: { type: "boolean" },
      "no-open": { type: "boolean" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || values.help) return void console.log(HELP);
  if (cmd === "--version" || cmd === "version") return void console.log(VERSION);
  if (cmd === "demo") process.exit(await demo({ out: values.out!, json: values.json, fast: values.fast, open: !values["no-open"] }));
  if (cmd === "init" || cmd === "setup") return await init();
  if (cmd === "doctor") process.exit(await doctor());
  if (cmd === "install-browser") return installBrowser();
  if (cmd === "ads") return await ads(values.account, values.live);
  if (cmd === "agent-checkout") return await agentCheckoutCmd(values.url, values.code ?? []);
  if (cmd === "acp") return await acpCmd(values, values.code ?? []);
  if (cmd === "serve") return await serve(values.port ? Number(values.port) : undefined);
  if (cmd !== "check") {
    console.error(`Unknown command "${cmd}".\n\n${HELP}`);
    process.exit(EXIT.usage);
  }

  loadEnv();
  if (!process.env.META_API_KEY) {
    console.error(c.red("OfferTest is not set up yet: no Meta Model API key."));
    console.error(`Run ${c.bold("offertest init")}: a 3-minute guided setup that opens the right pages and tests each key.`);
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
  else if (values.account || (!values.url && process.env.META_AD_ACCOUNT_ID)) {
    // Cheap list first; read each creative only for the ads we will test.
    const ids = await listAdIds(values.account, values.live ? ["ACTIVE"] : undefined);
    const limit = Number(values.limit ?? 5);
    if (ids.length > limit && !values.json) console.log(c.dim(`${ids.length} ads match; testing the first ${limit}. Use --limit to change.`));
    const pick = ids.slice(0, limit);
    if (pick.length > 1 && tty && !values.yes) {
      for (const a of pick) console.log(c.dim(`  ${a.id}  ${(a.status ?? "").padEnd(16)} ${a.name ?? ""}`));
      if (!(await ask(`Test these ${pick.length} ads? About $${(pick.length * 0.2).toFixed(2)}-$${pick.length}.00 in model usage and ${pick.length * 2}-${pick.length * 5} minutes.`))) return;
    }
    targets = [];
    for (const a of pick) targets.push(await getAd(a.id));
  }
  else if (values.url && values.headline)
    targets = [{ source: "manual", headline: values.headline, text: values.text ?? "", cta: values.cta ?? "Shop now", imageUrl: values.image, destination: { type: "website", url: values.url } }];
  else {
    console.error(`Give --ad <id>, --account <act_id>, or --url with --headline.\n\n${HELP}`);
    process.exit(EXIT.usage);
  }
  if (!targets.length) {
    console.log(values.account && !values.live ? "No paused or in-review ads found. Use --live for active ads." : "No ads matched.");
    return;
  }

  const opts: RunOptions = {
    outDir: values.out!,
    pay: values.pay,
    submit: !values["no-submit"],
    agentCheckout: !values["no-agent-checkout"],
    acp: acpOptions(values),
    // A visible browser by default in a terminal: it passes more bot checks and you can watch the agent.
    headful: values.headful ?? (!values.headless && !values.json && !!process.stdout.isTTY),
    retryHeadful: !values.headless && !!process.stdout.isTTY,
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
    let retestOf = values["retest-of"];
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
  // Most serious first: a tool error, then a proven failure, then "could not check", then pass.
  // A bot wall on one ad (2) must not hide a broken offer on another (1).
  const codes = results.map(({ result }) => (result.error ? EXIT.error : EXIT[result.overall ?? "unresolved"]));
  process.exit([EXIT.error, EXIT.fail, EXIT.unresolved].find((c) => codes.includes(c)) ?? EXIT.pass);
}

async function ads(account?: string, live?: boolean) {
  const ids = await listAdIds(account, live ? ["ACTIVE"] : undefined);
  if (!ids.length) return void console.log(`No ${live ? "live" : "paused or in-review"} ads found.${live ? "" : " Use --live for active ads."}`);
  for (const s of ids.slice(0, 25)) {
    const a = await getAd(s.id);
    console.log(`${a.id}  ${c.dim((a.status ?? "").padEnd(16))} ${a.headline.slice(0, 46).padEnd(46)}  -> ${dest(a)}`);
  }
  if (ids.length > 25) console.log(c.dim(`...and ${ids.length - 25} more.`));
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
