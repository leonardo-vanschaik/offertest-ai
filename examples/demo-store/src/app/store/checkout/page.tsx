import type { Metadata } from "next";
import Link from "next/link";
import { getConfig, priceCart } from "@/lib/store";
import { readCart } from "@/lib/store/cart-cookie";
import { formatCents } from "@/lib/types";
import { Totals } from "../_components/Totals";
import { btnPrimary, card, container, serif } from "../_components/ui";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const cart = await readCart();
  const config = getConfig();
  const priced = priceCart(config, cart);

  if (priced.lines.length === 0) {
    return (
      <div className={`${container} pt-12`}>
        <h1 className={`${serif} text-[40px] font-semibold tracking-tight`}>Checkout</h1>
        <div className={`${card} mt-8 p-10 text-center`}>
          <p className="text-[18px]">Your cart is empty.</p>
          <Link href="/store#shop" className={`${btnPrimary} mt-6`}>Continue shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${container} pt-6`}>
      <p className="rounded-md border border-[#D9CFA8] bg-[#FBF6E3] px-4 py-2 text-[14px] text-[#5C4F1E]">
        <span className="font-semibold">Test mode.</span> Use card 4242 4242 4242 4242. No real money moves.
      </p>
      <div className="mt-5 flex items-baseline justify-between">
        <h1 className={`${serif} text-[36px] font-semibold tracking-tight`}>Checkout</h1>
        <Link href="/store/cart" className="text-[15px] font-medium underline underline-offset-4">
          Back to cart
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_400px] items-start gap-10">
        <CheckoutForm />
        <aside className={`${card} p-6`}>
          <h2 className="text-[20px] font-semibold">Order summary</h2>
          <ul className="mt-4 space-y-3 border-b border-[#E2DCCF] pb-4">
            {priced.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-4 text-[15px]">
                <span>
                  <span className="font-semibold">{l.name}</span>
                  <span className="block text-[#5F655F]">
                    {l.variantLabel} · Qty {l.qty}
                  </span>
                </span>
                <span className="tabular-nums">{formatCents(l.lineCents)}</span>
              </li>
            ))}
          </ul>
          {priced.couponMessage && (
            <p
              data-testid="coupon-message"
              className={`mt-4 text-[15px] font-semibold ${priced.couponApplied ? "text-[#2F6B3F]" : "text-[#A63A2B]"}`}
            >
              {priced.couponMessage}
            </p>
          )}
          <div className="mt-4">
            <Totals priced={priced} />
          </div>
        </aside>
      </div>
    </div>
  );
}
