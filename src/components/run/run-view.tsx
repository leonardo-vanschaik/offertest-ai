"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "../brand";
import { formatDateTime, isTerminal } from "../format";
import { IconAlert, IconArrowLeft, IconArrowRight, IconRefresh } from "../icons";
import { Chip } from "../ui";
import { AgentScreenPanel } from "./agent-screen";
import { ApprovalOverlay, type Decide } from "./approval-card";
import { AssertionsPanel } from "./assertions-panel";
import { AuditLog } from "./audit-log";
import { FixCard } from "./fix-card";
import { OrderCard } from "./order-card";
import { OverallBanner } from "./overall-banner";
import { SamPanel } from "./sam-panel";
import { StepTimeline } from "./step-timeline";
import { RunTopBar } from "./top-bar";
import { useRun } from "./use-run";
import { VerdictCard } from "./verdict-card";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 pb-16 pt-4">{children}</main>
    </div>
  );
}

export function RunSkeleton() {
  return (
    <Shell>
      <div className="skeleton h-6 w-72 rounded-md" />
      <div className="skeleton h-[96px] rounded-xl" />
      <div className="grid h-[calc(100vh-270px)] min-h-[600px] grid-cols-[290px_minmax(0,1fr)_320px] gap-4">
        <div className="skeleton rounded-xl" />
        <div className="skeleton rounded-xl" />
        <div className="skeleton rounded-xl" />
      </div>
    </Shell>
  );
}

export function RunView({ id }: { id: string }) {
  const { state, refresh } = useRun(id);
  const [selected, setSelected] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<string | null>(null);

  const run = state.kind === "ok" ? state.run : state.kind === "error" ? state.run : undefined;

  // When a run finishes while you watch, bring the results into view once.
  useEffect(() => {
    if (!run) return;
    const prev = prevStatus.current;
    prevStatus.current = run.status;
    if (prev && prev !== "done" && run.status === "done") {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }
  }, [run]);

  const onDecide: Decide = useCallback(
    async (approvalId, decision) => {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}/approvals/${encodeURIComponent(approvalId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      await refresh();
    },
    [id, refresh],
  );

  const viewStep = useCallback((n: number) => {
    setSelected(n);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (state.kind === "loading") return <RunSkeleton />;
  if (state.kind === "missing" || !run) {
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <h1 className="text-[18px] font-semibold text-ink-950">Run not found</h1>
          <p className="mt-1 text-[14px] text-ink-500">
            {state.kind === "error" ? state.message : `No run with id ${id}.`}
          </p>
          <Link href="/" className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-700 hover:text-brand-800">
            <IconArrowLeft size={15} /> Back to new test
          </Link>
        </div>
      </Shell>
    );
  }

  const hasResults = run.verdicts.length > 0 || !!run.fix || !!run.order || !!run.sam || !!run.overall;

  return (
    <Shell>
      <div ref={topRef} className="flex min-h-7 scroll-mt-20 items-center gap-3 text-[13px]">
        <Link href="/" className="inline-flex items-center gap-1 font-medium text-ink-500 hover:text-ink-900">
          <IconArrowLeft size={14} /> Runs
        </Link>
        <span className="text-ink-300">/</span>
        <span className="font-mono text-[12.5px] text-ink-900">{run.id}</span>
        <Chip tone={run.mode === "agent" ? "brand" : "neutral"}>{run.mode === "agent" ? "Agent" : "One call"}</Chip>
        <span className="text-ink-400">{formatDateTime(run.createdAt)}</span>
        {state.kind === "error" && (
          <span className="inline-flex items-center gap-1 text-[12px] text-warn-700">
            <IconRefresh size={12} /> Reconnecting
          </span>
        )}
        {run.parentRunId && (
          <Link
            href={`/runs/${run.parentRunId}`}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-2.5 text-[12.5px] font-medium text-brand-800 hover:bg-brand-100"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Fresh re-test of run <span className="font-mono">{run.parentRunId}</span>
            <IconArrowRight size={13} />
          </Link>
        )}
      </div>

      <RunTopBar run={run} />

      {run.status === "error" && run.error && (
        <div className="flex items-start gap-2 rounded-xl border border-fail-100 bg-fail-50 px-4 py-3 text-[13.5px] text-fail-700">
          <IconAlert size={16} className="mt-[1px] shrink-0" />
          <span>
            <span className="font-semibold">The run stopped.</span> {run.error}
          </span>
        </div>
      )}

      <div className="grid h-[calc(100vh-270px)] min-h-[600px] grid-cols-[290px_minmax(0,1fr)_320px] gap-4">
        <AssertionsPanel run={run} />
        <AgentScreenPanel run={run} selected={selected} onSelect={setSelected} />
        <StepTimeline run={run} selected={selected} onSelect={setSelected} />
      </div>

      <div ref={resultsRef} className="flex scroll-mt-20 flex-col gap-4 pt-2">
        {hasResults && (
          <>
            <OverallBanner run={run} />
            <div className="grid grid-cols-[minmax(0,1fr)_440px] items-start gap-4">
              <div className="flex flex-col gap-4">
                {run.verdicts.length > 0 ? (
                  run.verdicts.map((v) => <VerdictCard key={v.assertionId} run={run} verdict={v} onViewStep={viewStep} />)
                ) : (
                  <div className="rounded-xl border border-dashed border-line-strong bg-white px-5 py-8 text-center text-[13px] text-ink-400">
                    Verdicts appear here after the agent finishes shopping.
                  </div>
                )}
                <SamPanel run={run} />
              </div>
              <div className="flex flex-col gap-4">
                <FixCard run={run} onDecide={onDecide} />
                <OrderCard run={run} />
              </div>
            </div>
          </>
        )}
        <AuditLog runId={run.id} live={!isTerminal(run)} />
      </div>

      <ApprovalOverlay run={run} onDecide={onDecide} />
    </Shell>
  );
}
