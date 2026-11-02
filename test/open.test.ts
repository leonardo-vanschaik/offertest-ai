import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { extractAssertions } from "../src/core/assertions.ts";
import { writeReport } from "../src/report/html.ts";
import type { RunResult } from "../src/types.ts";

const PROMISES = JSON.stringify({
  assertions: [{ kind: "discount", claim: "Code SAVE20 gives 20% off the Ridge trail shoe", adQuote: "Use code SAVE20 at checkout", card: null, conditions: [{ key: "code", value: "SAVE20" }, { key: "percent", value: "20%" }] }],
  subject: "shoe",
  imageText: "",
});

// A stand-in for OpenRouter (Muse Spark Open) and the Meta Model API (Muse Spark) on one port, for the whole file:
// the Meta client is made once per process. Each test sets the replies OpenRouter gives.
type OpenReply = string | number | { content: string; provider: string };
async function fakeApis() {
  const open: Record<string, unknown>[] = [];
  const spark: Record<string, unknown>[] = [];
  const replies: OpenReply[] = [];
  let sparkBroken = false;
  const srv = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const send = (status: number, json: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url === "/openrouter/models/meta/muse-spark-open/endpoints")
      return send(200, { data: { endpoints: [{ provider_name: "BaseTen", quantization: "fp4" }, { provider_name: "Fireworks", quantization: "unknown" }] } });
    if (req.url === "/openrouter/chat/completions") {
      open.push(JSON.parse(body));
      const reply = replies.shift() ?? 500;
      if (typeof reply === "number") return send(reply, { error: { message: "provider unavailable" } });
      const { content, provider } = typeof reply === "string" ? { content: reply, provider: "BaseTen" } : reply;
      return send(200, {
        id: `gen-${open.length}`,
        provider,
        model: "meta/muse-spark-open",
        choices: [{ message: { role: "assistant", content } }],
        usage: { prompt_tokens: 900, completion_tokens: 300, cost: 0.0024 },
      });
    }
    if (req.url === "/meta/chat/completions") {
      const { model } = JSON.parse(body) as { model: string };
      spark.push(JSON.parse(body));
      const content = sparkBroken && model === "muse-spark-1.3" ? "not json" : PROMISES;
      return send(200, { id: "x", object: "chat.completion", created: 0, model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } });
    }
    send(404, { error: { message: "not found" } });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const saved = { ...process.env };
  const env = { OPENROUTER_API_KEY: "test-openrouter", OPENROUTER_BASE_URL: `${url}/openrouter`, META_API_KEY: "test-meta", META_BASE_URL: `${url}/meta` };
  return {
    open,
    spark,
    reset(openReplies: OpenReply[], opts: { sparkBroken?: boolean } = {}) {
      open.length = spark.length = 0;
      sparkBroken = !!opts.sparkBroken;
      replies.splice(0, replies.length, ...openReplies);
      Object.assign(process.env, env);
    },
    close() {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      srv.close();
    },
  };
}

const apis = await fakeApis();
after(() => apis.close());
beforeEach(() => apis.reset([]));

function run(imageUrl?: string): RunResult {
  return {
    schemaVersion: 1,
    tool: { name: "offertest", version: "0.1.0" },
    id: "20261102000000-abcdef",
    createdAt: "2026-11-02T00:00:00.000Z",
    ad: { source: "manual", headline: "20% off the Ridge trail shoe.", text: "This week only. Use code SAVE20 at checkout.", cta: "Shop now", imageUrl, destination: { type: "website", url: "http://localhost:3000/store/products/ridge-trail-shoe" } },
    assertions: [],
    steps: [],
    verdicts: [],
    boundary: "Not tested",
    models: {},
    usage: { inputTokens: 0, outputTokens: 0, images: 0, usd: 0 },
  };
}

test("with an OpenRouter key, Muse Spark Open reads the promises on a hackathon partner, and the run records where and how", async () => {
  apis.reset([PROMISES]);
  const r = run("data:image/png;base64,iVBORw0KGgo=");
  const out = await extractAssertions(r);
  assert.equal(out.assertions[0].conditions.code, "SAVE20");
  assert.equal(apis.spark.length, 0, "Muse Spark is not called");
  const req = apis.open[0] as { model: string; provider: { order: string[]; allow_fallbacks: boolean }; messages: { role: string; content: unknown }[] };
  assert.equal(req.model, "meta/muse-spark-open");
  assert.deepEqual(req.provider, { order: ["baseten", "fireworks", "modal"], allow_fallbacks: false }, "only the hackathon's inference partners");
  assert.match(String(req.messages[0].content), /matches this JSON schema/);
  assert.ok(JSON.stringify(req.messages[1].content).includes("data:image/png;base64,iVBORw0KGgo="), "the ad image goes along");
  assert.equal(r.models["ad to promises"], "meta/muse-spark-open");
  assert.deepEqual(r.openWeights, {
    job: "ad to promises",
    model: "meta/muse-spark-open",
    route: "OpenRouter",
    provider: "BaseTen",
    quantization: "fp4",
    requests: [{ id: "gen-1", provider: "BaseTen", quantization: "fp4", inputTokens: 900, outputTokens: 300, usd: 0.0024, accepted: true }],
    ms: r.openWeights!.ms,
    inputTokens: 900,
    outputTokens: 300,
    usd: 0.0024,
  });
  assert.equal(r.usage.usd, 0.0024, "the cost counts in the run's total");
  const html = fs.readFileSync(writeReport(r, fs.mkdtempSync(path.join(os.tmpdir(), "offertest-open-"))), "utf8");
  assert.match(html, /Muse Spark Open read the ad's promises through OpenRouter: request <span class="mono">gen-1<\/span> on BaseTen \(fp4\)\./);
});

test("an answer that does not match the schema gets one more try, and each request keeps its own provider", async () => {
  apis.reset([{ content: "Here are the promises: {", provider: "Fireworks" }, PROMISES]);
  const r = run();
  assert.equal((await extractAssertions(r)).assertions.length, 1);
  assert.deepEqual(
    r.openWeights?.requests.map((q) => [q.id, q.provider, q.quantization, q.accepted]),
    [
      ["gen-1", "Fireworks", "not published by the provider", false],
      ["gen-2", "BaseTen", "fp4", true],
    ],
  );
  assert.equal(r.openWeights?.provider, "BaseTen", "the provider of the answer that was used");
  const html = fs.readFileSync(writeReport(r, fs.mkdtempSync(path.join(os.tmpdir(), "offertest-open-"))), "utf8");
  assert.match(html, /Not used: <span class="mono">gen-1<\/span> on Fireworks/);
});

test("if Muse Spark Open fails, Muse Spark reads the promises, and the run says so", async () => {
  apis.reset([503, 503]);
  const r = run();
  assert.equal((await extractAssertions(r)).assertions.length, 1);
  assert.equal(apis.spark.length, 1);
  assert.equal(r.models["ad to promises"], "muse-spark-1.3");
  assert.match(r.openWeights?.fallback ?? "", /Muse Spark Open did not return valid ad to promises after 2 tries: .*provider unavailable/);
});

test("if Muse Spark fails too, the run names Muse Wonder, the model whose answer was used", async () => {
  apis.reset([503, 503], { sparkBroken: true });
  const r = run();
  assert.equal((await extractAssertions(r)).assertions.length, 1);
  assert.equal(r.models["ad to promises"], "muse-wonder-1.0");
});

test("the provider order can come from a .env file", async () => {
  apis.reset([PROMISES]);
  const cwd = process.cwd();
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "offertest-env-")));
  fs.writeFileSync(".env", "OFFERTEST_SPARK_OPEN_PROVIDERS=fireworks\n");
  try {
    await extractAssertions(run());
    assert.deepEqual((apis.open[0] as { provider: { order: string[] } }).provider.order, ["fireworks"]);
  } finally {
    process.chdir(cwd);
    delete process.env.OFFERTEST_SPARK_OPEN_PROVIDERS;
  }
});

test("without an OpenRouter key, Muse Spark reads the promises (only the Meta key is needed)", async () => {
  process.env.OPENROUTER_API_KEY = "";
  const r = run();
  await extractAssertions(r);
  assert.equal(apis.open.length, 0);
  assert.equal(r.models["ad to promises"], "muse-spark-1.3");
  assert.equal(r.openWeights, undefined);
});
