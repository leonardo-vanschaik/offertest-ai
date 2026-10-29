import type { AssertionKind, RunStatus, VerdictStatus } from "@/lib/types";
import { IconCheck, IconMinus, IconQuestion, IconX } from "./icons";

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={`rounded-xl border border-line bg-white shadow-[var(--shadow-card)] ${className}`}>{children}</Tag>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{children}</h2>
      {right}
    </div>
  );
}

type Tone = "neutral" | "brand" | "pass" | "fail" | "warn" | "dark";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface text-ink-700 ring-line-strong",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  pass: "bg-pass-50 text-pass-700 ring-pass-100",
  fail: "bg-fail-50 text-fail-700 ring-fail-100",
  warn: "bg-warn-50 text-warn-700 ring-warn-100",
  dark: "bg-ink-900 text-white ring-ink-900",
};

export function Chip({
  tone = "neutral",
  children,
  className = "",
  mono = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        mono ? "font-mono" : ""
      } ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ModelBadge({ model, role }: { model: string; role: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-100 bg-brand-50/70 py-0.5 pl-1 pr-2.5 text-[11.5px] font-medium text-brand-800">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-600 text-white">
        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1l1.3 3.7L11 6 7.3 7.3 6 11 4.7 7.3 1 6l3.7-1.3z" fill="currentColor" />
        </svg>
      </span>
      {model}
      <span className="text-brand-400">·</span>
      <span className="font-normal text-brand-700">{role}</span>
    </span>
  );
}

export const VERDICT_META: Record<
  VerdictStatus,
  { label: string; tone: Tone; solid: string; soft: string; text: string; ring: string }
> = {
  supported: {
    label: "Supported",
    tone: "pass",
    solid: "bg-pass-500",
    soft: "bg-pass-50",
    text: "text-pass-700",
    ring: "ring-pass-100",
  },
  contradicted: {
    label: "Contradicted",
    tone: "fail",
    solid: "bg-fail-500",
    soft: "bg-fail-50",
    text: "text-fail-700",
    ring: "ring-fail-100",
  },
  unresolved: {
    label: "Unresolved",
    tone: "warn",
    solid: "bg-warn-500",
    soft: "bg-warn-50",
    text: "text-warn-700",
    ring: "ring-warn-100",
  },
  outside_scope: {
    label: "Outside scope",
    tone: "neutral",
    solid: "bg-ink-400",
    soft: "bg-surface",
    text: "text-ink-700",
    ring: "ring-line-strong",
  },
};

export function VerdictIcon({ status, size = 12 }: { status: VerdictStatus; size?: number }) {
  if (status === "supported") return <IconCheck size={size} strokeWidth={2.6} />;
  if (status === "contradicted") return <IconX size={size} strokeWidth={2.6} />;
  if (status === "unresolved") return <IconQuestion size={size} strokeWidth={2.6} />;
  return <IconMinus size={size} strokeWidth={2.6} />;
}

export function VerdictBadge({ status, size = "md" }: { status: VerdictStatus; size?: "sm" | "md" | "lg" }) {
  const m = VERDICT_META[status];
  if (size === "lg") {
    return (
      <span
        className={`anim-stamp inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-white ${m.solid} shadow-sm`}
      >
        <VerdictIcon status={status} size={14} />
        {m.label}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-semibold ring-1 ring-inset ${
        size === "sm" ? "text-[10.5px]" : "text-[11.5px]"
      } ${m.soft} ${m.text} ${m.ring}`}
    >
      <VerdictIcon status={status} size={size === "sm" ? 10 : 11} />
      {m.label}
    </span>
  );
}

export const KIND_LABEL: Record<AssertionKind, string> = {
  discount_code: "Discount code",
  price: "Price",
  free_shipping: "Free shipping",
  availability: "Availability",
  other: "Other",
};

export function KindChip({ kind }: { kind: AssertionKind }) {
  return <Chip tone="neutral">{KIND_LABEL[kind]}</Chip>;
}

const STATUS_META: Record<RunStatus, { label: string; tone: "live" | "wait" | "ok" | "bad" | "idle" }> = {
  queued: { label: "Queued", tone: "idle" },
  extracting: { label: "Reading the ad", tone: "live" },
  shopping: { label: "Shopping", tone: "live" },
  awaiting_approval: { label: "Needs approval", tone: "wait" },
  judging: { label: "Judging", tone: "live" },
  proposing_fix: { label: "Proposing fix", tone: "live" },
  done: { label: "Done", tone: "ok" },
  error: { label: "Error", tone: "bad" },
};

export function statusLabel(s: RunStatus) {
  return STATUS_META[s].label;
}

export function StatusPill({ status, text, size = "md" }: { status: RunStatus; text?: string; size?: "sm" | "md" }) {
  const t = STATUS_META[status].tone;
  const cls =
    t === "live"
      ? "border-brand-200 bg-brand-50 text-brand-800"
      : t === "wait"
        ? "border-warn-100 bg-warn-50 text-warn-700"
        : t === "ok"
          ? "border-pass-100 bg-pass-50 text-pass-700"
          : t === "bad"
            ? "border-fail-100 bg-fail-50 text-fail-700"
            : "border-line-strong bg-surface text-ink-700";
  const dot =
    t === "live"
      ? "bg-brand-500 anim-live-dot"
      : t === "wait"
        ? "bg-warn-500"
        : t === "ok"
          ? "bg-pass-500"
          : t === "bad"
            ? "bg-fail-500"
            : "bg-ink-400";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-full border font-medium ${
        size === "sm" ? "px-2 py-0.5 text-[11.5px]" : "px-3 py-1 text-[13px]"
      } ${cls}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{text ?? STATUS_META[status].label}</span>
    </span>
  );
}

export function OverallChip({ overall }: { overall?: "pass" | "fail" | "unresolved" }) {
  if (!overall) return <span className="text-xs text-ink-400">No result yet</span>;
  if (overall === "pass")
    return (
      <Chip tone="pass" className="font-semibold">
        <IconCheck size={11} strokeWidth={2.6} /> PASS
      </Chip>
    );
  if (overall === "fail")
    return (
      <Chip tone="fail" className="font-semibold">
        <IconX size={11} strokeWidth={2.6} /> FAIL
      </Chip>
    );
  return (
    <Chip tone="warn" className="font-semibold">
      <IconQuestion size={11} strokeWidth={2.6} /> UNRESOLVED
    </Chip>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "success" }) {
  const v =
    variant === "primary"
      ? "bg-brand-600 text-white shadow-[0_1px_2px_rgba(10,112,220,0.3),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-brand-700"
      : variant === "success"
        ? "bg-pass-600 text-white shadow-[0_1px_2px_rgba(15,154,90,0.3),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-pass-700"
        : variant === "danger"
          ? "bg-white text-fail-700 ring-1 ring-inset ring-fail-100 hover:bg-fail-50"
          : variant === "secondary"
            ? "bg-white text-ink-900 ring-1 ring-inset ring-line-strong shadow-[var(--shadow-card)] hover:bg-surface"
            : "text-ink-700 hover:bg-surface";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
