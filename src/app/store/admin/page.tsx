import type { Metadata } from "next";
import { connection } from "next/server";
import { describeCoupon, describeShipping, getConfig, isCouponExpired, listOrders, SCENARIOS } from "@/lib/store";
import { formatCents } from "@/lib/types";
import { container } from "../_components/ui";
import { ScenarioSwitcher } from "./ScenarioSwitcher";

export const metadata: Metadata = { title: "Admin" };

const th = "border-b border-[#D8D1C2] px-3 py-2 text-left text-[13px] font-semibold uppercase tracking-wide text-[#5F655F]";
const td = "border-b border-[#E7E1D5] px-3 py-2 align-top text-[14px]";

export default async function AdminPage() {
  await connection();
  const config = getConfig();
  const orders = listOrders();
  const now = new Date();

  return (
    <div className={`${container} space-y-10 pt-8`}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-semibold">Store admin</h1>
        <p className="text-[14px] text-[#5F655F]">
          Current scenario: <code className="rounded bg-white px-2 py-0.5 font-semibold text-[#1E2420]">{config.scenario}</code>
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-[18px] font-semibold">Scenario</h2>
        <ScenarioSwitcher current={config.scenario} scenarios={SCENARIOS} />
      </section>

      <section>
        <h2 className="mb-3 text-[18px] font-semibold">Orders ({orders.length})</h2>
        <div className="overflow-hidden rounded-lg border border-[#E2DCCF] bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Placed</th>
                <th className={th}>Customer</th>
                <th className={th}>Items</th>
                <th className={th}>Coupon</th>
                <th className={`${th} text-right`}>Discount</th>
                <th className={`${th} text-right`}>Shipping</th>
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td className={`${td} text-[#5F655F]`} colSpan={8}>No orders yet.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className={`${td} font-semibold`}><a href={`/store/order/${o.id}`} className="underline">{o.id}</a></td>
                  <td className={td}>{new Date(o.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className={td}>{o.name}<br /><span className="text-[#5F655F]">{o.email}</span></td>
                  <td className={td}>{o.priced.lines.map((l) => `${l.name} (${l.variantLabel}) x${l.qty}`).join(", ")}</td>
                  <td className={td}>{o.priced.couponApplied ? o.priced.couponCode : o.priced.couponCode ? `${o.priced.couponCode} (not applied)` : ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatCents(o.priced.discountCents)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatCents(o.priced.shippingCents)}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{formatCents(o.priced.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[18px] font-semibold">Coupons</h2>
        <div className="overflow-hidden rounded-lg border border-[#E2DCCF] bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Rule</th>
                <th className={th}>Expires</th>
                <th className={th}>Active</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {config.coupons.map((c) => {
                const expired = isCouponExpired(c, now);
                const status = !c.active ? "inactive" : expired ? "expired" : "live";
                return (
                  <tr key={c.code}>
                    <td className={`${td} font-semibold`}>{c.code}</td>
                    <td className={td}>{describeCoupon(c, config)}</td>
                    <td className={td}>
                      {new Date(c.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET
                    </td>
                    <td className={td}>{c.active ? "yes" : "no"}</td>
                    <td className={`${td} font-semibold ${status === "live" ? "text-[#2F6B3F]" : "text-[#A63A2B]"}`}>{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="mb-3 text-[18px] font-semibold">Shipping rule</h2>
          <p className="rounded-lg border border-[#E2DCCF] bg-white px-4 py-3 text-[14px]">
            {describeShipping(config)}
            <span className="block text-[#5F655F]">
              flatRateCents {config.shipping.flatRateCents}, freeOverCents {String(config.shipping.freeOverCents)}
            </span>
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-[18px] font-semibold">Products</h2>
          <div className="overflow-hidden rounded-lg border border-[#E2DCCF] bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Product</th>
                  <th className={`${th} text-right`}>Price</th>
                  <th className={th}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {config.products.map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} font-semibold`}>{p.name}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatCents(p.priceCents)}</td>
                    <td className={td}>
                      {p.variants.map((v) => (
                        <span key={v.id} className={`mr-2 inline-block ${v.stock <= 0 ? "font-semibold text-[#A63A2B]" : ""}`}>
                          {v.label.replace(/^Size /, "")}: {v.stock}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
