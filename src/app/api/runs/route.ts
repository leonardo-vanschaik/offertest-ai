import { z } from "zod";
import { startRun } from "@/lib/agent/run";
import { listRuns } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  ad: z.object({
    headline: z.string().min(1).max(300),
    text: z.string().max(2000),
    cta: z.string().max(60).default("Shop now"),
    imageUrl: z.string().max(8_000_000).optional(),
    runsUntil: z.string().optional(),
  }),
  landingUrl: z.string().url(),
  allowPayment: z.boolean().default(false),
  mode: z.enum(["agent", "one_call"]).optional(),
});

export async function GET() {
  return Response.json(await listRuns());
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const run = await startRun(parsed.data);
  return Response.json({ id: run.id });
}
