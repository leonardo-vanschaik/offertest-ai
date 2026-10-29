import { cookies } from "next/headers";
import type { Cart, CartItem } from "@/lib/types";
import { getCartEpoch } from "./state";

// Cart lives in the "at_cart" cookie as JSON: { e: epoch, items, couponCode }.
// A cart whose epoch is older than the store's cartEpoch (scenario switch or reset) is empty.

export const CART_COOKIE = "at_cart";

type CookieCart = { e: number; items: CartItem[]; couponCode?: string };

export function emptyCart(): Cart {
  return { items: [] };
}

function parse(raw: string | undefined, epoch: number): Cart {
  if (!raw) return emptyCart();
  try {
    const v = JSON.parse(raw) as CookieCart;
    if (!v || v.e !== epoch || !Array.isArray(v.items)) return emptyCart();
    const items = v.items
      .filter(
        (i) =>
          i &&
          typeof i.productId === "string" &&
          typeof i.variantId === "string" &&
          Number.isFinite(i.qty) &&
          i.qty > 0,
      )
      .map((i) => ({ productId: i.productId, variantId: i.variantId, qty: Math.min(99, Math.floor(i.qty)) }));
    return { items, couponCode: typeof v.couponCode === "string" && v.couponCode ? v.couponCode : undefined };
  } catch {
    return emptyCart();
  }
}

export async function readCart(): Promise<Cart> {
  const jar = await cookies();
  return parse(jar.get(CART_COOKIE)?.value, getCartEpoch());
}

/** Only callable from Server Actions or Route Handlers. */
export async function writeCart(cart: Cart): Promise<void> {
  const jar = await cookies();
  const value: CookieCart = { e: getCartEpoch(), items: cart.items, couponCode: cart.couponCode };
  jar.set(CART_COOKIE, JSON.stringify(value), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearCart(): Promise<void> {
  const jar = await cookies();
  jar.delete(CART_COOKIE);
}
