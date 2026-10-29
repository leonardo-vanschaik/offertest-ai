import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store";
import { formatCents } from "@/lib/types";
import { Totals } from "../../_components/Totals";
import { btnPrimary, card, container, serif } from "../../_components/ui";

export const metadata: Metadata = { title: "Order confirmed" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(decodeURIComponent(id));
  if (!order) notFound();
  const { priced } = order;

  return (
    <div className={`${container} max-w-[880px] pt-12`}>
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2F6B3F]" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className={`${serif} text-[34px] font-semibold leading-tight tracking-tight`} data-testid="order-confirmation">
          Thank you! Order {order.id} is confirmed.
        </h1>
      </div>
      <p className="mt-4 text-[17px] text-[#4A504A]">
        We sent a receipt to <span className="font-semibold text-[#1E2420]">{order.email}</span>. Test mode order: no real money moved.
      </p>

      <div className="mt-8 grid grid-cols-[1fr_340px] items-start gap-8">
        <div className={`${card} p-6`}>
          <h2 className="text-[18px] font-semibold">Items</h2>
          <ul className="mt-4 divide-y divide-[#E2DCCF]">
            {priced.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-4 py-3 text-[16px]">
                <span>
                  <span className="font-semibold">{l.name}</span>
                  <span className="block text-[15px] text-[#5F655F]">
                    {l.variantLabel} · Qty {l.qty} · {formatCents(l.unitCents)} each
                  </span>
                </span>
                <span className="tabular-nums">{formatCents(l.lineCents)}</span>
              </li>
            ))}
          </ul>
          {priced.couponMessage && (
            <p className={`mt-3 text-[15px] font-semibold ${priced.couponApplied ? "text-[#2F6B3F]" : "text-[#A63A2B]"}`}>
              {priced.couponMessage}
            </p>
          )}
          <div className="mt-5 border-t border-[#E2DCCF] pt-5">
            <Totals priced={priced} />
          </div>
        </div>
        <div className={`${card} space-y-4 p-6 text-[15px]`}>
          <div>
            <h3 className="font-semibold">Order number</h3>
            <p className="mt-1 text-[#4A504A]">{order.id}</p>
          </div>
          <div>
            <h3 className="font-semibold">Ship to</h3>
            <p className="mt-1 text-[#4A504A]">{order.name}<br />{order.address}</p>
          </div>
          <div>
            <h3 className="font-semibold">Payment</h3>
            <p className="mt-1 text-[#4A504A]">Card ending in {order.cardLast4} (test mode)</p>
          </div>
          <div>
            <h3 className="font-semibold">Placed</h3>
            <p className="mt-1 text-[#4A504A]">
              {new Date(order.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
      </div>
      <Link href="/store#shop" className={`${btnPrimary} mt-8`}>Continue shopping</Link>
    </div>
  );
}
