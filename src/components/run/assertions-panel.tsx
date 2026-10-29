"use client";

import type { Run } from "@/lib/types";
import { Highlighted } from "../ad-card";
import { KindChip, VerdictBadge } from "../ui";

export function AssertionsPanel({ run }: { run: Run }) {
  const waiting = run.assertions.length === 0 && (run.status === "queued" || run.status === "extracting");
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink-950">
          Promise <span className="text-ink-300">→</span> tests
        </h2>
        <span className="tnum text-[12px] text-ink-400">{run.assertions.length}</span>
      </header>
      <div className="panel-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {waiting &&
          [0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-3/4 rounded" />
            </div>
          ))}
        {waiting && <p className="px-1 text-[12px] text-ink-400">Muse Spark is reading the ad...</p>}
        {!waiting && run.assertions.length === 0 && (
          <p className="px-1 py-2 text-[12.5px] text-ink-400">No testable promises found.</p>
        )}
        {run.assertions.map((a, i) => {
          const v = run.verdicts.find((x) => x.assertionId === a.id);
          return (
            <article
              key={a.id}
              className="anim-slide-in rounded-lg border border-line bg-surface-2 p-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-1.5">
                <span className="tnum rounded bg-ink-900 px-1.5 py-[1px] font-mono text-[10.5px] font-semibold text-white">
                  {a.id.toUpperCase()}
                </span>
                <KindChip kind={a.kind} />
                <span className="ml-auto">{v && <VerdictBadge status={v.status} size="sm" />}</span>
              </div>
              <p className="mt-2 text-[13.5px] font-medium leading-snug text-ink-950">{a.claim}</p>
              <div className="mt-2.5 flex flex-col items-start gap-1 text-[12.5px] leading-snug text-ink-700">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">Ad quote</span>
                <mark className="rounded-[3px] bg-brand-100/80 px-1 text-ink-950 shadow-[inset_0_-2px_0_rgba(11,132,243,0.35)]">
                  {a.adQuote}
                </mark>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="border-t border-line bg-surface-2 p-4">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">The ad, word for word</div>
        <p className="text-[14px] font-semibold leading-snug text-ink-950">
          <Highlighted text={run.ad.headline} quotes={run.assertions.map((a) => a.adQuote)} />
        </p>
        <p className="mt-1 text-[13px] leading-snug text-ink-700">
          <Highlighted text={run.ad.text} quotes={run.assertions.map((a) => a.adQuote)} />
        </p>
        <span className="mt-2.5 inline-block rounded-md bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-900 ring-1 ring-inset ring-line">
          {run.ad.cta}
        </span>
      </footer>
    </section>
  );
}
