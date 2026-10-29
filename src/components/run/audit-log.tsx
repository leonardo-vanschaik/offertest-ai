"use client";

import { useEffect, useState } from "react";
import { IconChevronDown, IconLog } from "../icons";

type Line = Record<string, unknown> | string;

function toLines(data: unknown): Line[] {
  if (Array.isArray(data)) return data as Line[];
  if (data && typeof data === "object" && Array.isArray((data as { lines?: unknown }).lines))
    return (data as { lines: Line[] }).lines;
  if (typeof data === "string") return data.split("\n").filter(Boolean);
  return [];
}

function LineRow({ line, i }: { line: Line; i: number }) {
  if (typeof line === "string") {
    return (
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 px-4 py-1">
        <span className="tnum text-right text-ink-500">{i + 1}</span>
        <span className="whitespace-pre-wrap break-all text-ink-300">{line}</span>
      </div>
    );
  }
  const { at, type, ...rest } = line as { at?: string; type?: string } & Record<string, unknown>;
  const time = typeof at === "string" ? at.slice(11, 23) : "";
  const body = Object.keys(rest).length ? JSON.stringify(rest) : "";
  return (
    <div className="grid grid-cols-[40px_96px_150px_minmax(0,1fr)] gap-3 px-4 py-1 hover:bg-white/5">
      <span className="tnum text-right text-ink-500">{i + 1}</span>
      <span className="tnum text-ink-400">{time}</span>
      <span className="truncate font-semibold text-brand-300">{String(type ?? "event")}</span>
      <span className="whitespace-pre-wrap break-all text-ink-300">{body}</span>
    </div>
  );
}

export function AuditLog({ runId, live }: { runId: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/log`, { cache: "no-store" });
        if (!res.ok) throw new Error(`The server answered ${res.status}.`);
        const ct = res.headers.get("content-type") ?? "";
        const data = ct.includes("json") ? await res.json() : await res.text();
        if (!stop) {
          setLines(toLines(data));
          setErr(null);
        }
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : "Could not load the log.");
      }
      if (!stop && live) t = setTimeout(load, 2000);
    }
    load();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [open, runId, live]);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-card)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-ink-700 ring-1 ring-inset ring-line">
          <IconLog size={16} />
        </span>
        <div className="flex-1">
          <h2 className="text-[14px] font-semibold text-ink-950">Audit log</h2>
          <p className="text-[12px] text-ink-500">Append-only. Every model call, action, approval and verdict.</p>
        </div>
        {lines && <span className="tnum text-[12px] text-ink-400">{lines.length} lines</span>}
        <IconChevronDown size={16} className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="anim-fade-in panel-scroll max-h-[420px] overflow-auto border-t border-line bg-ink-950 py-3 font-mono text-[11.5px] leading-relaxed">
          {err && <div className="px-4 text-fail-500">{err}</div>}
          {!err && lines === null && <div className="px-4 text-ink-400">Loading...</div>}
          {!err && lines?.length === 0 && <div className="px-4 text-ink-400">No log lines yet.</div>}
          {lines?.map((l, i) => <LineRow key={i} line={l} i={i} />)}
        </div>
      )}
    </section>
  );
}
