// Journeys beyond the shop cart: SaaS-style free trials, lead magnets, broken ad links, bot walls, and a judge
// that makes up evidence. Runs the real CLI against the demo store. Needs the demo store on :3000.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { FakeMeta, GUIDE, RIDGE, STORE, TRAIL_CLUB, cli, getGuide, pagesOf, resultOf, scenario, staticSite, startTrial, type CliRun, type Journey } from "./harness.ts";

const meta = new FakeMeta();
let wall: Awaited<ReturnType<typeof staticSite>>;
before(async () => {
  await meta.start();
  wall = await staticSite({ "/password": "<html><head><title>Opening soon</title></head><body><h1>Opening soon</h1><p>Enter store using password</p><input type=password></body></html>" });
});
after(async () => {
  await scenario("baseline");
  wall.close();
  await meta.stop();
});

const why = (run: CliRun) => `exit ${run.code}\n${run.stdout.slice(0, 1500)}\n${run.stderr.slice(0, 600)}\n${pagesOf(run)}`;
const check = (j: Journey, url: string, headline: string, text: string, extra: string[] = []) => {
  meta.set(j);
  return cli(["check", "--url", url, "--headline", headline, "--text", text, "--cta", "Sign up", "--json", "--headless", "--no-agent-checkout", ...extra], meta.env());
};

const trial: Journey = {
  shopper: { "trail-club": startTrial },
  promises: [
    { kind: "trial", claim: "Trail Club starts with a 30-day free trial", adQuote: "30 days free." },
    { kind: "no_card", claim: "No credit card is needed to start the trial", adQuote: "No credit card required." },
  ],
  rules: [
    { contradicted: /Your first (?!30 )\d+ days are free/, supported: /Your first 30 days are free/ },
    { contradicted: /A card is required to start your trial/, supported: /No credit card required/ },
  ],
};

test("SaaS-style trial launch: 30 days and no card, as the ad says", async () => {
  await scenario("baseline");
  const run = await check(trial, TRAIL_CLUB, "Try Trail Club free.", "30 days free. No credit card required.");
  assert.equal(run.code, 0, why(run));
  assert.deepEqual(run.json![0].verdicts.map((v) => v.status), ["supported", "supported"]);
});

test("billing change: the sign-up now asks for a card, so 'no card' fails and the trial length still holds", async () => {
  await scenario("trial_requires_card");
  const run = await check(trial, TRAIL_CLUB, "Try Trail Club free.", "30 days free. No credit card required.");
  assert.equal(run.code, 1, why(run));
  assert.deepEqual(run.json![0].verdicts.map((v) => v.status), ["supported", "contradicted"]);
  assert.match(run.json![0].verdicts[1].pageQuote, /A card is required/);
});

test("trial shortened to 14 days: the 30-day promise fails", async () => {
  await scenario("trial_14_days");
  const run = await check(trial, TRAIL_CLUB, "Try Trail Club free.", "30 days free. No credit card required.");
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /Your first 14 days are free/);
});

const guide: Journey = {
  shopper: { "first-thru-hike": getGuide },
  promises: [{ kind: "free", claim: "The First Thru-Hike Guide is a free PDF download", adQuote: "Free PDF guide." }],
  rules: [{ contradicted: /Unlock it for \$4\.99|could not be found/, supported: /^Your guide is ready\.$/ }],
};

test("lead magnet: the free guide is free and downloads", async () => {
  await scenario("baseline");
  const run = await check(guide, GUIDE, "Your first thru-hike.", "Free PDF guide.");
  assert.equal(run.code, 0, why(run));
});

test("lead magnet now behind a paywall: 'free' fails with the price on the page", async () => {
  await scenario("guide_paywalled");
  const run = await check(guide, GUIDE, "Your first thru-hike.", "Free PDF guide.");
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /Unlock it for \$4\.99/);
});

test("download link broken after a site change: the 404 fails the free-guide promise", async () => {
  await scenario("guide_link_broken");
  const run = await check(guide, GUIDE, "Your first thru-hike.", "Free PDF guide.");
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /could not be found/);
});

test("--no-submit: the form is never sent (no fake lead), and the promise stays unresolved", async () => {
  await scenario("baseline");
  const run = await check(guide, GUIDE, "Your first thru-hike.", "Free PDF guide.", ["--no-submit"]);
  assert.equal(run.code, 2, why(run));
  const r = resultOf(run);
  assert.ok(r.steps.some((s) => /Stopped before submitting a form/.test(s.summary)), "the guard stopped the submit");
  assert.ok(!r.steps.some((s) => /thanks/.test(s.url ?? "")), "never reached the thank-you page");
});

test("ad links to a retired product page: the 404 fails the offer", async () => {
  await scenario("baseline");
  const run = await check(
    { shopper: { "ridge-trail-shoe-old": [{ say: "The page is not found." }] }, promises: [{ kind: "price", claim: "The Ridge trail shoe costs $120", adQuote: "Only $120." }], rules: [{ contradicted: /Page not found|could not be found/, supported: /^\$120\.00$/ }] },
    `${STORE}/store/products/ridge-trail-shoe-old?utm_source=fb`,
    "The Ridge trail shoe.",
    "Only $120.",
  );
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /not found/i);
});

test("store still password protected: the run says it was blocked, not that the offer is false", async () => {
  const run = await check({ shopper: {}, ...guide }, `${wall.url}/password`, "Opening sale.", "Free PDF guide.");
  assert.equal(run.code, 2, why(run));
  assert.equal(run.json![0].overall, "unresolved");
  assert.equal(run.json![0].verdicts[0].status, "unresolved");
  assert.match(resultOf(run).blocked ?? "", /password/i);
});

test("a judge that makes up a quote is caught: the verdict drops to unresolved", async () => {
  await scenario("code_expired");
  const run = await check(
    { shopper: { "ridge-trail-shoe": [{ say: "Done." }] }, promises: [{ kind: "discount", claim: "SAVE20 takes 20% off", adQuote: "Use code SAVE20." }], rules: [{ fake: "SAVE20 applied: -$24.00" }] },
    RIDGE,
    "20% off the Ridge.",
    "Use code SAVE20.",
  );
  assert.equal(run.code, 2, why(run));
  const v = run.json![0].verdicts[0] as { status: string; downgraded?: boolean };
  assert.equal(v.status, "unresolved");
  assert.equal(v.downgraded, true);
});
