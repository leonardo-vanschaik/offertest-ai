import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { demo, RECORDINGS, recheck, sha256, verify, type Manifest } from "../src/demo.ts";
import type { RunResult } from "../src/types.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "offertest-demo-"));
const recordings = fs.readdirSync(RECORDINGS).filter((d) => fs.existsSync(path.join(RECORDINGS, d, "recording.json"))).sort();
const read = <T>(f: string) => JSON.parse(fs.readFileSync(f, "utf8")) as T;

// demo() prints to the terminal; keep the test output clean.
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const log = console.log;
  const error = console.error;
  console.log = console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
}

// A copy of one recording that a test may change.
function copy(name: string): string {
  const root = tmp();
  fs.cpSync(path.join(RECORDINGS, name), path.join(root, name), { recursive: true });
  return path.join(root, name);
}

test("the shipped recordings tell the demo story: a failing ad, then its passing re-test with a test purchase", () => {
  assert.equal(recordings.length, 2);
  const [before, after] = recordings.map((d) => read<RunResult>(path.join(RECORDINGS, d, "result.json")));
  assert.equal(before.overall, "fail");
  assert.ok(before.fix, "the failing run proposes a fix");
  assert.equal(after.overall, "pass");
  assert.equal(after.retestOf, before.id);
  assert.match(after.confirmation?.text ?? "", /Order AT-\d+ is confirmed/);
  for (const r of [before, after]) assert.match(r.models["computer use, judge, fix"], /^muse-wonder/);
});

test("offertest demo replays every recording with no key and writes a report marked as a recorded run", async () => {
  const out = tmp();
  const before = process.env.META_API_KEY;
  delete process.env.META_API_KEY;
  try {
    assert.equal(await quiet(() => demo({ out, json: true })), 0);
  } finally {
    if (before !== undefined) process.env.META_API_KEY = before;
  }
  for (const d of recordings) {
    const id = read<RunResult>(path.join(RECORDINGS, d, "result.json")).id;
    const html = fs.readFileSync(path.join(out, "demo", id, "report.html"), "utf8");
    assert.match(html, /Recorded run, replayed/);
    assert.equal(read<RunResult>(path.join(out, "demo", id, "result.json")).replay?.files, Object.keys(read<Manifest>(path.join(RECORDINGS, d, "recording.json")).files).length);
  }
});

test("a recording whose page text changed after it was recorded is refused", async () => {
  const dir = copy(recordings[0]);
  const page = path.join(dir, "pages", fs.readdirSync(path.join(dir, "pages"))[0]);
  fs.appendFileSync(page, "\nSAVE20 applied: -$24.00");
  assert.throws(() => verify(dir, read<Manifest>(path.join(dir, "recording.json"))), /changed after it was recorded/);
  assert.equal(await quiet(() => demo({ out: tmp(), dir: path.dirname(dir), json: true })), 3);
});

test("the quote check runs again: a verdict quote that is not in the pages fails the replay, even with new hashes", () => {
  const dir = copy(recordings[0]);
  const file = path.join(dir, "result.json");
  const r = read<RunResult>(file);
  r.verdicts[0].pageQuote = "SAVE20 applied: -$24.00"; // never shown by the failing store
  fs.writeFileSync(file, JSON.stringify(r, null, 2));
  const m = read<Manifest>(path.join(dir, "recording.json"));
  m.files["result.json"] = sha256(file);
  verify(dir, m);
  assert.throws(() => recheck(dir, r), /quote check for a1 does not give the recorded answer/);
});
