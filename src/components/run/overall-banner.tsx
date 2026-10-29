import type { Run } from "@/lib/types";
import { IconCheck, IconQuestion, IconX } from "../icons";

export function OverallBanner({ run }: { run: Run }) {
  if (!run.overall) return null;
  const n = run.verdicts.length;
  const broken = run.verdicts.filter((v) => v.status === "contradicted").length;
  const held = run.verdicts.filter((v) => v.status === "supported").length;
  const open = run.verdicts.filter((v) => v.status === "unresolved").length;

  const cfg =
    run.overall === "pass"
      ? {
          word: "PASS",
          line: `${held} of ${n} ${n === 1 ? "promise" : "promises"} held. A customer gets what the ad says.`,
          box: "border-pass-100 bg-gradient-to-r from-pass-50 to-white",
          badge: "bg-pass-500",
          text: "text-pass-700",
          icon: <IconCheck size={22} strokeWidth={2.6} />,
        }
      : run.overall === "fail"
        ? {
            word: "FAIL",
            line: `${broken} of ${n} ${n === 1 ? "promise" : "promises"} broken. A customer cannot get the offer this ad promises.`,
            box: "border-fail-100 bg-gradient-to-r from-fail-50 to-white",
            badge: "bg-fail-500",
            text: "text-fail-700",
            icon: <IconX size={22} strokeWidth={2.6} />,
          }
        : {
            word: "UNRESOLVED",
            line: `${open} of ${n} ${n === 1 ? "promise" : "promises"} could not be checked. No verdict without proof.`,
            box: "border-warn-100 bg-gradient-to-r from-warn-50 to-white",
            badge: "bg-warn-500",
            text: "text-warn-700",
            icon: <IconQuestion size={22} strokeWidth={2.6} />,
          };

  return (
    <div className={`anim-pop-in flex items-center gap-5 rounded-xl border px-5 py-4 shadow-[var(--shadow-card)] ${cfg.box}`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-sm ${cfg.badge}`}>{cfg.icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[26px] font-bold leading-none tracking-[0.02em] ${cfg.text}`}>{cfg.word}</div>
        <p className="mt-1.5 text-[14.5px] font-medium text-ink-900">{cfg.line}</p>
      </div>
      <div className="tnum flex shrink-0 gap-4 text-center">
        {[
          { k: "Held", v: held, c: "text-pass-700" },
          { k: "Broken", v: broken, c: "text-fail-700" },
          { k: "Unresolved", v: open, c: "text-warn-700" },
        ].map((x) => (
          <div key={x.k} className="min-w-[64px]">
            <div className={`text-[22px] font-semibold ${x.v ? x.c : "text-ink-300"}`}>{x.v}</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-400">{x.k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
