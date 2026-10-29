"use client";

import { useActionState } from "react";
import { joinTrailClub, type JoinState } from "../../funnel-actions";
import { btnPrimary, card, input, label } from "../../_components/ui";

export function JoinForm({ requiresCard }: { requiresCard: boolean }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinTrailClub, {});
  const v = state.values;
  const k = state.attempt ?? 0;

  return (
    <form action={action} key={k} className={`${card} p-6`} noValidate>
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className={label}>Name</label>
          <input id="name" name="name" type="text" autoComplete="name" placeholder="First and last name" defaultValue={v?.name} className={input} />
        </div>
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={v?.email} className={input} />
        </div>
        <div>
          <label htmlFor="password" className={label}>Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" className={input} />
        </div>
      </div>

      {requiresCard && (
        <div className="mt-6 border-t border-[#E2DCCF] pt-6">
          <h2 className="text-[18px] font-semibold">Payment details</h2>
          <p className="mt-1 text-[15px] text-[#4A504A]" data-testid="trial-card-note">
            A card is required to start your trial. You won&apos;t be charged until your trial ends.
          </p>
          <div className="mt-3 grid grid-cols-[1fr_130px_110px] gap-4">
            <div>
              <label htmlFor="card" className={label}>Card number</label>
              <input id="card" name="card" type="text" inputMode="numeric" autoComplete="cc-number" placeholder="Card number" defaultValue={v?.card} className={input} />
            </div>
            <div>
              <label htmlFor="expiry" className={label}>Expiry (MM/YY)</label>
              <input id="expiry" name="expiry" type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" defaultValue={v?.expiry} className={input} />
            </div>
            <div>
              <label htmlFor="cvc" className={label}>CVC</label>
              <input id="cvc" name="cvc" type="text" inputMode="numeric" autoComplete="cc-csc" placeholder="3 digits" defaultValue={v?.cvc} className={input} />
            </div>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" data-testid="join-error" className="mt-5 rounded-md border border-[#E7C3BB] bg-[#FBEDEA] px-4 py-3 text-[15px] font-semibold text-[#A63A2B]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        {...(requiresCard ? { "data-requires-approval": "payment" } : {})}
        className={`${btnPrimary} mt-6 w-full`}
      >
        {pending ? "Starting trial..." : "Start free trial"}
      </button>
    </form>
  );
}
