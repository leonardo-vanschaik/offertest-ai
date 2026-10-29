"use client";

/* eslint-disable @next/next/no-img-element */
import type { Run, Verdict } from "@/lib/types";
import { IconAlert, IconCheck, IconX } from "../icons";
import { Card, KindChip, VERDICT_META, VerdictBadge } from "../ui";

function QuoteCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${ok ? "text-pass-700" : "text-fail-700"}`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded-full ${ok ? "bg-pass-500" : "bg-fail-500"} text-white`}>
        {ok ? <IconCheck size={10} strokeWidth={3} /> : <IconX size={10} strokeWidth={3} />}
      </span>
      {label}
    </span>
  );
}

export function VerdictCard({
  run,
  verdict,
  onViewStep,
}: {
  run: Run;
  verdict: Verdict;
  onViewStep: (n: number) => void;
}) {
  const a = run.assertions.find((x) => x.id === verdict.assertionId);
  const m = VERDICT_META[verdict.status];
  const step = verdict.evidenceStep != null ? run.steps.find((s) => s.n === verdict.evidenceStep) : undefined;
  const pageTone =
    verdict.status === "contradicted"
      ? "bg-fail-50 text-fail-700 ring-fail-100"
      : verdict.status === "supported"
        ? "bg-pass-50 text-pass-700 ring-pass-100"
        : "bg-surface text-ink-700 ring-line";

  return (
    <Card as="article" className="anim-slide-in relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${m.solid}`} />
      <header className="flex items-start gap-3 border-b border-line py-3.5 pl-6 pr-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-ink-900 px-1.5 py-[1px] font-mono text-[10.5px] font-semibold text-white">
              {verdict.assertionId.toUpperCase()}
            </span>
            {a && <KindChip kind={a.kind} />}
          </div>
          <h3 className="mt-1.5 text-[15.5px] font-semibold leading-snug text-ink-950">{a?.claim ?? "Promise"}</h3>
        </div>
        <VerdictBadge status={verdict.status} size="lg" />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_168px] gap-4 py-4 pl-6 pr-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">The ad says</span>
          <blockquote className="rounded-lg bg-brand-50 px-3 py-2.5 text-[15px] font-medium leading-snug text-ink-950 ring-1 ring-inset ring-brand-100">
            &ldquo;{verdict.adQuote}&rdquo;
          </blockquote>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">The store shows</span>
          {verdict.pageQuote ? (
            <blockquote className={`rounded-lg px-3 py-2.5 text-[15px] font-semibold leading-snug ring-1 ring-inset ${pageTone}`}>
              &ldquo;{verdict.pageQuote}&rdquo;
            </blockquote>
          ) : (
            <div className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[13px] text-ink-400">
              No page quote captured
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Evidence{step ? ` · step ${step.n}` : ""}
          </span>
          {step?.screenshot ? (
            <button
              onClick={() => onViewStep(step.n)}
              className="group relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-line-strong bg-surface transition-shadow hover:shadow-[var(--shadow-raised)]"
              title="View this step on the agent's screen"
            >
              <img src={step.screenshot} alt={`Step ${step.n}`} className="h-full w-full object-cover object-top" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/70 to-transparent px-2 pb-1 pt-4 text-left text-[10.5px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                View on screen
              </span>
            </button>
          ) : (
            <div className="grid aspect-[16/10] w-full place-items-center rounded-lg border border-dashed border-line-strong text-[11px] text-ink-400">
              No screenshot
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface-2 py-3 pl-6 pr-5">
        <QuoteCheck ok={verdict.quoteCheck.adQuoteFound} label="Quote found in ad" />
        <QuoteCheck ok={verdict.quoteCheck.pageQuoteFound} label="Quote found on page" />
        {verdict.downgraded && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warn-50 px-2 py-0.5 text-[12px] font-medium text-warn-700 ring-1 ring-inset ring-warn-100">
            <IconAlert size={12} /> Downgraded: a quote failed the check, so this is not called contradicted
          </span>
        )}
        <p className="basis-full text-[13px] leading-relaxed text-ink-700">{verdict.reason}</p>
      </footer>
    </Card>
  );
}
