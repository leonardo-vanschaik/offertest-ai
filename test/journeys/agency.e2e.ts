// Journeys of an agency or freelance media buyer who works from Meta Ads Manager: list ads, check one ad,
// sweep an account before a sale, carousels, lead ads, and pausing a failing live ad.
// Runs the real CLI against a fake Marketing API and the demo store. Needs the demo store on :3000.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { FakeMeta, GUIDE, RIDGE, SUMMIT, buyWithCode, cli, getGuide, graphAd, pagesOf, resultOf, scenario, staticSite, type CliRun, type Journey } from "./harness.ts";

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

const why = (run: CliRun) => `exit ${run.code}\n${run.stdout.slice(0, 1500)}\n${run.stderr.slice(0, 800)}`;
const save20 = { promises: [{ kind: "discount", claim: "Code SAVE20 takes 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", conditions: [{ key: "code", value: "SAVE20" }] }], rules: [{ contradicted: /This code (has expired|is not valid)/, supported: /SAVE20 applied: -\$24\.00/ }] };
const freeShip = { promises: [{ kind: "shipping", claim: "Shipping is free", adQuote: "Free shipping on the Ridge." }], rules: [{ contradicted: /\$8\.95/, supported: /^Shipping\s*Free$/ }] };
const guideForm = {
  id: "form9",
  name: "Thru-hike guide form",
  questions: [{ key: "email", type: "EMAIL", label: "Email" }],
  context_card: { title: "Free thru-hike guide", content: ["Get the PDF instantly."] },
  privacy_policy: { url: `${GUIDE}` },
  thank_you_page: { title: "Thanks!", body: "Your guide is one tap away.", button_text: "Get the guide", website_url: GUIDE },
};

test("Monday sweep: `ads` lists every ad about to launch, across pages, with where it sends people", async () => {
  meta.set({
    graph: {
      pageSize: 2,
      account: [
        { id: "101", name: "Ridge SAVE20", effective_status: "PAUSED" },
        { id: "102", name: "Ridge free ship", effective_status: "PENDING_REVIEW" },
        { id: "103", name: "Guide lead ad", effective_status: "ADSET_PAUSED" },
        { id: "199", name: "Live ad", effective_status: "ACTIVE" },
      ],
      ads: {
        "101": graphAd("101", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE }),
        "102": graphAd("102", { headline: "Free shipping on the Ridge.", text: "Free shipping on the Ridge.", link: RIDGE, status: "PENDING_REVIEW" }),
        "103": graphAd("103", { headline: "Free thru-hike guide.", text: "Get it free.", formId: "form9", status: "ADSET_PAUSED" }),
      },
      forms: { form9: guideForm },
    },
  });
  const run = await cli(["ads", "--account", "act_1"], meta.env());
  assert.equal(run.code, 0, why(run));
  for (const id of ["101", "102", "103"]) assert.match(run.stdout, new RegExp(`^${id}\\s`, "m"), `ad ${id} listed`);
  assert.doesNotMatch(run.stdout, /^199\s/m, "live ads are not in the pre-launch list");
  assert.match(run.stdout, /Instant Form form9/);
  assert.ok(meta.calls.graphPaths.some((p) => /act_1\/ads.*after=2/.test(p)), "followed the second page");
});

test("check one ad by id from Ads Manager: it reads the creative and link, and the JSON names the ad", async () => {
  await scenario("baseline");
  meta.set({ ...save20, shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") }, graph: { ads: { "101": graphAd("101", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE }) } } });
  const run = await cli(["check", "--ad", "101", "--json", "--headless", "--no-agent-checkout"], meta.env());
  assert.equal(run.code, 0, why(run));
  assert.equal(run.json![0].ad, "101");
  assert.equal(run.json![0].overall, "pass");
});

test("pre-sale account sweep: each paused ad gets its own verdict, and one broken offer fails the run even next to a bot wall", async () => {
  await scenario("shipping_charged");
  meta.set({
    shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20"), "first-thru-hike": getGuide },
    byAd: {
      "20% off the Ridge": save20,
      "Free shipping on the Ridge": freeShip,
      "Free thru-hike guide": { promises: [{ kind: "free", claim: "The guide is free and instant", adQuote: "Get it free." }], rules: [{ contradicted: /Unlock it for/, supported: /Your guide is ready\./ }] },
      "Opening sale": save20,
    },
    graph: {
      account: [
        { id: "101", effective_status: "PAUSED" },
        { id: "102", effective_status: "PAUSED" },
        { id: "103", effective_status: "PAUSED" },
        { id: "104", effective_status: "PAUSED" },
        { id: "199", effective_status: "ACTIVE" },
      ],
      ads: {
        "101": graphAd("101", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE }),
        "102": graphAd("102", { headline: "Free shipping on the Ridge.", text: "Free shipping on the Ridge.", link: RIDGE }),
        "103": graphAd("103", { headline: "Free thru-hike guide.", text: "Get it free.", formId: "form9" }),
        "104": graphAd("104", { headline: "Opening sale.", text: "Use code SAVE20 at checkout.", link: `${wall.url}/password` }),
      },
      forms: { form9: guideForm },
    },
  });
  const run = await cli(["check", "--account", "act_1", "--json", "--headless", "--no-agent-checkout", "--limit", "10"], meta.env(), { timeoutMs: 400_000 });
  assert.equal(run.code, 1, `a verified failure outranks unresolved\n${why(run)}`);
  const byAd = Object.fromEntries(run.json!.map((r) => [r.ad, r.overall]));
  assert.deepEqual(byAd, { "101": "pass", "102": "fail", "103": "pass", "104": "unresolved" });
  assert.ok(!meta.calls.graphPaths.some((p) => p.startsWith("GET 199")), "live ads are not tested in a pre-launch sweep");
  assert.equal(meta.calls.pauses.length, 0, "nothing is paused without --pause-failing");
});

test("carousel: each card's link is followed and judged on its own product", async () => {
  await scenario("baseline");
  meta.set({
    shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20"), "summit-rain-jacket": [{ say: "The jacket page shows its price." }] },
    promises: [
      { kind: "discount", claim: "SAVE20 takes 20% off the Ridge", adQuote: "Ridge: 20% off with SAVE20.", card: 0, conditions: [{ key: "code", value: "SAVE20" }] },
      { kind: "price", claim: "The Summit rain jacket costs $89", adQuote: "Summit jacket $89.", card: 1 },
    ],
    rules: [
      { supported: /SAVE20 applied: -\$24\.00/, url: /ridge|cart|checkout/ },
      { contradicted: /^\$(?!89\.00)\d+\.\d\d$/, supported: /^\$89\.00$/, url: /summit/ },
    ],
    graph: {
      ads: {
        "301": graphAd("301", {
          headline: "Gear for the long trail.",
          text: "Ridge: 20% off with SAVE20. Summit jacket $89.",
          link: RIDGE,
          cards: [
            { name: "Ridge trail shoe", link: RIDGE },
            { name: "Summit rain jacket", link: SUMMIT },
          ],
        }),
      },
    },
  });
  const run = await cli(["check", "--ad", "301", "--json", "--headless", "--no-agent-checkout"], meta.env());
  assert.equal(run.code, 0, why(run));
  const urls = resultOf(run).steps.map((s) => s.url ?? "");
  assert.ok(urls.some((u) => u.includes("ridge-trail-shoe")) && urls.some((u) => u.includes("summit-rain-jacket")), "both cards followed");
  assert.deepEqual(run.json![0].verdicts.map((v) => v.status), ["supported", "supported"]);
});

test("lead ad: the Instant Form is read from Meta and its thank-you link is followed to the free guide", async () => {
  const lead: Journey = {
    shopper: { "first-thru-hike": getGuide },
    promises: [{ kind: "free", claim: "The thru-hike guide is a free PDF", adQuote: "Get it free." }],
    rules: [{ contradicted: /could not be found|Unlock it for/, supported: /Your guide is ready\./ }],
    graph: { ads: { "103": graphAd("103", { headline: "Free thru-hike guide.", text: "Get it free.", formId: "form9" }) }, forms: { form9: guideForm } },
  };
  await scenario("baseline");
  meta.set(lead);
  const ok = await cli(["check", "--ad", "103", "--json", "--headless"], meta.env());
  assert.equal(ok.code, 0, `${why(ok)}\n${pagesOf(ok)}`);
  const steps = resultOf(ok).steps;
  assert.ok(steps.some((s) => s.url === "meta://leadgen_form/form9"), "form read from Meta");
  assert.ok(steps.some((s) => (s.url ?? "").includes("first-thru-hike")), "thank-you link followed");

  await scenario("guide_link_broken");
  meta.set(lead);
  const broken = await cli(["check", "--ad", "103", "--json", "--headless"], meta.env());
  assert.equal(broken.code, 1, `${why(broken)}\n${pagesOf(broken)}`);
  assert.match(broken.json![0].verdicts[0].pageQuote, /could not be found/);
});

test("live ad breaks mid-sale: --pause-failing pauses only the failing live ad", async () => {
  await scenario("code_expired");
  meta.set({
    ...save20,
    shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") },
    graph: {
      ads: {
        "201": graphAd("201", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE, status: "ACTIVE" }),
        "202": graphAd("202", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE, status: "PAUSED" }),
      },
    },
  });
  const run = await cli(["check", "--ad", "201", "--ad", "202", "--pause-failing", "--yes", "--json", "--headless", "--no-agent-checkout"], meta.env(), { timeoutMs: 300_000 });
  assert.equal(run.code, 1, why(run));
  assert.deepEqual(meta.calls.pauses, ["201"], "only the live failing ad is paused");
  // A scheduled job reads the JSON: stdout is only JSON, and it says which ad was paused.
  const json = JSON.parse(run.stdout) as { ad: string; paused: boolean }[];
  assert.deepEqual(json.map((r) => [r.ad, r.paused]), [["201", true], ["202", false]]);
  assert.match(run.stderr, /Paused ad 201/);
});

test("scheduled live check with --limit: the ads it leaves out are named, and the run cannot pass as a whole", async () => {
  await scenario("shipping_charged");
  const ad = { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE, status: "ACTIVE" };
  meta.set({
    ...save20,
    shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") },
    graph: {
      account: [
        { id: "201", effective_status: "ACTIVE" },
        { id: "202", effective_status: "ACTIVE" },
      ],
      ads: { "201": graphAd("201", ad), "202": graphAd("202", ad) },
    },
  });
  const run = await cli(["check", "--account", "act_1", "--live", "--limit", "1", "--json", "--headless", "--no-agent-checkout"], meta.env(), { timeoutMs: 300_000 });
  assert.equal(run.code, 2, `the one tested ad passed, but one was not tested\n${why(run)}`);
  assert.deepEqual((JSON.parse(run.stdout) as { ad: string; overall: string }[]).map((r) => [r.ad, r.overall]), [["201", "pass"]]);
  assert.match(run.stderr, /2 ads match; testing the first 1/);
  assert.match(run.stderr, /1 more ad was not tested/);
});

test("pausing needs a yes: without --yes in a script, nothing is paused", async () => {
  await scenario("code_expired");
  meta.set({ ...save20, shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") }, graph: { ads: { "201": graphAd("201", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE, status: "ACTIVE" }) } } });
  const run = await cli(["check", "--ad", "201", "--pause-failing", "--json", "--headless", "--no-agent-checkout"], meta.env());
  assert.equal(run.code, 1, why(run));
  assert.deepEqual(meta.calls.pauses, []);
});

test("expired Ads Manager token: a clear error and the fix, not a false verdict", async () => {
  meta.set({ graph: { expiredToken: true } });
  const run = await cli(["check", "--ad", "101", "--json", "--headless"], meta.env());
  assert.equal(run.code, 3, why(run));
  assert.match(run.stdout + run.stderr, /offertest init/);
  assert.equal(meta.calls.turns, 0, "no funnel was run");
});
