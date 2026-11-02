import { connection } from "next/server";
import { listOrders } from "@/lib/store";
import { adminDenied } from "@/lib/store/admin";

// Every order, newest first. Admin only on the public demo. Orders hold no full contact data (see createOrder).
export async function GET(req: Request) {
  await connection();
  const denied = adminDenied(req);
  if (denied) return denied;
  return Response.json(await listOrders());
}
