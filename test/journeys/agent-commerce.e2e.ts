// Journeys about shoppers who buy through AI agents: the store's UCP agent cart (Shopify) and ACP checkout.
// A code can work on the website and still fail for agents. Needs the demo store on :3000.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { FakeMeta, RIDGE, STORE, buyWithCode, cli, orderCount, resultOf, scenario, type CliRun, type Journey } from "./harness.ts";

const meta = new FakeMeta();
before(() => meta.start());
after(async () => {
  await scenario("baseline");
  await meta.stop();
});

const why = (run: CliRun) => `exit ${run.code}\n${run.stdout.slice(0, 1500)}\n${run.stderr.slice(0, 600)}`;
const ACP = ["--acp-url", `${STORE}/api/acp`, "--acp-key", "alder-trail-demo"];
const save20: Journey = {
  shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") },
  promises: [{ kind: "discount", claim: "Code SAVE20 takes 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", conditions: [{ key: "code", value: "SAVE20" }] }],
  rules: [{ contradicted: /This code (has expired|is not valid)|discount_code_invalid/, supported: /SAVE20 applied: -\$24\.00/ }],
};
const AD = ["--url", RIDGE, "--headline", "20% off the Ridge.", "--text", "Use code SAVE20 at checkout.", "--headless", "--json"];

test("quick check, no keys: does my code work for AI shopping agents?", async () => {
  await scenario("baseline");
  const ok = await cli(["agent-checkout", "--url", RIDGE, "--code", "SAVE20"]);
  assert.equal(ok.code, 0, why(ok));
  assert.match(ok.stdout, /Discount applied: SAVE20/);
  await scenario("agent_code_rejected");
  const bad = await cli(["agent-checkout", "--url", RIDGE, "--code", "save20"]);
  assert.equal(bad.code, 1, why(bad));
  assert.match(bad.stdout, /Does not work in agent checkout: SAVE20/);
});

test("the code works on the website but not for AI agents: the full check fails on the agent cart", async () => {
  await scenario("agent_code_rejected");
  meta.set(save20);
  const run = await cli(["check", ...AD], meta.env());
  assert.equal(run.code, 1, why(run));
  const steps = resultOf(run).steps;
  assert.ok(steps.some((s) => (s.url ?? "").startsWith("ucp://")), "agent cart checked");
  assert.ok(steps.some((s) => /\/store\/checkout/.test(s.url ?? "")), "website funnel still followed");
  assert.match(run.json![0].verdicts[0].pageQuote, /not valid|discount_code_invalid/);
});

test("own store with ACP: an AI agent buys in test mode, and a web-only code is caught", async () => {
  await scenario("baseline");
  const before = await orderCount();
  const ok = await cli(["acp", ...ACP, "--item", "ridge-trail-shoe", "--code", "SAVE20"]);
  assert.equal(ok.code, 0, why(ok));
  assert.match(ok.stdout, /Test purchase: completed, order AT-\d+, paid \$96\.00 in test mode/);
  assert.equal(await orderCount(), before + 1);

  await scenario("agent_code_rejected");
  const bad = await cli(["acp", ...ACP, "--url", RIDGE, "--code", "SAVE20", "--no-buy"]);
  assert.equal(bad.code, 1, why(bad));
  assert.match(bad.stdout, /Discount rejected: SAVE20 \(discount_code_invalid\)/);
  assert.equal(await orderCount(), before + 1, "--no-buy places no order");

  const locked = await cli(["acp", "--acp-url", `${STORE}/api/acp`, "--acp-key", "wrong", "--item", "ridge-trail-shoe"]);
  assert.equal(locked.code, 2, why(locked));
  assert.match(locked.stdout, /401/);
});

test("check with ACP: no purchase without --pay; with --pay --yes the agent buys once", async () => {
  await scenario("baseline");
  meta.set(save20);
  const before = await orderCount();
  const look = await cli(["check", ...AD, ...ACP], meta.env());
  assert.equal(look.code, 0, why(look));
  assert.equal(await orderCount(), before, "no order without --pay");
  assert.ok(resultOf(look).steps.some((s) => (s.url ?? "").startsWith("acp://")));

  meta.set(save20);
  const buy = await cli(["check", ...AD, ...ACP, "--pay", "--yes"], meta.env());
  assert.equal(buy.code, 0, why(buy));
  assert.equal(await orderCount(), before + 1, "exactly one ACP test order");
});
