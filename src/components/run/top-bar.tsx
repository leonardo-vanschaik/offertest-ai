"use client";

import type { Run } from "@/lib/types";
import { AdCardCompact } from "../ad-card";
import { displayUrl, formatDuration, formatUsd, isTerminal } from "../format";
import { IconClock, IconGlobe, IconShield } from "../icons";
import { Card, ModelBadge, StatusPill } from "../ui";
import { useNow } from "./use-run";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</span>
      <span className="tnum text-[18px] font-semibold tracking-[-0.01em] text-ink-950">{children}</span>
    </div>
  );
}

export function RunTopBar({ run }: { run: Run }) {
  const live = !isTerminal(run);
  const now = useNow(live);
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : now;
  const elapsed = Math.max(0, end - new Date(run.createdAt).getTime());
  const quotes = run.assertions.map((a) => a.adQuote);
  const tokens = run.usage.inputTokens + run.usage.outputTokens;

  return (
    <Card className="grid grid-cols-[400px_minmax(0,1fr)_auto] items-center gap-6 p-3 pr-5">
      <AdCardCompact ad={run.ad} landingUrl={run.landingUrl} quotes={quotes} />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill status={run.status} text={run.phase || undefined} />
          <a
            href={run.landingUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 font-mono text-[12.5px] text-ink-500 hover:text-brand-700"
          >
            <IconGlobe size={13} className="shrink-0" />
            <span className="truncate">{displayUrl(run.landingUrl)}</span>
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ModelBadge model="Muse Wonder" role="computer use" />
          <ModelBadge model="Muse Spark" role="assertions" />
          <ModelBadge model="SAM 3.1" role="boxes" />
        </div>
      </div>

      <div className="flex items-center gap-6 border-l border-line pl-6">
        <Stat label="Elapsed">
          <span className="inline-flex items-center gap-1.5">
            {live && <IconClock size={15} className="text-brand-500" />}
            {formatDuration(elapsed)}
          </span>
        </Stat>
        <Stat label="Cost">
          <span title={`${tokens.toLocaleString("en-US")} tokens · ${run.usage.images} images`}>
            {formatUsd(run.usage.usd)}
          </span>
        </Stat>
        <div className="flex max-w-[210px] flex-col gap-0.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">Boundary</span>
          <span className="flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-ink-900">
            <IconShield size={14} className="mt-[1px] shrink-0 text-pass-600" />
            {run.boundary || (run.allowPayment ? "Test-mode purchase allowed, asks first" : "No payment")}
          </span>
        </div>
      </div>
    </Card>
  );
}
