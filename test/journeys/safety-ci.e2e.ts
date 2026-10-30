// Journeys about trust and automation: the payment guard, test-mode purchases, CI exit codes and JSON,
// first-time setup (doctor), and the agent skill matching the CLI. Needs the demo store on :3000.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FakeMeta, RIDGE, ROOT, cli, orderCount, payWithCode, resultOf, scenario, type CliRun, type Journey } from "./harness.ts";

const meta = new FakeMeta();
before(() => meta.start());
after(async () => {
  await scenario("baseline");
  await meta.stop();
});

const why = (run: CliRun) => `exit ${run.code}\n${run.stdout.slice(0, 1500)}\n${run.stderr.slice(0, 600)}`;
const buy: Journey = {
  shopper: { "ridge-trail-shoe": payWithCode("Size 9", "SAVE20") },
  promises: [{ kind: "discount", claim: "Code SAVE20 takes 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", conditions: [{ key: "code", value: "SAVE20" }] }],
  rules: [{ contradicted: /This code (has expired|is not valid)/, supported: /SAVE20 applied: -\$24\.00/ }],
};
const AD = ["--url", RIDGE, "--headline", "20% off the Ridge.", "--text", "Use code SAVE20 at checkout.", "--headless", "--no-agent-checkout"];

test("default run: the agent reaches Place order and is stopped; no order is created", async () => {
  await scenario("baseline");
  meta.set(buy);
  const before = await orderCount();
  const run = await cli(["check", ...AD, "--json"], meta.env());
  assert.equal(run.code, 0, why(run));
  assert.equal(await orderCount(), before, "no order");
  assert.ok(resultOf(run).steps.some((s) => /Stopped at payment.*payment not allowed/.test(s.summary)));
});

test("--pay in an unattended script: nobody approves, so nothing is bought", async () => {
  await scenario("baseline");
  meta.set(buy);
  const before = await orderCount();
  const run = await cli(["check", ...AD, "--json", "--pay"], meta.env());
  assert.equal(run.code, 0, why(run));
  assert.equal(await orderCount(), before, "no order without approval");
  assert.ok(resultOf(run).steps.some((s) => /Stopped at payment.*not approved/.test(s.summary)));
});

test("--pay --yes on a test-mode store: the test order goes through and the confirmation is in the result", async () => {
  await scenario("baseline");
  meta.set(buy);
  const before = await orderCount();
  const run = await cli(["check", ...AD, "--json", "--pay", "--yes"], meta.env());
  assert.equal(run.code, 0, why(run));
  assert.equal(await orderCount(), before + 1, "one test order");
  assert.match(resultOf(run).confirmation?.url ?? "", /\/store\/order\/AT-\d+/);
});

test("CI: --json prints only JSON, and exit codes tell a broken offer from a broken setup", async () => {
  await scenario("code_expired");
  meta.set({ ...buy, shopper: { "ridge-trail-shoe": payWithCode("Size 9", "SAVE20").slice(0, 5) } });
  const fail = await cli(["check", ...AD, "--json"], meta.env());
  assert.equal(fail.code, 1, why(fail));
  const parsed = JSON.parse(fail.stdout);
  assert.equal(parsed.length, 1);
  assert.ok(fs.existsSync(parsed[0].report), "report path is real");

  const noKey = await cli(["check", ...AD, "--json"], { META_BASE_URL: `${meta.url}/v1` });
  assert.equal(noKey.code, 3, why(noKey));
  assert.match(noKey.stdout + noKey.stderr, /offertest init/);

  const unknown = await cli(["chek"], meta.env());
  assert.equal(unknown.code, 4, why(unknown));
  const noTarget = await cli(["check", "--json"], { ...meta.env(), META_ACCESS_TOKEN: "" });
  assert.equal(noTarget.code, 4, why(noTarget));
});

test("Meta's API loses the conversation mid-run: the agent carries on in a new one and the verdict still holds", async () => {
  await scenario("code_expired");
  meta.set({ ...buy, shopper: { "ridge-trail-shoe": payWithCode("Size 9", "SAVE20").slice(0, 5) }, loseChain: 2 });
  const run = await cli(["check", ...AD, "--json"], meta.env());
  assert.equal(run.code, 1, why(run));
  assert.equal(meta.calls.chainLost, 2, "the chain was lost, retried once, then replaced");
  assert.match(run.json![0].verdicts[0].pageQuote, /This code has expired\./);
});

test("first-time setup: doctor says what is missing, then passes once keys work", async () => {
  const empty = await cli(["doctor"], { META_BASE_URL: `${meta.url}/v1`, META_GRAPH_URL: `${meta.url}/graph` });
  assert.equal(empty.code, 1, why(empty));
  assert.match(empty.stdout, /No Meta Model API key/);
  assert.match(empty.stdout, /offertest init/);

  meta.set({});
  const ready = await cli(["doctor"], meta.env({ META_AD_ACCOUNT_ID: "act_1" }));
  assert.equal(ready.code, 0, why(ready));
  assert.match(ready.stdout, /Meta Model API key: 2 models, including Muse Wonder/);
  assert.match(ready.stdout, /Ads Manager: connected as Test Owner/);
  assert.match(ready.stdout, /Default ad account: Alder Trail Co\./);
  assert.match(ready.stdout, /All good/);
});

test("agent skill: every command the skill tells Claude Code, Codex, or Muse Code to run exists in the CLI", async () => {
  const help = await cli(["--help"]);
  const skill = fs.readFileSync(path.join(ROOT, "skills/offertest/SKILL.md"), "utf8");
  const commands = [...new Set([...skill.matchAll(/offertest ([a-z][a-z-]+)/g)].map((m) => m[1]))];
  assert.ok(commands.length >= 5, "the skill names commands");
  for (const cmd of commands) assert.match(help.stdout, new RegExp(`offertest ${cmd}\\b`), `"${cmd}" is in --help`);
  const flags = [...new Set([...skill.matchAll(/(?<![\w-])--([a-z][a-z-]+)/g)].map((m) => m[1]))];
  for (const flag of flags) assert.match(help.stdout, new RegExp(`--${flag}\\b`), `--${flag} is in --help`);
});
