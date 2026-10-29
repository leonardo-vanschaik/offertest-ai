import { decideApproval } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; approvalId: string }> }) {
  const { id, approvalId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { decision?: string } | null;
  if (body?.decision !== "approved" && body?.decision !== "declined")
    return Response.json({ error: "decision must be approved or declined" }, { status: 400 });
  const a = await decideApproval(id, approvalId, body.decision).catch(() => null);
  return a ? Response.json(a) : Response.json({ error: "not found" }, { status: 404 });
}
