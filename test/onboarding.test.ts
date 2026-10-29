import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModelKey } from "../src/onboarding.ts";

async function withFetch(responses: Record<string, number>, fn: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const path = new URL(String(url)).pathname.replace("/v1", "");
    return new Response(JSON.stringify({ data: [{ id: "muse-wonder-1.0" }] }), { status: responses[path] ?? 500 });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("a rejected key is not ok", () =>
  withFetch({ "/models": 401 }, async () => {
    const r = await checkModelKey("k");
    assert.equal(r.ok, false);
    assert.equal(r.inconclusive, undefined);
  }));

test("a working key lists Muse Wonder", () =>
  withFetch({ "/models": 200 }, async () => {
    const r = await checkModelKey("k");
    assert.equal(r.ok, true);
    assert.match(r.detail, /Muse Wonder/);
  }));

test("no /models endpoint: a one-token call decides", async () => {
  await withFetch({ "/models": 404, "/chat/completions": 200 }, async () => assert.equal((await checkModelKey("k")).ok, true));
  await withFetch({ "/models": 404, "/chat/completions": 401 }, async () => assert.equal((await checkModelKey("k")).ok, false));
});

test("rate limits and outages are inconclusive, never 'accepted'", async () => {
  for (const status of [429, 500, 503]) {
    await withFetch({ "/models": status }, async () => {
      const r = await checkModelKey("k");
      assert.equal(r.ok, false);
      assert.equal(r.inconclusive, true);
    });
  }
});
