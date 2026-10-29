import type { Metadata } from "next";
import { container, serif } from "../../_components/ui";
import { GuideForm } from "./GuideForm";

export const metadata: Metadata = { title: "The First Thru-Hike Guide" };

export default function FirstThruHikePage() {
  return (
    <section className="border-b border-[#E2DCCF] bg-[#ECE6D9]">
      <div className={`${container} grid grid-cols-[1.2fr_1fr] items-center gap-12 py-12`}>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A5A3B]">Free guide</p>
          <h1 className={`${serif} mt-4 text-[48px] font-semibold leading-[1.05] tracking-tight`}>
            The First Thru-Hike Guide
          </h1>
          <p className="mt-5 max-w-md text-[18px] leading-relaxed text-[#4A504A]">
            Everything we wish we knew before our first long trail: planning, resupply, gear, and the first week on trail.
            Free PDF, instant download.
          </p>
          <ul className="mt-6 space-y-2 text-[16px] text-[#1E2420]">
            {["Pick a trail and a start date", "Plan resupply without spreadsheets", "A base-weight gear list that works", "Your first week: pace, feet, and food"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#2F6B3F]" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <GuideForm />
        </div>
      </div>
    </section>
  );
}
