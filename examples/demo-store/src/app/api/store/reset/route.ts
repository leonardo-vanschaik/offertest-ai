import { cookies } from "next/headers";
import { resetStore } from "@/lib/store";
import { CART_COOKIE } from "@/lib/store/cart-cookie";

export async function POST() {
  const config = await resetStore();
  (await cookies()).delete(CART_COOKIE);
  return Response.json(config);
}
