import type { Run } from "@/lib/types";
import { formatCents } from "@/lib/types";
import { IconAlert, IconBag, IconCheck } from "../icons";
import { Card } from "../ui";

export function OrderCard({ run }: { run: Run }) {
  const o = run.order;
  if (!o) return null;
  return (
    <Card as="section" className="anim-slide-in p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-pass-500 text-white">
          <IconBag size={16} />
        </span>
        <div>
          <h2 className="text-[14px] font-semibold text-ink-950">Test-mode order placed</h2>
          <p className="text-[12px] text-ink-500">Test card 4242 · no real money moved</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Order</dt>
          <dd className="tnum font-mono text-[17px] font-semibold text-ink-950">{o.id}</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Total</dt>
          <dd className="tnum text-[17px] font-semibold text-ink-950">{formatCents(o.totalCents)}</dd>
        </div>
      </dl>
      {o.confirmedInAdmin ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-pass-50 px-3 py-2 text-[13px] font-semibold text-pass-700 ring-1 ring-inset ring-pass-100">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-pass-500 text-white">
            <IconCheck size={10} strokeWidth={3} />
          </span>
          Found in store admin ✓
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-warn-50 px-3 py-2 text-[13px] font-semibold text-warn-700 ring-1 ring-inset ring-warn-100">
          <IconAlert size={14} /> Not found in store admin yet
        </div>
      )}
    </Card>
  );
}
