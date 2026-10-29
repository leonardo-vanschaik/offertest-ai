"use client";

import Link from "next/link";
import type { FixProposal, Run } from "@/lib/types";
import { describeStoreFix } from "../format";
import { IconArrowRight, IconCheck, IconWrench, IconX } from "../icons";
import { Button, Card, Chip, ModelBadge } from "../ui";
import type { Decide } from "./approval-card";

const STATUS: Record<FixProposal["status"], { label: string; tone: "brand" | "pass" | "fail" | "warn" | "neutral" }> = {
  proposed: { label: "Waiting for approval", tone: "warn" },
  approved: { label: "Approved", tone: "brand" },
  declined: { label: "Declined", tone: "neutral" },
  applied: { label: "Applied", tone: "pass" },
};

/** The exact change, as a small key/value table. */
export function FixChange({ run }: { run: Run }) {
  const fix = run.fix;
  if (!fix) return null;
  if (fix.storeFix) {
    const d = describeStoreFix(fix.storeFix);
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
          <span className="text-[12px] font-semibold text-ink-900">{d.label}</span>
          <span className="font-mono text-[10.5px] text-ink-400">{fix.storeFix.type}</span>
        </div>
        <dl className="divide-y divide-line">
          {d.lines.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3 py-1.5 text-[12.5px]">
              <dt className="text-ink-500">{k}</dt>
              <dd className="tnum font-mono font-medium text-ink-950">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (fix.adCopy) {
    return (
      <div className="grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-lg border border-fail-100 bg-fail-50/60 p-2.5">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fail-700">Now</div>
          <div className="font-medium text-ink-900 line-through decoration-fail-500/50">{run.ad.headline}</div>
          <div className="text-ink-500 line-through decoration-fail-500/40">{run.ad.text}</div>
        </div>
        <div className="rounded-lg border border-pass-100 bg-pass-50/60 p-2.5">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-pass-700">New ad copy</div>
          <div className="font-medium text-ink-950">{fix.adCopy.headline}</div>
          <div className="text-ink-700">{fix.adCopy.text}</div>
        </div>
      </div>
    );
  }
  return null;
}

export function FixCard({ run, onDecide }: { run: Run; onDecide: Decide }) {
  const fix = run.fix;
  if (!fix) return null;
  const approval = run.approvals.find((a) => a.id === fix.approvalId);
  const pending = approval?.status === "pending";
  const s = STATUS[fix.status];

  return (
    <Card as="section" className="anim-slide-in overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-900 text-white">
          <IconWrench size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-ink-950">Proposed fix</h2>
          <p className="text-[12px] text-ink-500">One change. Nothing happens until you approve it.</p>
        </div>
        <Chip tone={s.tone}>{s.label}</Chip>
      </header>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <ModelBadge model="Muse Wonder" role="proposes one fix" />
          <Chip tone="neutral">Target: {fix.target === "store" ? "Store" : "Ad"}</Chip>
        </div>
        <p className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink-950">{fix.summary}</p>
        <p className="text-[13.5px] leading-relaxed text-ink-500">{fix.rationale}</p>
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">The exact change</div>
          <FixChange run={run} />
        </div>

        {pending && approval && (
          <div className="flex gap-2 border-t border-line pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => onDecide(approval.id, "declined").catch(() => {})}>
              <IconX size={14} /> Decline
            </Button>
            <Button variant="success" className="flex-[1.6]" onClick={() => onDecide(approval.id, "approved").catch(() => {})}>
              <IconCheck size={15} strokeWidth={2.4} /> Approve and re-test
            </Button>
          </div>
        )}

        {fix.retestRunId ? (
          <Link
            href={`/runs/${fix.retestRunId}`}
            className="group flex items-center justify-between rounded-xl bg-brand-600 px-4 py-3 text-[14.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(10,112,220,0.6)] transition-colors hover:bg-brand-700"
          >
            Watch fresh re-test
            <IconArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (fix.status === "approved" || fix.status === "applied") ? (
          <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] font-medium text-brand-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            Applying the fix and starting a fresh session...
          </div>
        ) : null}
      </div>
    </Card>
  );
}
