import { formatCents } from "@/lib/types";
import type { PricedCart } from "@/lib/types";

export function Totals({ priced }: { priced: PricedCart }) {
  const discountLabel = priced.couponApplied && priced.couponCode ? `Discount (${priced.couponCode})` : "Discount";
  return (
    <dl className="space-y-3 text-[16px]">
      <Row label="Subtotal" value={formatCents(priced.subtotalCents)} />
      <Row
        label={discountLabel}
        value={priced.discountCents > 0 ? `-${formatCents(priced.discountCents)}` : formatCents(0)}
        accent={priced.discountCents > 0}
      />
      <Row label="Shipping" value={priced.shippingCents === 0 ? "Free" : formatCents(priced.shippingCents)} />
      <div className="flex items-baseline justify-between border-t border-[#E2DCCF] pt-4">
        <dt className="text-[18px] font-semibold">Total</dt>
        <dd className="text-[24px] font-semibold tabular-nums" data-testid="cart-total">
          {formatCents(priced.totalCents)}
        </dd>
      </div>
    </dl>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[#5F655F]">{label}</dt>
      <dd className={`tabular-nums ${accent ? "font-semibold text-[#2F6B3F]" : "text-[#1E2420]"}`}>{value}</dd>
    </div>
  );
}
