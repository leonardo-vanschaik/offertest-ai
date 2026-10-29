/* eslint-disable @next/next/no-img-element */
import type { Run } from "@/lib/types";
import { IconBox } from "../icons";
import { Card, ModelBadge } from "../ui";

const COLORS = ["#0b84f3", "#17b26a", "#f59e0b", "#a855f7", "#ef4444"];

export function SamPanel({ run }: { run: Run }) {
  const sam = run.sam;
  if (!sam) return null;
  return (
    <Card as="section" className="anim-slide-in overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          <IconBox size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-ink-950">What the agent saw</h2>
          <p className="text-[12px] text-ink-500">Objects found in the screenshot</p>
        </div>
        <ModelBadge model="SAM 3.1" role="boxes" />
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-5 p-4">
        <div className="relative overflow-hidden rounded-lg border border-line-strong bg-surface">
          <img src={sam.screenshot} alt="Screenshot with boxes" className="block w-full" />
          {sam.boxes.map((b, i) => {
            const c = COLORS[i % COLORS.length];
            const nearRight = b.right / b.w > 0.8;
            const nearTop = b.top / b.h < 0.04;
            return (
              <div
                key={i}
                className="anim-fade-in absolute rounded-[3px]"
                style={{
                  left: `${(b.left / b.w) * 100}%`,
                  top: `${(b.top / b.h) * 100}%`,
                  width: `${((b.right - b.left) / b.w) * 100}%`,
                  height: `${((b.bottom - b.top) / b.h) * 100}%`,
                  border: `2px solid ${c}`,
                  background: `${c}14`,
                  animationDelay: `${i * 120}ms`,
                }}
              >
                <span
                  className={`absolute whitespace-nowrap px-1.5 py-[1px] text-[10.5px] font-semibold text-white ${
                    nearTop ? "top-0 rounded-br-[3px]" : "-top-[19px] rounded-t-[3px]"
                  } ${nearRight ? "right-[-2px]" : "left-[-2px]"}`}
                  style={{ background: c }}
                >
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <span className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Boxes</span>
          {sam.boxes.map((b, i) => (
            <span key={i} className="inline-flex w-full items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 text-[11.5px] font-medium text-ink-700 ring-1 ring-inset ring-line">
              <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
              {b.label}
              <span className="tnum ml-auto font-mono text-[10.5px] text-ink-400">
                {Math.round(b.right - b.left)}×{Math.round(b.bottom - b.top)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
