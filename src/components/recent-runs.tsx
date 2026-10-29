"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import { displayUrl, formatDuration, formatUsd, timeAgo } from "./format";
import { IconChevronRight, IconImage, IconRefresh } from "./icons";
import { Card, Chip, OverallChip, SectionLabel, StatusPill } from "./ui";

export function RecentRuns() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Run[];
        if (!stop) {
          setRuns(Array.isArray(data) ? data : []);
          setFailed(false);
          setNow(Date.now());
        }
      } catch {
        if (!stop) {
          setFailed(true);
          setRuns((r) => r ?? []);
        }
      }
      if (!stop) timer = setTimeout(load, 3000);
    }
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel
        right={
          failed ? (
            <span className="flex items-center gap-1 text-[12px] text-ink-400">
              <IconRefresh size={12} /> Retrying
            </span>
          ) : runs ? (
            <span className="tnum text-[12px] text-ink-400">{runs.length} runs</span>
          ) : null
        }
      >
        Recent runs
      </SectionLabel>
      <Card className="overflow-hidden">
        {runs === null ? (
          <div className="flex flex-col divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="skeleton h-10 w-10 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 w-64 rounded" />
                  <div className="skeleton h-2.5 w-40 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-ink-900">No runs yet</p>
            <p className="mt-1 text-[13px] text-ink-500">Load the sample ad above and run your first test.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((r) => {
              const end = r.finishedAt ? new Date(r.finishedAt).getTime() : now;
              const ms = end - new Date(r.createdAt).getTime();
              const counts = {
                supported: r.verdicts.filter((v) => v.status === "supported").length,
                contradicted: r.verdicts.filter((v) => v.status === "contradicted").length,
              };
              return (
                <li key={r.id}>
                  <Link
                    href={`/runs/${r.id}`}
                    className="group grid grid-cols-[40px_minmax(0,1fr)_170px_110px_90px_70px_16px] items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-lg border border-line bg-surface">
                      {r.ad.imageUrl ? (
                        <img src={r.ad.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-ink-300">
                          <IconImage size={16} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-ink-950">{r.ad.headline}</span>
                        {r.parentRunId && <Chip tone="brand">Re-test</Chip>}
                        {r.mode === "one_call" && <Chip>One call</Chip>}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-400">{displayUrl(r.landingUrl)}</div>
                    </div>
                    <div className="min-w-0">
                      <StatusPill status={r.status} size="sm" />
                    </div>
                    <div className="flex flex-col items-start gap-0.5">
                      <OverallChip overall={r.overall} />
                      {r.verdicts.length > 0 && (
                        <span className="tnum text-[11px] text-ink-400">
                          {counts.supported} held · {counts.contradicted} broken
                        </span>
                      )}
                    </div>
                    <div className="tnum text-right text-[12.5px] text-ink-700">
                      {formatDuration(ms)}
                      <div className="text-[11px] text-ink-400">{formatUsd(r.usage?.usd ?? 0)}</div>
                    </div>
                    <div className="text-right text-[12px] text-ink-400">{timeAgo(r.createdAt, now)}</div>
                    <IconChevronRight size={16} className="text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-500" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
