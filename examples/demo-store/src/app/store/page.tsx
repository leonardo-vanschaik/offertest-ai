import Link from "next/link";
import { connection } from "next/server";
import { getConfig } from "@/lib/store";
import { formatCents } from "@/lib/types";
import { btnPrimary, container, serif } from "./_components/ui";
import { shippingHeadline } from "./_components/ShippingNote";

export default async function StoreHome() {
  await connection();
  const config = await getConfig();
  const ridge = config.products.find((p) => p.id === "ridge");
  const ship = shippingHeadline(config.shipping.freeOverCents);

  return (
    <>
      <section className="border-b border-[#E2DCCF] bg-[#ECE6D9]">
        <div className={`${container} grid grid-cols-2 items-center gap-12 py-10`}>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A5A3B]">New for fall</p>
            <h1 className={`${serif} mt-4 text-[52px] font-semibold leading-[1.05] tracking-tight`}>
              Made for the long way round.
            </h1>
            <p className="mt-5 max-w-md text-[18px] leading-relaxed text-[#4A504A]">
              Meet the Ridge trail shoe: light, grippy, and cushioned for long days on mixed ground.
            </p>
            {ridge && (
              <div className="mt-8 flex items-center gap-5">
                <Link href={`/store/products/${ridge.slug}`} className={btnPrimary}>
                  Shop the Ridge
                </Link>
                <span className="text-[17px] font-semibold">{formatCents(ridge.priceCents)}</span>
              </div>
            )}
          </div>
          {ridge && (
            <Link href={`/store/products/${ridge.slug}`} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ridge.image} alt={`${ridge.name} in ${ridge.color}`} className="mx-auto h-[340px] w-[340px] rounded-xl" />
            </Link>
          )}
        </div>
      </section>

      <section id="shop" className={`${container} pt-12`}>
        <div className="flex items-end justify-between">
          <h2 className={`${serif} text-[32px] font-semibold tracking-tight`}>Shop all</h2>
          {ship && <p className="text-[15px] text-[#5F655F]">{ship}</p>}
        </div>
        <ul className="mt-6 grid grid-cols-4 gap-6">
          {config.products.map((p) => {
            const soldOut = p.variants.every((v) => v.stock <= 0);
            return (
              <li key={p.id}>
                <Link href={`/store/products/${p.slug}`} className="group block">
                  <div className="overflow-hidden rounded-lg border border-[#E2DCCF] bg-[#ECE6D9]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt={`${p.name} in ${p.color}`} className="aspect-square w-full" />
                  </div>
                  <h3 className="mt-4 text-[17px] font-semibold group-hover:underline underline-offset-4">{p.name}</h3>
                  <p className="mt-1 text-[14px] text-[#5F655F]">{p.color}</p>
                  <p className="mt-2 text-[16px] font-semibold">
                    {formatCents(p.priceCents)}
                    {soldOut && <span className="ml-2 text-[14px] font-medium text-[#A63A2B]">Sold out</span>}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${container} mt-16 grid grid-cols-3 gap-6`}>
        {[
          ["Free repairs", "Wear something out? We fix seams, zips, and soles free for two years."],
          ["30-day returns", "Try it on the trail. If it is not right, send it back within 30 days."],
          ["Made to last", "Recycled fabrics, replaceable parts, and no throwaway trims."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-[#E2DCCF] bg-white p-6">
            <h3 className="text-[17px] font-semibold">{t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5F655F]">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}
