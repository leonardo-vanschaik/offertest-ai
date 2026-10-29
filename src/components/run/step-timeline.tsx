"use client";

import { useEffect, useRef, useState } from "react";
import type { Run, Step } from "@/lib/types";
import { isTerminal, stepOffset } from "../format";
import {
  IconCamera,
  IconChevronDown,
  IconClock,
  IconCursor,
  IconKeyboard,
  IconNote,
  IconScroll,
  IconShield,
  IconSparkle,
} from "../icons";

function StepIcon({ step }: { step: Step }) {
  const size = 14;
  if (step.kind === "approval") return <IconShield size={size} />;
  if (step.kind === "model") return <IconSparkle size={size} />;
  if (step.kind === "note") return <IconNote size={size} />;
  const a = step.actions?.find((x) => x.type !== "screenshot") ?? step.actions?.[0];
  switch (a?.type) {
    case "click":
    case "double_click":
    case "move":
    case "drag":
      return <IconCursor size={size} />;
    case "type":
    case "keypress":
      return <IconKeyboard size={size} />;
    case "scroll":
      return <IconScroll size={size} />;
    case "wait":
      return <IconClock size={size} />;
    default:
      return <IconCamera size={size} />;
  }
}

function iconTone(step: Step) {
  if (step.kind === "approval") return "bg-warn-50 text-warn-700 ring-warn-100";
  if (step.kind === "model") return "bg-brand-50 text-brand-700 ring-brand-100";
  if (step.kind === "note") return "bg-surface text-ink-500 ring-line-strong";
  return "bg-white text-ink-700 ring-line-strong";
}

function StepRow({
  run,
  step,
  selected,
  onSelect,
}: {
  run: Run;
  step: Step;
  selected: boolean;
  onSelect: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="anim-slide-in relative pl-9">
      <span
        className={`absolute left-0 top-2 grid h-[26px] w-[26px] place-items-center rounded-lg ring-1 ring-inset ${iconTone(step)}`}
      >
        <StepIcon step={step} />
      </span>
      <button
        onClick={() => step.screenshot && onSelect(step.n)}
        className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
          selected ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : step.screenshot ? "hover:bg-surface" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <span className="tnum font-mono font-semibold text-ink-500">#{step.n}</span>
          <span className="tnum font-mono">{stepOffset(run, step)}</span>
          {step.screenshot && <IconCamera size={11} className="ml-auto text-ink-300" />}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-900">{step.summary}</p>
      </button>
      {step.modelText && (
        <div className="px-2.5 pb-1">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:text-brand-800"
          >
            <IconChevronDown size={12} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
            {open ? "Hide model text" : "Model text"}
          </button>
          {open && (
            <p className="anim-fade-in mt-1.5 whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-2 font-mono text-[11.5px] leading-relaxed text-ink-700">
              {step.modelText}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function StepTimeline({
  run,
  selected,
  onSelect,
}: {
  run: Run;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const live = !isTerminal(run);
  useEffect(() => {
    if (live && selected == null && ref.current)
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [run.steps.length, live, selected]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink-950">Steps</h2>
        <span className="tnum text-[12px] text-ink-400">{run.steps.length}</span>
      </header>
      <div ref={ref} className="panel-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {run.steps.length === 0 ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-[26px] w-[26px] rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5 pt-1">
                  <div className="skeleton h-2.5 w-16 rounded" />
                  <div className="skeleton h-3 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ol className="relative flex flex-col gap-1 before:absolute before:bottom-3 before:left-[12.5px] before:top-3 before:w-px before:bg-line">
            {run.steps.map((s) => (
              <StepRow key={s.n} run={run} step={s} selected={selected === s.n} onSelect={onSelect} />
            ))}
          </ol>
        )}
        {live && run.steps.length > 0 && (
          <div className="mt-2 flex items-center gap-2 pl-9 text-[12px] text-brand-700">
            <span className="anim-live-dot h-1.5 w-1.5 rounded-full bg-brand-500" />
            {(run.phase || "Working").replace(/[.…]+$/, "")}...
          </div>
        )}
      </div>
    </section>
  );
}
