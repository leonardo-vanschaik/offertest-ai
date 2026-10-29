import { test } from "node:test";
import assert from "node:assert/strict";
import { serve } from "../src/server.ts";

test("server refuses actions from other extensions and web pages", async () => {
  const port = 7791;
  await serve(port);
  const post = (origin?: string) =>
    fetch(`http://127.0.0.1:${port}/ads/123/pause`, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: "{}" });
  assert.equal((await post("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).status, 403);
  assert.equal((await post("https://evil.example")).status, 403);
  assert.equal((await post()).status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  process.exit(0); // serve() keeps the server open
});
