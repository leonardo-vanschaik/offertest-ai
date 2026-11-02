import { connection } from "next/server";
import { getOrder } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const order = await getOrder(id);
  if (!order) return Response.json({ error: `Order ${id} not found` }, { status: 404 });
  return Response.json(order);
}
