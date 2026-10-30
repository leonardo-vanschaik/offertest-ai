// Journeys of a Shopify/DTC store owner who runs `offertest check --url` from a terminal before or during a promo.
// Each test runs the real CLI against the demo store with a scripted shopper. Needs the demo store on :3000.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FakeMeta, RIDGE, buyWithCode, cli, pagesOf, resultOf, scenario, storeFix, type CliRun, type Journey } from "./harness.ts";

const meta = new FakeMeta();
before(() => meta.start());
after(async () => {
  await scenario("baseline");
  await meta.stop();
});

const SAVE20_AD = ["--headline", "20% off the Ridge trail shoe.", "--text", "This week only. Use code SAVE20 at checkout."];
const save20: Journey = {
  shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") },
  promises: [{ kind: "discount", claim: "Code SAVE20 takes 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", conditions: [{ key: "code", value: "SAVE20" }] }],
  rules: [{ contradicted: /This code (has expired|is not valid|does not apply)|Spend \$[\d.,]+ or more|SAVE20 applied: -\$12\.00/, supported: /SAVE20 applied: -\$24\.00/ }],
  fix: { summary: "Make SAVE20 give 20% off the Ridge trail shoe again." },
};

async function check(j: Journey, args: string[] = SAVE20_AD, extra: string[] = []): Promise<CliRun> {
  meta.set(j);
  return cli(["check", "--url", RIDGE, ...args, "--json", "--headless", "--no-agent-checkout", ...extra], meta.env());
}

const why = (run: CliRun) => `exit ${run.code}\n${run.stdout.slice(0, 1200)}\n${run.stderr.slice(0, 800)}\n${fs.existsSync(run.out) ? pagesOf(run) : ""}`;

test("launch day: the code works, the check passes, and the report proves it", async () => {
  await scenario("baseline");
  const run = await check(save20);
  assert.equal(run.code, 0, why(run));
  const [r] = run.json!;
  assert.equal(r.overall, "pass");
  assert.equal(r.verdicts[0].status, "supported");
  assert.equal(r.verdicts[0].pageQuote, "SAVE20 applied: -$24.00");
  const html = fs.readFileSync(r.report, "utf8");
  assert.match(html, /SAVE20 applied: -\$24\.00/);
  assert.ok(fs.existsSync(path.join(path.dirname(r.report), "shots", "001.jpg")), "screenshots saved");
  assert.match(r.boundary, /checkout/);
});

test("'your code doesn't work' ticket: an expired code fails with the store's own words and a fix", async () => {
  await scenario("code_expired");
  const run = await check(save20);
  assert.equal(run.code, 1, why(run));
  const [r] = run.json!;
  assert.equal(r.overall, "fail");
  assert.equal(r.verdicts[0].status, "contradicted");
  assert.equal(r.verdicts[0].pageQuote, "This code has expired.");
  assert.match(r.fix?.summary ?? "", /SAVE20/);
  assert.match(fs.readFileSync(r.report, "utf8"), /This code has expired\./);
});

test("the code only works on another product: the cart says so and the check fails", async () => {
  await scenario("code_excludes_product");
  const run = await check(save20);
  assert.equal(run.code, 1, why(run));
  assert.equal(run.json![0].verdicts[0].pageQuote, "This code does not apply to items in your cart.");
});

test("a hidden minimum spend blocks the code: the check fails with the minimum", async () => {
  await scenario("code_min_spend");
  const run = await check(save20);
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /Spend \$150\.00 or more/);
});

test("the code in the ad was never created: the check fails", async () => {
  await scenario("code_missing");
  const run = await check(save20);
  assert.equal(run.code, 1, why(run));
  assert.equal(run.json![0].verdicts[0].pageQuote, "This code is not valid.");
});

test("the code gives 10% instead of the advertised 20%: the check fails on the amount", async () => {
  await scenario("code_wrong_percent");
  const run = await check(save20);
  assert.equal(run.code, 1, why(run));
  assert.equal(run.json![0].verdicts[0].pageQuote, "SAVE20 applied: -$12.00");
});

test("the price went up after launch: the advertised price fails on the product page", async () => {
  await scenario("price_raised");
  const run = await check(
    {
      shopper: { "ridge-trail-shoe": [{ say: "The product page shows the price." }] },
      promises: [{ kind: "price", claim: "The Ridge trail shoe costs $120", adQuote: "Only $120." }],
      rules: [{ contradicted: /^\$135\.00$/, supported: /^\$120\.00$/ }],
    },
    ["--headline", "The Ridge trail shoe.", "--text", "Only $120."],
  );
  assert.equal(run.code, 1, why(run));
  assert.equal(run.json![0].verdicts[0].pageQuote, "$135.00");
});

test("BFCM morning: the code and free shipping both hold", async () => {
  await scenario("baseline");
  const run = await check(
    {
      ...save20,
      promises: [...save20.promises!, { kind: "shipping", claim: "Shipping is free", adQuote: "Free shipping." }],
      rules: [...save20.rules!, { contradicted: /^Shipping\s*\$[\d.]+$|^\$8\.95$/, supported: /^Shipping\s*Free$|^Free shipping on every order$/ }],
    },
    ["--headline", "20% off the Ridge trail shoe.", "--text", "Use code SAVE20 at checkout. Free shipping."],
  );
  assert.equal(run.code, 0, why(run));
  assert.deepEqual(run.json![0].verdicts.map((v) => v.status), ["supported", "supported"]);
});

test("free shipping in the ad, but the cart charges shipping: the check fails", async () => {
  await scenario("shipping_charged");
  const run = await check(
    {
      shopper: { "ridge-trail-shoe": buyWithCode("Size 9") },
      promises: [{ kind: "shipping", claim: "Shipping is free on the Ridge trail shoe", adQuote: "Free shipping." }],
      rules: [{ contradicted: /\$8\.95/, supported: /^Shipping\s*Free$/ }],
    },
    ["--headline", "The Ridge trail shoe.", "--text", "Free shipping."],
  );
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /\$8\.95/);
});

test("the ad's size is sold out: the product page shows it and the check fails", async () => {
  await scenario("size_sold_out");
  const run = await check(
    {
      shopper: { "ridge-trail-shoe": [{ say: "Size 10 is marked sold out." }] },
      promises: [{ kind: "availability", claim: "The Ridge trail shoe is in stock in size 10", adQuote: "Now in size 10." }],
      rules: [{ contradicted: /^sold out$/i }],
    },
    ["--headline", "The Ridge trail shoe.", "--text", "Now in size 10."],
  );
  assert.equal(run.code, 1, why(run));
  assert.match(run.json![0].verdicts[0].pageQuote, /^sold out$/i);
});

test("fix and re-test: the owner extends the code, runs the check again, and it passes", async () => {
  await scenario("code_expired");
  const first = await check(save20);
  assert.equal(first.code, 1, why(first));
  await storeFix({ type: "extend_coupon", code: "SAVE20", expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() });
  const second = await check(save20);
  assert.equal(second.code, 0, why(second));
  assert.equal(second.json![0].verdicts[0].pageQuote, "SAVE20 applied: -$24.00");
});

test("phone check: --mobile runs the funnel in a phone-sized Facebook in-app browser", async () => {
  await scenario("baseline");
  meta.set({ ...save20, mobile: true });
  const run = await cli(["check", "--url", RIDGE, ...SAVE20_AD, "--json", "--headless", "--no-agent-checkout", "--mobile"], meta.env());
  assert.equal(run.code, 0, why(run));
  const shot = fs.readFileSync(path.join(path.dirname(run.json![0].report), "shots", "001.jpg"));
  assert.equal(jpegWidth(shot), 390, "phone viewport screenshot");
  assert.ok(resultOf(run).steps.some((s) => /cart/.test(s.url ?? "")));
});

// Width from the JPEG start-of-frame marker.
function jpegWidth(b: Buffer): number {
  for (let i = 2; i < b.length; ) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return b.readUInt16BE(i + 7);
    i += 2 + len;
  }
  return 0;
}
