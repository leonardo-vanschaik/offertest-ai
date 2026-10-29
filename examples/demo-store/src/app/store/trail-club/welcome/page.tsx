import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getConfig } from "@/lib/store";
import { btnPrimary, card, container, serif } from "../../_components/ui";

export const metadata: Metadata = { title: "Welcome to Trail Club" };

export default async function WelcomePage() {
  await connection();
  const { trialDays } = getConfig().funnels;
  const ends = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    dateStyle: "long",
    timeZone: "America/New_York",
  });

  return (
    <div className={`${container} max-w-[760px] pt-12`}>
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2F6B3F]" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className={`${serif} text-[34px] font-semibold leading-tight tracking-tight`}>Welcome to Trail Club!</h1>
      </div>
      <p className="mt-4 text-[18px] text-[#4A504A]" data-testid="trial-confirmation">
        Your free trial ends <span className="font-semibold text-[#1E2420]">{ends}</span>.
      </p>
      <div className={`${card} mt-8 space-y-3 p-6 text-[15px]`}>
        <p><span className="font-semibold">Trial length:</span> {trialDays} days</p>
        <p><span className="font-semibold">After your trial:</span> $9/month. Cancel anytime before {ends} and you pay nothing.</p>
        <p><span className="font-semibold">Your perks:</span> member prices and free returns on every order.</p>
      </div>
      <Link href="/store#shop" className={`${btnPrimary} mt-8`}>Shop with member prices</Link>
    </div>
  );
}
