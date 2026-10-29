import { connection } from "next/server";
import { listOrders } from "@/lib/store";

export async function GET() {
  await connection();
  return Response.json(listOrders());
}
