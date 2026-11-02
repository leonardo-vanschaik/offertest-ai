// Turn a run folder that `offertest check` wrote into a recording for `offertest demo`.
// node --import tsx examples/recordings/make.ts <run dir> <name> --intro "..." --command "..." --store "..." [--out <dir>]
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { sha256, type Manifest } from "../../src/demo.ts";
import type { RunResult } from "../../src/types.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { intro: { type: "string" }, command: { type: "string" }, store: { type: "string" }, out: { type: "string" } },
});
const [run, name] = positionals;
if (!run || !name || !values.intro || !values.command || !values.store) {
  console.error('Usage: make.ts <run dir> <name> --intro "..." --command "..." --store "..."');
  process.exit(4);
}

const to = path.resolve(values.out ?? import.meta.dirname, name);
fs.rmSync(to, { recursive: true, force: true });
// The run as the CLI wrote it. The report is left out: the demo writes a new one.
fs.cpSync(run, to, { recursive: true, filter: (f) => !/report\.html$/.test(f) });

const files: Record<string, string> = {};
const walk = (d: string) => {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files[path.relative(to, p)] = sha256(p);
  }
};
walk(to);

const r = JSON.parse(fs.readFileSync(path.join(to, "result.json"), "utf8")) as RunResult;
const m: Manifest = {
  intro: values.intro,
  command: values.command,
  store: values.store,
  recordedAt: r.createdAt,
  commit: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
  files,
};
fs.writeFileSync(path.join(to, "recording.json"), JSON.stringify(m, null, 2) + "\n");
console.log(`${to}: ${Object.keys(files).length} files, ${r.overall}`);
