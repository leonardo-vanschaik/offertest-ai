import type { Metadata } from "next";
import Link from "next/link";
import { getConfig, priceCart } from "@/lib/store";
import { readCart } from "@/lib/store/cart-cookie";
import { formatCents } from "@/lib/types";
import { applyCode, removeCode, removeLine, setQty } from "../actions";
import { Totals } from "../_components/Totals";
import { btnPrimary, btnSecondary, card, container, input, serif } from "../_components/ui";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage() {
  const cart = await readCart();
  const config = getConfig();
  const priced = priceCart(config, cart);

  if (priced.lines.length === 0) {
    return (
      <div className={`${container} pt-12`}>
        <h1 className={`${serif} text-[40px] font-semibold tracking-tight`}>Your cart</h1>
        <div className={`${card} mt-8 p-10 text-center`}>
          <p className="text-[18px]">Your cart is empty.</p>
          <Link href="/store#shop" className={`${btnPrimary} mt-6`}>Continue shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${container} pt-10`}>
      <h1 className={`${serif} text-[40px] font-semibold tracking-tight`}>Your cart</h1>
      <div className="mt-6 grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_400px]">
        <ul className={`${card} divide-y divide-[#E2DCCF]`}>
          {priced.lines.map((l) => {
            const p = config.products.find((x) => x.id === l.productId)!;
            return (
              <li key={l.variantId} className="flex gap-5 p-5">
                <Link href={`/store/products/${p.slug}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={l.name} className="h-[104px] w-[104px] rounded-md border border-[#E2DCCF] bg-[#ECE6D9]" />
                </Link>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link href={`/store/products/${p.slug}`} className="text-[18px] font-semibold hover:underline">
                        {l.name}
                      </Link>
                      <p className="mt-1 text-[15px] text-[#5F655F]">
                        {p.color} · {l.variantLabel}
                      </p>
                      <p className="mt-1 text-[15px] text-[#5F655F]">{formatCents(l.unitCents)} each</p>
                    </div>
                    <p className="text-[18px] font-semibold tabular-nums">{formatCents(l.lineCents)}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-4 pt-3">
                    <div className="flex items-center rounded-md border border-[#C9C2B3] bg-white">
                      <form action={setQty}>
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <input type="hidden" name="qty" value={l.qty - 1} />
                        <button type="submit" aria-label={`Decrease quantity of ${l.name}`} className="h-10 w-10 text-[20px] font-semibold hover:bg-[#F1EEE6]">
                          −
                        </button>
                      </form>
                      <span className="w-10 text-center text-[16px] font-semibold tabular-nums" aria-label="Quantity">
                        {l.qty}
                      </span>
                      <form action={setQty}>
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <input type="hidden" name="qty" value={l.qty + 1} />
                        <button type="submit" aria-label={`Increase quantity of ${l.name}`} className="h-10 w-10 text-[20px] font-semibold hover:bg-[#F1EEE6]">
                          +
                        </button>
                      </form>
                    </div>
                    <form action={removeLine}>
                      <input type="hidden" name="variantId" value={l.variantId} />
                      <button type="submit" className="h-10 px-2 text-[15px] font-medium text-[#1E2420] underline underline-offset-4 hover:text-[#A63A2B]">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className={`${card} p-6`}>
          <h2 className="text-[20px] font-semibold">Order summary</h2>
          <form action={applyCode} className="mt-5">
            <label htmlFor="code" className="mb-1.5 block text-[14px] font-semibold">
              Discount code
            </label>
            <div className="flex gap-2">
              <input
                id="code"
                name="code"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Enter code"
                defaultValue={priced.couponCode ?? ""}
                className={`${input} uppercase placeholder:normal-case`}
              />
              <button type="submit" className={`${btnSecondary} h-12 shrink-0`}>
                Apply
              </button>
            </div>
          </form>
          {priced.couponMessage && (
            <div
              role="status"
              data-testid="coupon-message"
              className={`mt-3 flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-[15px] font-semibold ${
                priced.couponApplied
                  ? "border-[#BFD6C4] bg-[#EAF3EC] text-[#2F6B3F]"
                  : "border-[#E7C3BB] bg-[#FBEDEA] text-[#A63A2B]"
              }`}
            >
              <span>{priced.couponMessage}</span>
              <form action={removeCode}>
                <button type="submit" className="text-[13px] font-medium text-[#4A504A] underline underline-offset-2">
                  Remove code
                </button>
              </form>
            </div>
          )}
          <div className="mt-6">
            <Totals priced={priced} />
          </div>
          <Link href="/store/checkout" className={`${btnPrimary} mt-6 w-full`}>
            Checkout
          </Link>
          <Link href="/store#shop" className="mt-4 block text-center text-[15px] font-medium underline underline-offset-4">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
