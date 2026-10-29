import fs from "node:fs/promises";
import path from "node:path";
import { getRun } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === "sample") {
    const raw = await fs.readFile(path.join(process.cwd(), "src/fixtures/sample-run.json"), "utf8").catch(() => null);
    return raw ? new Response(raw, { headers: { "content-type": "application/json" } }) : new Response("not found", { status: 404 });
  }
  const run = await getRun(id).catch(() => null);
  return run ? Response.json(run) : Response.json({ error: "not found" }, { status: 404 });
}
