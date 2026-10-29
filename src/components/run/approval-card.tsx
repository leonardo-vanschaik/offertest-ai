"use client";

import { useState } from "react";
import type { Approval, Run } from "@/lib/types";
import { IconCard, IconCheck, IconShield, IconWrench, IconX } from "../icons";
import { Button } from "../ui";
import { FixChange } from "./fix-card";

export type Decide = (approvalId: string, decision: "approved" | "declined") => Promise<void>;

function amountOf(a: Approval): string | null {
  const m = `${a.title} ${a.detail}`.match(/\$\d[\d,]*(?:\.\d{2})?/);
  return m ? m[0] : null;
}

function KindHeader({ a }: { a: Approval }) {
  const meta =
    a.kind === "payment"
      ? { icon: <IconCard size={18} />, label: "Payment approval", cls: "bg-brand-600 text-white" }
      : a.kind === "fix"
        ? { icon: <IconWrench size={18} />, label: "Fix approval", cls: "bg-ink-900 text-white" }
        : { icon: <IconShield size={18} />, label: "Safety check", cls: "bg-warn-500 text-white" };
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${meta.cls}`}>{meta.icon}</span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">{meta.label}</div>
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-warn-700">
          <span className="h-1.5 w-1.5 rounded-full bg-warn-500" />{" "}
          {a.kind === "fix" ? "Nothing changes until you approve" : "The agent is paused and waits for you"}
        </div>
      </div>
    </div>
  );
}

function ApprovalBody({ run, a, onDecide }: { run: Run; a: Approval; onDecide: Decide }) {
  const [busy, setBusy] = useState<null | "approved" | "declined">(null);
  const [err, setErr] = useState<string | null>(null);
  const amount = a.kind === "payment" ? amountOf(a) : null;

  async function decide(d: "approved" | "declined") {
    setBusy(d);
    setErr(null);
    try {
      await onDecide(a.id, d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send your decision.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <KindHeader a={a} />
      <div>
        <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.015em] text-ink-950">{a.title}</h3>
        {a.detail && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{a.detail}</p>}
      </div>

      {a.kind === "payment" && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Amount</div>
            <div className="tnum text-[28px] font-semibold tracking-[-0.02em] text-ink-950">{amount ?? "See detail"}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pass-50 px-2.5 py-1 text-[12px] font-semibold text-pass-700 ring-1 ring-inset ring-pass-100">
              <IconCard size={13} /> Test card 4242 · no real money
            </span>
            <span className="text-[11.5px] text-ink-400">Test mode on the owned store</span>
          </div>
        </div>
      )}

      {a.kind === "fix" && run.fix && (
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="text-[14px] font-semibold text-ink-950">{run.fix.summary}</div>
          <div className="mt-3">
            <FixChange run={run} />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-500">If you approve, the change is applied and a fresh browser session tests the ad again.</p>
        </div>
      )}

      {err && <p className="rounded-lg border border-fail-100 bg-fail-50 px-3 py-2 text-[13px] text-fail-700">{err}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1 py-2.5" disabled={!!busy} onClick={() => decide("declined")}>
          <IconX size={15} /> {busy === "declined" ? "Declining..." : "Decline"}
        </Button>
        <Button variant="success" className="flex-[1.6] py-2.5 text-[15px]" disabled={!!busy} onClick={() => decide("approved")}>
          <IconCheck size={16} strokeWidth={2.4} /> {busy === "approved" ? "Approving..." : a.kind === "payment" ? "Approve payment" : "Approve"}
        </Button>
      </div>
    </div>
  );
}

export function ApprovalOverlay({ run, onDecide }: { run: Run; onDecide: Decide }) {
  const pending = run.approvals.filter((a) => a.status === "pending");
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const a = pending[0];
  if (!a) return null;

  if (hiddenId === a.id) {
    return (
      <button
        onClick={() => setHiddenId(null)}
        className="anim-pop-in fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink-950 py-2 pl-2 pr-4 text-[13.5px] font-semibold text-white shadow-[var(--shadow-float)] hover:bg-ink-900"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-warn-500">
          <IconShield size={15} />
        </span>
        {pending.length === 1 ? "1 approval waiting" : `${pending.length} approvals waiting`}
        <span className="text-white/60">· Review</span>
      </button>
    );
  }

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-950/25 p-6 backdrop-blur-[1.5px]">
      <div
        key={a.id}
        role="dialog"
        aria-modal="true"
        aria-label={a.title}
        className="anim-pop-in relative w-full max-w-[520px] rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-float)]"
      >
        <button
          onClick={() => setHiddenId(a.id)}
          className="absolute right-4 top-4 rounded-md px-2 py-1 text-[12px] font-medium text-ink-400 hover:bg-surface hover:text-ink-700"
        >
          Review page first
        </button>
        <ApprovalBody run={run} a={a} onDecide={onDecide} />
        {pending.length > 1 && (
          <p className="mt-4 text-center text-[12px] text-ink-400">{pending.length - 1} more waiting after this one</p>
        )}
      </div>
    </div>
  );
}
