import { readLog } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === "sample") return Response.json([]);
  return Response.json(await readLog(id).catch(() => []));
}
