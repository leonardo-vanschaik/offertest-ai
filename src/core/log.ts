import fs from "node:fs";
import path from "node:path";
import type { RunResult, Step } from "../types.ts";

// One folder per run: result.json, log.jsonl (append-only), shots/NNN.jpg, pages/NNN.txt
export class RunLog {
  readonly dir: string;
  constructor(
    readonly result: RunResult,
    outDir: string,
  ) {
    this.dir = path.resolve(outDir, result.id);
    fs.mkdirSync(path.join(this.dir, "shots"), { recursive: true });
    fs.mkdirSync(path.join(this.dir, "pages"), { recursive: true });
  }

  async event(e: Record<string, unknown>) {
    fs.appendFileSync(path.join(this.dir, "log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
  }

  async step(s: Omit<Step, "n" | "at">, jpg?: Buffer, pageText?: string): Promise<Step> {
    const step: Step = { n: this.result.steps.length + 1, at: new Date().toISOString(), ...s };
    const id = String(step.n).padStart(3, "0");
    if (jpg) {
      step.screenshot = `shots/${id}.jpg`;
      fs.writeFileSync(path.join(this.dir, step.screenshot), jpg);
    }
    if (pageText !== undefined) fs.writeFileSync(path.join(this.dir, "pages", `${id}.txt`), pageText);
    this.result.steps.push(step);
    await this.event({ type: "step", ...step });
    this.save();
    return step;
  }

  save() {
    fs.writeFileSync(path.join(this.dir, "result.json"), JSON.stringify(this.result, null, 2));
  }

  read(rel: string): Buffer {
    return fs.readFileSync(path.join(this.dir, rel));
  }
}
