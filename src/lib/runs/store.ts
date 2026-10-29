import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Approval, Run, Step } from "@/lib/types";

// Runs live on disk: runs/<id>/run.json, runs/<id>/log.jsonl (append-only), runs/<id>/shots/*.jpg
export const RUNS_DIR = path.join(process.cwd(), "runs");

export function newRunId(): string {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${stamp}-${randomUUID().slice(0, 6)}`;
}

function runDir(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error("bad run id");
  return path.join(RUNS_DIR, id);
}

export function shotPath(id: string, file: string) {
  if (!/^[\w.-]+$/.test(file)) throw new Error("bad file");
  return path.join(runDir(id), "shots", file);
}

export async function saveRun(run: Run): Promise<void> {
  const dir = runDir(run.id);
  // The API route writes approval decisions to disk while the runner holds the run in memory.
  // A decision on disk always wins over a stale "pending" in memory.
  const onDisk = await getRun(run.id);
  for (const a of onDisk?.approvals ?? []) {
    const mine = run.approvals.find((x) => x.id === a.id);
    if (mine && mine.status === "pending" && a.status !== "pending") Object.assign(mine, a);
  }
  await fs.mkdir(path.join(dir, "shots"), { recursive: true });
  const tmp = path.join(dir, `run.json.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(run, null, 2));
  await fs.rename(tmp, path.join(dir, "run.json"));
}

export async function getRun(id: string): Promise<Run | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(runDir(id), "run.json"), "utf8")) as Run;
  } catch {
    return null;
  }
}

export async function listRuns(): Promise<Run[]> {
  let ids: string[] = [];
  try {
    ids = await fs.readdir(RUNS_DIR);
  } catch {
    return [];
  }
  const runs = await Promise.all(ids.map((id) => getRun(id).catch(() => null)));
  return runs
    .filter((r): r is Run => !!r)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendLog(id: string, event: Record<string, unknown>): Promise<void> {
  const dir = runDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(
    path.join(dir, "log.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n",
  );
}

export async function readLog(id: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await fs.readFile(path.join(runDir(id), "log.jsonl"), "utf8");
    return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function saveShot(id: string, n: number, jpg: Buffer): Promise<string> {
  const file = `${String(n).padStart(3, "0")}.jpg`;
  await fs.mkdir(path.join(runDir(id), "shots"), { recursive: true });
  await fs.writeFile(shotPath(id, file), jpg);
  return `/api/runs/${id}/shots/${file}`;
}

export function pushStep(run: Run, step: Omit<Step, "n" | "at">): Step {
  const s: Step = { n: run.steps.length + 1, at: new Date().toISOString(), ...step };
  run.steps.push(s);
  return s;
}

// Approval decisions are written by the API route and read by the runner.
export async function decideApproval(
  id: string,
  approvalId: string,
  decision: "approved" | "declined",
): Promise<Approval | null> {
  const run = await getRun(id);
  if (!run) return null;
  const a = run.approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== "pending") return a ?? null;
  a.status = decision;
  a.decidedAt = new Date().toISOString();
  await saveRun(run);
  await appendLog(id, { type: "approval_decided", approvalId, kind: a.kind, decision });
  return a;
}
