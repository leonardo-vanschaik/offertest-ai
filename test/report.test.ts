import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeReport } from "../src/report/html.ts";
import type { RunResult } from "../src/types.ts";

// A valid 1x1 JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

function fakeRun(): RunResult {
  return {
    schemaVersion: 1,
    tool: { name: "offertest", version: "0.1.0" },
    id: "r_20261029_save20",
    createdAt: "2026-10-29T15:02:11.000Z",
    finishedAt: "2026-10-29T15:04:03.000Z",
    ad: {
      source: "meta",
      id: "120210000000001",
      status: "ACTIVE",
      name: "Ridge Outdoor",
      headline: "20% off the Ridge trail shoe.",
      text: "This week only. Use code SAVE20 at checkout.",
      cta: "Shop now",
      destination: { type: "website", url: "https://ridge.example/store/products/ridge-trail" },
    },
    assertions: [
      { id: "a1", kind: "discount", claim: "Code SAVE20 gives 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", conditions: { code: "SAVE20" } },
      { id: "a2", kind: "availability", claim: "The Ridge trail shoe is for sale", adQuote: "20% off the Ridge trail shoe.", conditions: {} },
    ],
    steps: [
      { n: 1, at: "2026-10-29T15:02:15.000Z", kind: "action", summary: "Open the product page", url: "https://ridge.example/store/products/ridge-trail", screenshot: "shots/001.jpg" },
      { n: 2, at: "2026-10-29T15:02:40.000Z", kind: "action", summary: "Add to cart", screenshot: "shots/002.jpg", click: { x: 900, y: 520 }, actions: [{ type: "click", x: 900, y: 520 }] },
      { n: 3, at: "2026-10-29T15:03:05.000Z", kind: "action", summary: "Apply code SAVE20", screenshot: "shots/003.jpg", actions: [{ type: "type", text: "SAVE20" }] },
      { n: 4, at: "2026-10-29T15:03:30.000Z", kind: "note", summary: "Stopped before payment", modelText: "I will not pay. <b>stop</b>" },
    ],
    verdicts: [
      {
        assertionId: "a1",
        status: "contradicted",
        adQuote: "Use code SAVE20 at checkout.",
        pageQuote: 'This code has expired. <script>alert("x")</script>',
        evidenceStep: 3,
        reason: "The checkout rejects SAVE20 as expired.",
        quoteCheck: { adQuoteFound: true, pageQuoteFound: true },
      },
      {
        assertionId: "a2",
        status: "supported",
        adQuote: "20% off the Ridge trail shoe.",
        pageQuote: "Ridge Trail Shoe \u2028 $120.00 & in stock",
        evidenceStep: 1,
        reason: "The product page shows the shoe in stock.",
        quoteCheck: { adQuoteFound: true, pageQuoteFound: true },
      },
    ],
    overall: "fail",
    fix: {
      summary: "Extend SAVE20 or change the ad.",
      rationale: "The code expired, so every click from this ad sees an error.",
      target: "funnel",
      steps: ["Open Discounts", "Set SAVE20 end date to Sunday"],
    },
    sam: { screenshot: "shots/001.jpg", boxes: [{ label: "trail shoe", left: 100, top: 50, right: 500, bottom: 400, w: 1280, h: 800 }] },
    boundary: "Reached checkout. Stopped before payment.",
    models: { computer_use: "muse-wonder-1.0", judge: "muse-spark-1.3", product_boxes: "sam-3.1" },
    usage: { inputTokens: 51234, outputTokens: 2310, images: 4, usd: 0.27 },
  };
}

test("writeReport writes one safe, self-contained file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-report-"));
  fs.mkdirSync(path.join(dir, "shots"));
  for (const n of ["001", "002", "003"]) fs.writeFileSync(path.join(dir, "shots", `${n}.jpg`), JPEG);

  const file = writeReport(fakeRun(), dir);
  assert.equal(file, path.join(dir, "report.html"));
  assert.ok(fs.existsSync(file));
  const html = fs.readFileSync(file, "utf8");

  // escaped quotes are present, raw markup from the page is not
  assert.ok(html.includes("This code has expired. &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(html.includes("I will not pay. &lt;b&gt;stop&lt;/b&gt;"));
  assert.ok(html.includes("$120.00 &amp; in stock"));
  assert.ok(!html.includes('<script>alert("x")'));
  assert.equal(html.match(/<script\b/g)?.length, 2); // the JSON block and the viewer script only

  // strict CSP and embedded screenshots
  assert.ok(html.includes("default-src 'none'; img-src data:;"));
  assert.ok(html.includes("data:image/jpeg;base64,"));
  assert.ok(html.includes("Pulled from Meta Ads Manager · ad 120210000000001 · ACTIVE"));

  // the JSON block parses back to the result
  const m = html.match(/<script type="application\/json" id="offertest-result">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.ok(!m[1]!.includes("<") && !m[1]!.includes("\u2028"));
  const parsed = JSON.parse(m[1]!) as RunResult;
  assert.equal(parsed.id, "r_20261029_save20");
  assert.equal(parsed.verdicts[0]!.pageQuote, 'This code has expired. <script>alert("x")</script>');
  assert.equal(parsed.verdicts[1]!.pageQuote, "Ridge Trail Shoe \u2028 $120.00 & in stock");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("large runs embed only the important screenshots", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-report-"));
  fs.mkdirSync(path.join(dir, "shots"));
  const r = fakeRun();
  r.steps = Array.from({ length: 50 }, (_, i) => {
    const name = `shots/${String(i + 1).padStart(3, "0")}.jpg`;
    fs.writeFileSync(path.join(dir, name), JPEG);
    return { n: i + 1, at: r.createdAt, kind: "action" as const, summary: `Step ${i + 1}`, screenshot: name };
  });
  r.verdicts[0]!.evidenceStep = 2; // an odd index, kept because it is evidence
  const html = fs.readFileSync(writeReport(r, dir), "utf8");
  const embedded = html.match(/data:image\/jpeg;base64,/g)?.length ?? 0;
  assert.ok(embedded > 20 && embedded < 50, `embedded ${embedded}`);
  assert.ok(html.includes("Screenshot not embedded"));
  fs.rmSync(dir, { recursive: true, force: true });
});
