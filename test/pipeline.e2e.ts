// Full pipeline against a fake Meta API (scripted model replies) and the demo store.
// Needs the demo store on :3000. Run: node --import tsx --test test/pipeline.e2e.ts
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const STORE = process.env.DEMO_STORE ?? "http://localhost:3000";
let turns = 0;

function fakeMeta(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = JSON.parse(body || "{}");
    const send = (o: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (req.url?.endsWith("/chat/completions")) {
      const name = json.response_format?.json_schema?.name;
      const content =
        name === "offer_assertions"
          ? { subject: "shoe", imageText: "", assertions: [{ kind: "discount", claim: "Code SAVE20 gives 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout.", card: null, conditions: [{ key: "code", value: "SAVE20" }] }] }
          : name === "offer_verdicts"
            ? { verdicts: [{ assertionId: "a1", status: "contradicted", adQuote: "Use code SAVE20 at checkout.", pageQuote: "This code has expired.", evidenceStep: 99, reason: "The cart rejects SAVE20." }] }
            : { target: "funnel", summary: "Extend SAVE20 to Nov 9, 11:59 PM.", rationale: "The ad runs until Nov 9.", steps: ["Admin > Coupons > SAVE20 > end date"], adHeadline: null, adText: null };
      return send({ id: "c", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
    }
    if (req.url?.endsWith("/responses")) {
      if (json.model === "sam-3.1") {
        res.writeHead(500);
        return res.end("{}");
      }
      assert.ok(json.instructions, "instructions must be sent every turn");
      assert.deepEqual(json.tools, [{ type: "computer" }]);
      turns++;
      const usage = { input_tokens: 2000, output_tokens: 50 };
      if (turns < 3)
        return send({ id: `r${turns}`, output: [{ type: "computer_call", id: `cc${turns}`, call_id: `call${turns}`, actions: [{ type: "scroll", x: 600, y: 400, scroll_x: 0, scroll_y: 300 }], pending_safety_checks: [], status: "completed" }], usage });
      return send({ id: `r${turns}`, output: [{ type: "message", content: [{ type: "output_text", text: "The cart said: This code has expired." }] }], output_text: "The cart said: This code has expired.", usage });
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, close: () => server.close() })));
}

// One fake server for the whole file: the Meta client is created once and keeps its base URL.
const meta = await fakeMeta();
process.env.META_BASE_URL = meta.url;
process.env.META_API_KEY = "test";
after(() => meta.close());

test("pipeline: promises -> funnel -> verdict with quote check -> fix -> report", async () => {
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"code_expired"}' });
  // Put the expired message on the page the agent sees: open the cart with SAVE20 applied by a real customer flow.
  const { runTest } = await import("../src/core/run.ts");
  const { writeReport } = await import("../src/report/html.ts");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-"));
  const { result, dir } = await runTest(
    { source: "manual", headline: "20% off the Ridge trail shoe.", text: "This week only. Use code SAVE20 at checkout.", cta: "Shop now", destination: { type: "website", url: `${STORE}/store/products/ridge-trail-shoe` } },
    { outDir: out, maxTurns: 6, agentCheckout: false },
  );
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.assertions.length, 1);
  assert.ok(result.steps.length >= 3, "funnel steps recorded");
  // The product page never shows "This code has expired.", so the quote check must downgrade the verdict.
  assert.equal(result.verdicts[0].status, "unresolved");
  assert.equal(result.verdicts[0].downgraded, true);
  assert.equal(result.overall, "unresolved");
  assert.ok(result.usage.usd > 0);
  const report = writeReport(result, dir);
  assert.ok(fs.statSync(report).size > 10_000);
  assert.ok(fs.existsSync(path.join(dir, "log.jsonl")));
  assert.ok(fs.existsSync(path.join(dir, "shots", "001.jpg")));
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
});

test("pipeline: the agent checkouts (UCP and ACP) supply the proof the web pages lacked", async () => {
  await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"code_expired"}' });
  const { runTest } = await import("../src/core/run.ts");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-"));
  try {
    const { result } = await runTest(
      { source: "manual", headline: "20% off the Ridge trail shoe.", text: "This week only. Use code SAVE20 at checkout.", cta: "Shop now", destination: { type: "website", url: `${STORE}/store/products/ridge-trail-shoe` } },
      { outDir: out, maxTurns: 6, acp: { endpoint: `${STORE}/api/acp`, key: "alder-trail-demo" } },
    );
    assert.ok(result.steps.some((s) => s.url?.startsWith("ucp://")), "agent checkout step recorded");
    assert.ok(result.steps.some((s) => s.url?.startsWith("acp://")), "ACP checkout step recorded");
    assert.equal(result.verdicts[0].status, "contradicted");
    assert.equal(result.overall, "fail");
  } finally {
    await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"scenario":"baseline"}' });
  }
});
