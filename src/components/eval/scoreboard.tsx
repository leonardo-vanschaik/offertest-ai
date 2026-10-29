import Link from "next/link";
import { formatDateTime, formatSeconds, formatUsd } from "../format";
import { IconAlert, IconChart, IconCheck, IconQuestion, IconX } from "../icons";
import { Card, Chip, SectionLabel } from "../ui";
import type { EvalCaseResult, EvalCaseRun, EvalResults, EvalSummary } from "./types";

function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function honestPassed(cases: EvalCaseResult[], key: "agent" | "oneCall") {
  const honest = cases.filter((c) => c.expected === "pass");
  return { passed: honest.filter((c) => c[key]?.got === "pass").length, honest: honest.length };
}

function caught(cases: EvalCaseResult[], key: "agent" | "oneCall") {
  const broken = cases.filter((c) => c.expected === "fail");
  return { caught: broken.filter((c) => c[key]?.got === "fail").length, broken: broken.length };
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pass" | "fail" | "warn" }) {
  const c = tone === "pass" ? "text-pass-700" : tone === "fail" ? "text-fail-700" : tone === "warn" ? "text-warn-700" : "text-ink-950";
  return (
    <Card className="flex flex-col gap-1 px-4 py-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</span>
      <span className={`tnum text-[26px] font-semibold leading-tight tracking-[-0.02em] ${c}`}>{value}</span>
      {sub && <span className="tnum text-[12px] text-ink-500">{sub}</span>}
    </Card>
  );
}

function Bar({
  label,
  sub,
  value,
  max,
  tone,
}: {
  label: string;
  sub: string;
  value: number;
  max: number;
  tone: "brand" | "grey";
}) {
  const w = max ? (value / max) * 100 : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-ink-950">{label}</span>
        <span className="tnum text-[13px] text-ink-500">{sub}</span>
      </div>
      <div className="h-10 overflow-hidden rounded-lg bg-surface ring-1 ring-inset ring-line">
        <div
          className={`flex h-full items-center justify-end rounded-lg px-3 text-[15px] font-semibold text-white transition-[width] duration-700 ${
            tone === "brand" ? "bg-gradient-to-r from-brand-500 to-brand-600" : "bg-ink-400"
          }`}
          style={{ width: `${Math.max(w, 8)}%` }}
        >
          <span className="tnum">
            {value} of {max}
          </span>
        </div>
      </div>
    </div>
  );
}

function GotChip({ r, expected }: { r?: EvalCaseRun; expected: "pass" | "fail" }) {
  if (!r) return <span className="text-ink-300">-</span>;
  const right = r.got === expected;
  const label = r.error ? "Error" : r.got === "pass" ? "Pass" : r.got === "fail" ? "Fail" : "Unresolved";
  const tone = r.error || r.got === "unresolved" ? "warn" : r.got === "fail" ? "fail" : "pass";
  return (
    <span className="inline-flex items-center gap-2">
      <Chip tone={tone}>{label}</Chip>
      {right ? (
        <IconCheck size={14} strokeWidth={2.6} className="text-pass-600" />
      ) : r.got === "unresolved" ? (
        <IconQuestion size={14} strokeWidth={2.4} className="text-warn-600" />
      ) : (
        <IconX size={14} strokeWidth={2.6} className="text-fail-600" />
      )}
    </span>
  );
}

function CompareRow({ label, a, b, better }: { label: string; a: string; b?: string; better?: "a" | "b" | null }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2.5 pl-5 text-[13px] text-ink-700">{label}</td>
      <td className={`tnum py-2.5 text-right text-[13.5px] font-semibold ${better === "a" ? "text-brand-700" : "text-ink-950"}`}>{a}</td>
      <td className={`tnum py-2.5 pr-5 text-right text-[13.5px] font-semibold ${better === "b" ? "text-brand-700" : "text-ink-500"}`}>
        {b ?? "-"}
      </td>
    </tr>
  );
}

export function EvalScoreboard({ data, sample }: { data: EvalResults; sample: boolean }) {
  const a = data.agent;
  const o = data.oneCall;
  const ca = caught(data.cases, "agent");
  const co = o ? caught(data.cases, "oneCall") : null;
  const per = (s: EvalSummary, v: number) => (s.total ? v / s.total : 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[30px] font-semibold tracking-[-0.025em] text-ink-950">Eval scoreboard</h1>
            {sample ? (
              <Chip tone="warn" className="font-semibold">
                <IconAlert size={11} /> Sample data, not a real run
              </Chip>
            ) : (
              <Chip tone="pass" className="font-semibold">
                <IconCheck size={11} strokeWidth={2.6} /> Real data
              </Chip>
            )}
          </div>
          <p className="mt-1 text-[14.5px] text-ink-500">
            {a.total} frozen cases: real ads against store scenarios. Labels were set before the scored run.
          </p>
        </div>
        <div className="tnum text-right text-[12.5px] text-ink-500">
          Ran {formatDateTime(data.ranAt)}
          <div className="font-mono text-[11.5px] text-ink-400">eval/results/latest.json</div>
        </div>
      </div>

      <Card className="grid grid-cols-[minmax(0,1fr)_380px] gap-8 p-6">
        <div className="flex flex-col gap-5">
          <SectionLabel>Broken offers caught</SectionLabel>
          <Bar
            label="OfferTest agent"
            sub={`Shops the store · ${formatUsd(per(a, a.usd))} and ${formatSeconds(per(a, a.ms))} per test`}
            value={ca.caught}
            max={ca.broken}
            tone="brand"
          />
          {o && co && (
            <Bar
              label="One model call, no agent"
              sub={`Reads the landing page once · ${formatUsd(per(o, o.usd))} and ${formatSeconds(per(o, o.ms))} per test`}
              value={co.caught}
              max={co.broken}
              tone="grey"
            />
          )}
          <div className="mt-1 border-t border-line pt-4">
            <SectionLabel>Honest offers passed (no false alarm)</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-6">
              <Bar label="Agent" sub="" value={honestPassed(data.cases, "agent").passed} max={honestPassed(data.cases, "agent").honest} tone="brand" />
              {o && (
                <Bar label="One call" sub="" value={honestPassed(data.cases, "oneCall").passed} max={honestPassed(data.cases, "oneCall").honest} tone="grey" />
              )}
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full">
            <thead className="bg-surface-2">
              <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                <th className="py-2.5 pl-5 text-left font-semibold">Metric</th>
                <th className="py-2.5 text-right font-semibold text-brand-700">Agent</th>
                <th className="py-2.5 pr-5 text-right font-semibold">One call</th>
              </tr>
            </thead>
            <tbody>
              <CompareRow label="Correct verdicts" a={`${a.hits} / ${a.total}`} b={o && `${o.hits} / ${o.total}`} better={o ? (a.hits >= o.hits ? "a" : "b") : null} />
              <CompareRow label="Misses" a={String(a.misses)} b={o && String(o.misses)} better={o ? (a.misses <= o.misses ? "a" : "b") : null} />
              <CompareRow label="False alarms" a={String(a.falseAlarms)} b={o && String(o.falseAlarms)} better={o ? (a.falseAlarms <= o.falseAlarms ? "a" : "b") : null} />
              <CompareRow label="Unresolved" a={pct(a.unresolved, a.total)} b={o && pct(o.unresolved, o.total)} />
              <CompareRow label="Completed" a={pct(a.completed, a.total)} b={o && pct(o.completed, o.total)} />
              <CompareRow label="Cost per test" a={formatUsd(per(a, a.usd))} b={o && formatUsd(per(o, o.usd))} />
              <CompareRow label="Time per test" a={formatSeconds(per(a, a.ms))} b={o && formatSeconds(per(o, o.ms))} />
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-4 xl:grid-cols-8">
        <Tile label="Total cases" value={String(a.total)} sub={`${ca.broken} broken · ${a.total - ca.broken} honest`} />
        <Tile label="Hits" value={String(a.hits)} sub={`${pct(a.hits, a.total)} correct`} tone="pass" />
        <Tile label="Misses" value={String(a.misses)} sub="Broken, not flagged" tone={a.misses ? "fail" : undefined} />
        <Tile label="False alarms" value={String(a.falseAlarms)} sub="Honest, flagged" tone={a.falseAlarms ? "fail" : undefined} />
        <Tile label="Unresolved" value={pct(a.unresolved, a.total)} sub={`${a.unresolved} cases`} tone={a.unresolved ? "warn" : undefined} />
        <Tile label="Completed" value={pct(a.completed, a.total)} sub={`${a.completed} of ${a.total}`} />
        <Tile label="Cost" value={formatUsd(a.usd)} sub={`${formatUsd(per(a, a.usd))} per test`} />
        <Tile label="Time" value={formatSeconds(a.ms)} sub={`${formatSeconds(per(a, a.ms))} per test`} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel right={<span className="tnum text-[12px] text-ink-400">{data.cases.length} cases</span>}>Cases</SectionLabel>
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-surface-2">
              <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                <th className="py-2.5 pl-5 text-left font-semibold">Case</th>
                <th className="py-2.5 text-left font-semibold">Ad headline</th>
                <th className="py-2.5 text-left font-semibold">Expected</th>
                <th className="py-2.5 text-left font-semibold text-brand-700">Agent got</th>
                {o && <th className="py-2.5 text-left font-semibold">One call got</th>}
                <th className="py-2.5 text-right font-semibold">Cost</th>
                <th className="py-2.5 pr-5 text-right font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.cases.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <td className="py-2.5 pl-5">
                    <div className="font-mono text-[12px] font-medium text-ink-900">{c.id}</div>
                    <div className="font-mono text-[11px] text-ink-400">{c.scenario}</div>
                  </td>
                  <td className="max-w-[360px] truncate py-2.5 pr-4 text-ink-700">{c.adHeadline}</td>
                  <td className="py-2.5">
                    <Chip tone={c.expected === "fail" ? "fail" : "pass"}>{c.expected === "fail" ? "Fail" : "Pass"}</Chip>
                  </td>
                  <td className="py-2.5">
                    {c.agent.runId && !sample ? (
                      <Link href={`/runs/${c.agent.runId}`} className="hover:opacity-80">
                        <GotChip r={c.agent} expected={c.expected} />
                      </Link>
                    ) : (
                      <GotChip r={c.agent} expected={c.expected} />
                    )}
                  </td>
                  {o && (
                    <td className="py-2.5">
                      <GotChip r={c.oneCall} expected={c.expected} />
                    </td>
                  )}
                  <td className="tnum py-2.5 text-right text-ink-700">{formatUsd(c.agent.usd)}</td>
                  <td className="tnum py-2.5 pr-5 text-right text-ink-700">{formatSeconds(c.agent.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

export function EvalEmpty() {
  return (
    <Card className="mx-auto mt-16 flex max-w-lg flex-col items-center gap-3 px-8 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
        <IconChart size={22} />
      </span>
      <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-ink-950">No eval results yet</h1>
      <p className="text-[14px] leading-relaxed text-ink-500">
        Run <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-ink-900">npx tsx eval/run.ts --mode both</code>{" "}
        with the app on port 3000. The scoreboard reads <span className="font-mono text-[12.5px]">eval/results/latest.json</span>.
      </p>
      <Link href="/eval?sample=1" className="mt-1 text-[13px] font-semibold text-brand-700 hover:text-brand-800">
        Preview with sample data
      </Link>
    </Card>
  );
}
