"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import type { Run, Step } from "@/lib/types";
import { describeAction, displayUrl, isTerminal, lastPointer } from "../format";
import { IconLock, IconPlay } from "../icons";

const SHOT_W = 1280;
const SHOT_H = 800;

export function BrowserChrome({
  url,
  children,
  glow = false,
  right,
}: {
  url?: string;
  children: React.ReactNode;
  glow?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line-strong bg-white ${
        glow ? "agent-glow" : "shadow-[var(--shadow-raised)]"
      }`}
    >
      <div className="flex h-10 items-center gap-3 border-b border-line bg-[#f7f8fa] px-3.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex h-6 min-w-0 max-w-[70%] flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 font-mono text-[11.5px] text-ink-500 ring-1 ring-inset ring-line">
          <IconLock size={11} className="shrink-0 text-ink-400" />
          <span className="truncate">{displayUrl(url) || "about:blank"}</span>
        </div>
        <div className="flex w-[52px] justify-end">{right}</div>
      </div>
      {children}
    </div>
  );
}

function AgentCursor({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="cursor-move pointer-events-none absolute z-20"
      style={{ left: `${(x / SHOT_W) * 100}%`, top: `${(y / SHOT_H) * 100}%` }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        className="-translate-x-[3px] -translate-y-[2px] drop-shadow-[0_0_8px_rgba(11,132,243,0.65)]"
        aria-hidden="true"
      >
        <path d="M4 2.5l15 8.2-6.4 1.8-3 6.3z" fill="#0b84f3" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span
        className={`absolute whitespace-nowrap rounded-full ${x / SHOT_W > 0.82 ? "right-3" : "left-5"} ${y / SHOT_H > 0.9 ? "-top-7" : "top-5"} bg-brand-600 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-[0_4px_12px_rgba(10,112,220,0.4)]`}
      >
        Muse Wonder
      </span>
    </div>
  );
}

function ClickRipple({ x, y }: { x: number; y: number }) {
  const style = { left: `${(x / SHOT_W) * 100}%`, top: `${(y / SHOT_H) * 100}%` };
  return (
    <>
      <span
        className="anim-ripple pointer-events-none absolute z-10 h-12 w-12 rounded-full border-2 border-brand-500 bg-brand-400/20"
        style={style}
      />
      <span
        className="pointer-events-none absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/70"
        style={style}
      >
        <span className="absolute left-1/2 top-[-5px] h-[30px] w-px -translate-x-1/2 bg-brand-500/50" />
        <span className="absolute left-[-5px] top-1/2 h-px w-[30px] -translate-y-1/2 bg-brand-500/50" />
      </span>
    </>
  );
}

export function ScreenView({
  run,
  step,
  live,
}: {
  run: Run;
  step: Step | undefined;
  live: boolean;
}) {
  const ptr = lastPointer(step);
  const isClick = ptr && (ptr.kind === "click" || ptr.kind === "double_click");
  const caption = step?.actions?.filter((a) => a.type !== "screenshot").map(describeAction).join("  ·  ");
  const agentActive = live && (run.status === "shopping" || run.status === "extracting");

  return (
    <BrowserChrome
      url={step?.url ?? (step ? undefined : run.landingUrl)}
      glow={agentActive}
      right={
        step ? (
          <span className="tnum rounded bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-ink-500 ring-1 ring-inset ring-line">
            #{step.n}
          </span>
        ) : null
      }
    >
      <div className="relative w-full overflow-hidden bg-surface" style={{ aspectRatio: `${SHOT_W} / ${SHOT_H}` }}>
        {step?.screenshot ? (
          <img key={step.screenshot} src={step.screenshot} alt={`Step ${step.n}`} className="anim-fade-in absolute inset-0 h-full w-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-400">
            {run.status === "error" ? (
              <span className="text-[13px]">No screenshot.</span>
            ) : (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                <span className="text-[13px] font-medium">Opening a fresh browser...</span>
              </>
            )}
          </div>
        )}
        {ptr && step?.screenshot && (
          <>
            {isClick && <ClickRipple key={`r${step.n}`} x={ptr.x} y={ptr.y} />}
            <AgentCursor x={ptr.x} y={ptr.y} />
          </>
        )}
        {caption && (
          <div
            key={`c${step?.n}`}
            className="anim-slide-in absolute bottom-3 left-3 z-30 max-w-[80%] truncate rounded-lg border border-white/60 bg-white/85 px-2.5 py-1.5 font-mono text-[11.5px] font-medium text-ink-900 shadow-[var(--shadow-raised)] backdrop-blur-md"
          >
            <span className="mr-1.5 text-brand-600">#{step?.n}</span>
            {caption}
          </div>
        )}
        {agentActive && (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-brand-700 shadow-[var(--shadow-raised)] backdrop-blur-md">
            <span className="anim-live-dot h-1.5 w-1.5 rounded-full bg-brand-500" />
            Agent is shopping
          </div>
        )}
      </div>
    </BrowserChrome>
  );
}

export function Filmstrip({
  steps,
  selectedN,
  following,
  onSelect,
  onFollow,
}: {
  steps: Step[];
  selectedN: number | undefined;
  following: boolean;
  onSelect: (n: number) => void;
  onFollow: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (following && ref.current) ref.current.scrollTo({ left: ref.current.scrollWidth, behavior: "smooth" });
  }, [following, steps.length]);

  return (
    <div className="flex items-center gap-3">
      <div ref={ref} className="panel-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {steps.length === 0 && <div className="skeleton h-[54px] w-[86px] shrink-0 rounded-md" />}
        {steps.map((s) => {
          const active = s.n === selectedN;
          return (
            <button
              key={s.n}
              onClick={() => onSelect(s.n)}
              className={`anim-slide-in group relative h-[54px] w-[86px] shrink-0 overflow-hidden rounded-md border bg-surface transition-[box-shadow,border-color] ${
                active ? "border-brand-500 ring-2 ring-brand-200" : "border-line-strong hover:border-ink-300"
              }`}
              title={s.summary}
            >
              {s.screenshot && <img src={s.screenshot} alt="" className="h-full w-full object-cover object-top" />}
              <span
                className={`tnum absolute bottom-0.5 left-0.5 rounded px-1 font-mono text-[9.5px] font-semibold ${
                  active ? "bg-brand-600 text-white" : "bg-white/90 text-ink-700"
                }`}
              >
                {s.n}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onFollow}
        disabled={following}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
          following ? "text-ink-300" : "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100"
        }`}
      >
        <IconPlay size={11} /> Latest
      </button>
    </div>
  );
}

export function AgentScreenPanel({
  run,
  selected,
  onSelect,
}: {
  run: Run;
  selected: number | null;
  onSelect: (n: number | null) => void;
}) {
  const shots = run.steps.filter((s) => s.screenshot);
  const latest = shots[shots.length - 1];
  const step = selected != null ? run.steps.find((s) => s.n === selected) ?? latest : latest;
  const shown = step?.screenshot ? step : latest;
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13.5px] font-semibold text-ink-950">Agent&apos;s screen</h2>
        <span className="tnum text-[12px] text-ink-400">
          {shots.length} screenshots · 1280 × 800 {selected != null && shown ? `· viewing step ${shown.n}` : ""}
        </span>
      </div>
      <ScreenView run={run} step={shown} live={!isTerminal(run) && selected == null} />
      <Filmstrip
        steps={shots}
        selectedN={shown?.n}
        following={selected == null}
        onSelect={(n) => onSelect(n)}
        onFollow={() => onSelect(null)}
      />
    </section>
  );
}
