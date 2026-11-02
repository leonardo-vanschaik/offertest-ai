import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getConfig } from "@/lib/store";
import { container, serif } from "../../_components/ui";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = { title: "Join Trail Club" };

export default async function JoinPage() {
  await connection();
  const { trialDays, trialRequiresCard } = (await getConfig()).funnels;

  return (
    <div className={`${container} max-w-[640px] pt-10`}>
      <Link href="/store/trail-club" className="text-[15px] font-medium underline underline-offset-4">
        Back to Trail Club
      </Link>
      <h1 className={`${serif} mt-4 text-[36px] font-semibold tracking-tight`}>Start your free trial</h1>
      <p className="mt-2 text-[17px] text-[#4A504A]">
        Free for {trialDays} days, then $9/month. Cancel anytime.
      </p>
      <div className="mt-6">
        <JoinForm requiresCard={trialRequiresCard} />
      </div>
    </div>
  );
}
