import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getConfig } from "@/lib/store";
import { btnPrimary, container, serif } from "../_components/ui";

export const metadata: Metadata = { title: "Trail Club" };

export default async function TrailClubPage() {
  await connection();
  const { trialDays } = getConfig().funnels;

  return (
    <>
      <section className="border-b border-[#E2DCCF] bg-[#ECE6D9]">
        <div className={`${container} grid grid-cols-[1.2fr_1fr] items-center gap-12 py-12`}>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A5A3B]">Membership</p>
            <h1 className={`${serif} mt-4 text-[52px] font-semibold leading-[1.05] tracking-tight`} data-testid="trial-headline">
              Try Trail Club free for {trialDays} days.
            </h1>
            <p className="mt-5 max-w-md text-[18px] leading-relaxed text-[#4A504A]">
              Member prices and free returns on every order. After your trial, Trail Club is $9/month. Cancel anytime.
            </p>
            <div className="mt-8 flex items-center gap-5">
              <Link href="/store/trail-club/join" className={btnPrimary}>Start free trial</Link>
              <span className="text-[15px] text-[#4A504A]">No credit card required.</span>
            </div>
          </div>
          <div className="rounded-xl border border-[#E2DCCF] bg-white p-8">
            <p className="text-[14px] font-semibold uppercase tracking-wide text-[#5F655F]">Trail Club</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className={`${serif} text-[44px] font-semibold`}>$9</span>
              <span className="text-[17px] text-[#5F655F]">/ month after your {trialDays}-day free trial</span>
            </p>
            <ul className="mt-6 space-y-3 text-[16px]">
              {["Member prices on shoes, shells, and packs", "Free returns on every order", "Early access to new gear", "Cancel anytime from your account"].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <Check />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={`${container} mt-14 grid grid-cols-3 gap-6`}>
        {[
          ["Member prices", "Save on every order, including new arrivals and the Ridge trail shoe."],
          ["Free returns", "Send anything back free of charge. No restocking fees, no questions."],
          ["Cancel anytime", `Your first ${trialDays} days are free. Cancel before then and you pay nothing.`],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-[#E2DCCF] bg-white p-6">
            <h2 className="text-[17px] font-semibold">{t}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5F655F]">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2F6B3F]" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
