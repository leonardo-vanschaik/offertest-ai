import { cookies } from "next/headers";
import { resetStore } from "@/lib/store";
import { adminDenied } from "@/lib/store/admin";
import { CART_COOKIE } from "@/lib/store/cart-cookie";

export async function POST(req: Request) {
  const denied = adminDenied(req);
  if (denied) return denied;
  const config = await resetStore();
  (await cookies()).delete(CART_COOKIE);
  return Response.json(config);
}
