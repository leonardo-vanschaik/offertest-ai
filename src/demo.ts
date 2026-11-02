// `offertest demo`: replays real runs that the CLI recorded with Meta's models. No key, no cost, no store.
// A recording is a run folder the CLI wrote (result.json, log.jsonl, shots/, pages/) plus recording.json:
// the command that made it, the code commit, and the SHA-256 of every file.
// The replay checks every hash, prints the run step by step as it happened, runs the quote check again on
// the recorded pages, and writes a new report with the current report code.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adText, containsQuote, overallOf } from "./core/quotes.ts";
import { c, dest, printResult } from "./print.ts";
import { writeReport } from "./report/html.ts";
import type { RunResult } from "./types.ts";

// src/demo.ts and dist/cli.mjs are both one level under the package root.
export const RECORDINGS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../examples/recordings");

export type Manifest = {
  intro: string; // one line the demo prints before this run
  command: string;
  store: string; // what the store looked like
  recordedAt: string;
  commit: string;
  files: Record<string, string>; // relative path -> SHA-256
};

export function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Every file the manifest lists must be there, byte for byte.
export function verify(dir: string, m: Manifest): void {
  for (const [rel, want] of Object.entries(m.files)) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) throw new Error(`Recording ${path.basename(dir)} is missing ${rel}.`);
    if (sha256(file) !== want) throw new Error(`Recording ${path.basename(dir)}: ${rel} changed after it was recorded (SHA-256 does not match).`);
  }
}

// The quote check, again, on the recorded pages: each verdict's quotes must exist word for word, exactly as
// the run found them, and the verdicts must give the same overall result.
export function recheck(dir: string, r: RunResult): { checked: number } {
  const pages = path.join(dir, "pages");
  const evidence = fs.existsSync(pages) ? fs.readdirSync(pages).map((f) => fs.readFileSync(path.join(pages, f), "utf8")) : [];
  const ad = adText(r.ad);
  for (const v of r.verdicts) {
    const adFound = !!v.adQuote && containsQuote(ad, v.adQuote);
    const pageFound = !!v.pageQuote && evidence.some((t) => containsQuote(t, v.pageQuote!));
    if (adFound !== v.quoteCheck.adQuoteFound || pageFound !== v.quoteCheck.pageQuoteFound)
      throw new Error(`Recording ${path.basename(dir)}: the quote check for ${v.assertionId} does not give the recorded answer.`);
  }
  if (overallOf(r.verdicts) !== r.overall) throw new Error(`Recording ${path.basename(dir)}: the verdicts do not give the recorded result.`);
  return { checked: r.verdicts.length };
}

type Event = { at: string; type: string; phase?: string; n?: number; summary?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function replay(dir: string, opts: { out: string; quiet: boolean; paced: boolean }): Promise<{ result: RunResult; report: string }> {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "recording.json"), "utf8")) as Manifest;
  verify(dir, m);
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8")) as RunResult;
  const events = fs
    .readFileSync(path.join(dir, "log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Event);
  const say = (s: string) => !opts.quiet && console.log(s);

  say(`\n${c.bold(m.intro)}`);
  say(c.dim(`Recorded ${m.recordedAt.slice(0, 16).replace("T", " ")} UTC with ${Object.values(r.models).join(", ")} · store: ${m.store}`));
  say(c.dim(`$ ${m.command}`));
  say(`\n${c.bold("OfferTest")} "${r.ad.headline}" -> ${dest(r.ad)}`);

  // The run as it happened, about 12 seconds per run however long it took.
  const t = (e: Event) => Date.parse(e.at);
  const span = Math.max(1, t(events[events.length - 1]) - t(events[0]));
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (opts.paced && i) await sleep(Math.min(1200, ((t(e) - t(events[i - 1])) * 12_000) / span));
    if (e.type === "phase") say(`${c.blue("●")} ${e.phase}`);
    else if (e.type === "step") say(c.dim(`  ${String(e.n).padStart(2)} ${e.summary}`));
  }

  const { checked } = recheck(dir, r);
  const quoteCheck = `${checked} of ${checked} verdicts: both quotes found word for word in the recorded ad and pages`;
  say(`${c.blue("●")} Quote check, run again on this computer: ${quoteCheck}`);

  // A copy of the run with a new report, so the recording itself never changes.
  const to = path.resolve(opts.out, "demo", r.id);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(dir, to, { recursive: true, filter: (f) => !/recording\.json$|report\.html$/.test(f) });
  const result: RunResult = {
    ...r,
    replay: { recordedAt: m.recordedAt, command: m.command, commit: m.commit, files: Object.keys(m.files).length, quoteCheck },
  };
  fs.writeFileSync(path.join(to, "result.json"), JSON.stringify(result, null, 2));
  const report = writeReport(result, to);
  if (!opts.quiet) printResult(result, report);
  return { result, report };
}

export async function demo(o: { out: string; json?: boolean; fast?: boolean; open?: boolean; dir?: string }): Promise<number> {
  const root = o.dir ?? RECORDINGS;
  const dirs = fs.existsSync(root)
    ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "recording.json"))).sort().map((d) => path.join(root, d))
    : [];
  if (!dirs.length) {
    console.error(c.red(`No recordings found in ${root}.`));
    return 3;
  }
  const tty = !!process.stdout.isTTY && !o.json;
  if (!o.json) {
    console.log(c.bold("OfferTest demo"));
    console.log("Real runs, recorded with Meta's models against the sample store, replayed on your computer. No key, no cost.");
  }
  const done: { result: RunResult; report: string }[] = [];
  try {
    for (const d of dirs) done.push(await replay(d, { out: o.out, quiet: !!o.json, paced: tty && !o.fast }));
  } catch (e) {
    console.error(c.red(e instanceof Error ? e.message : String(e)));
    return 3;
  }
  if (o.json) {
    console.log(JSON.stringify(done.map(({ result, report }) => ({ id: result.id, overall: result.overall, retestOf: result.retestOf, report, replay: result.replay })), null, 2));
    return 0;
  }
  console.log(`\n${c.bold("Reports")}`);
  for (const { result, report } of done) console.log(`  ${result.overall?.toUpperCase().padEnd(5)} ${report}`);
  console.log(`\nRun it live with your own Meta Model API key: ${c.bold("npx offertest init")}, then the sample store test in README.md.`);
  if (tty && o.open !== false) openFile(done[0].report);
  return 0;
}

function openFile(file: string) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
  try {
    spawn(cmd, args as string[], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {
    // no browser to open: the path is printed above
  }
}
