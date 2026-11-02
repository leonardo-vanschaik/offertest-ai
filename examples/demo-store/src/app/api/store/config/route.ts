import { connection } from "next/server";
import { getConfig } from "@/lib/store";

export async function GET() {
  await connection();
  return Response.json(await getConfig());
}
