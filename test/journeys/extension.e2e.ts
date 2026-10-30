// Journeys of a media buyer who clicks "Test this ad" in Ads Manager: the Chrome extension talks to
// `offertest serve` on 127.0.0.1. This drives the same HTTP calls the extension makes, with its Origin.
// Needs the demo store on :3000.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { EXTENSION_ORIGIN, FakeMeta, RIDGE, buyWithCode, graphAd, orderCount, payWithCode, scenario, serveCli } from "./harness.ts";

const meta = new FakeMeta();
let server: Awaited<ReturnType<typeof serveCli>>;
before(async () => {
  await meta.start();
  server = await serveCli(meta.env());
});
after(async () => {
  server.stop();
  await scenario("baseline");
  await meta.stop();
});

const fromExtension = (path: string, body: object) =>
  fetch(`${server.url}${path}`, { method: "POST", headers: { origin: EXTENSION_ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });

type View = { status: string; phase: string; steps: unknown[]; hasShot: boolean; hasReport: boolean; error?: string; result?: { overall: string; verdicts: { status: string; pageQuote: string }[]; fix?: { summary: string } } };

async function waitDone(id: string): Promise<View> {
  for (let i = 0; i < 300; i++) {
    const v = (await (await fetch(`${server.url}/tests/${id}`)).json()) as View;
    if (v.status !== "running") return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`test ${id} did not finish\n${server.log()}`);
}

const save20 = {
  promises: [{ kind: "discount", claim: "Code SAVE20 takes 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", conditions: [{ key: "code", value: "SAVE20" }] }],
  rules: [{ contradicted: /This code (has expired|is not valid)/, supported: /SAVE20 applied: -\$24\.00/ }],
  graph: { ads: { "101": graphAd("101", { headline: "20% off the Ridge.", text: "Use code SAVE20 at checkout.", link: RIDGE, status: "ACTIVE" }) } },
};

test("the extension finds the local server and knows the keys are set", async () => {
  const h = (await (await fetch(`${server.url}/health`)).json()) as { ok: boolean; hasModelKey: boolean; hasAdsToken: boolean };
  assert.deepEqual([h.ok, h.hasModelKey, h.hasAdsToken], [true, true, true]);
});

test("another website cannot start tests or pause ads with the owner's token", async () => {
  const evil = { origin: "https://evil.example", "content-type": "application/json" };
  assert.equal((await fetch(`${server.url}/tests`, { method: "POST", headers: evil, body: '{"adId":"101"}' })).status, 403);
  assert.equal((await fetch(`${server.url}/ads/101/pause`, { method: "POST", headers: evil, body: "{}" })).status, 403);
  assert.deepEqual(meta.calls.pauses, []);
});

test("'Test this ad' in Ads Manager: live progress, then a failing verdict, the report, and one-click pause", async () => {
  await scenario("code_expired");
  meta.set({ ...save20, shopper: { "ridge-trail-shoe": buyWithCode("Size 9", "SAVE20") } });
  const { id } = (await (await fromExtension("/tests", { adId: "101" })).json()) as { id: string };
  assert.ok(id);
  const running = (await (await fetch(`${server.url}/tests/${id}`)).json()) as View;
  assert.equal(running.status, "running");

  const done = await waitDone(id);
  assert.equal(done.status, "done", done.error ?? server.log());
  assert.equal(done.result?.overall, "fail");
  assert.match(done.result?.verdicts[0].pageQuote ?? "", /This code has expired\./);
  assert.ok(done.steps.length >= 4 && done.hasShot && done.hasReport);

  const report = await fetch(`${server.url}/tests/${id}/report`);
  assert.equal(report.status, 200);
  assert.match(await report.text(), /This code has expired\./);
  const shot = await fetch(`${server.url}/tests/${id}/shots/latest`);
  assert.equal(shot.headers.get("content-type"), "image/jpeg");
  assert.equal((await fetch(`${server.url}/tests/${id}/shots/..%2F..%2Fetc%2Fpasswd`)).status, 404, "no path tricks");

  const pause = await fromExtension("/ads/101/pause", {});
  assert.equal(pause.status, 200);
  assert.deepEqual(meta.calls.pauses, ["101"]);
});

test("the extension can never buy: a funnel that reaches Place order stops there", async () => {
  await scenario("baseline");
  meta.set({ ...save20, shopper: { "ridge-trail-shoe": payWithCode("Size 9", "SAVE20") } });
  const before = await orderCount();
  const { id } = (await (await fromExtension("/tests", { adId: "101" })).json()) as { id: string };
  const done = await waitDone(id);
  assert.equal(done.status, "done", done.error ?? server.log());
  assert.equal(done.result?.overall, "pass");
  assert.equal(await orderCount(), before, "no order");
});
