import { AppHeader } from "@/components/brand";
import { NewRunForm } from "@/components/new-run-form";
import { RecentRuns } from "@/components/recent-runs";

const STEPS = [
  "Turns the ad into tests",
  "Shops your store like a customer",
  "Quotes the ad and the page",
  "Proposes one fix, you approve",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 pb-16 pt-8">
        <div>
            <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink-950">
              Test your ad&apos;s offer before you pay for it.
            </h1>
            <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-ink-500">
              An AI agent shops your store like a customer and checks that a customer can actually get what the ad
              promises, up to a test-mode purchase.
            </p>
          <ol className="mt-4 flex flex-wrap items-center gap-2">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-[12.5px] font-medium text-ink-700 shadow-[var(--shadow-card)]"
              >
                <span className="tnum grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <NewRunForm />
        <RecentRuns />
      </main>
    </div>
  );
}
