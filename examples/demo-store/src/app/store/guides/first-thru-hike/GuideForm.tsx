"use client";

import { useActionState } from "react";
import { requestGuide, type GuideState } from "../../funnel-actions";
import { btnPrimary, card, input, label } from "../../_components/ui";

export function GuideForm() {
  const [state, action, pending] = useActionState<GuideState, FormData>(requestGuide, {});

  return (
    <form action={action} key={state.attempt ?? 0} className={`${card} p-6`} noValidate>
      <h2 className="text-[20px] font-semibold">Get the free guide</h2>
      <p className="mt-1 text-[15px] text-[#5F655F]">Enter your email and download the PDF right away.</p>
      <div className="mt-4">
        <label htmlFor="email" className={label}>Email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={state.email} className={input} />
      </div>
      {state.error && (
        <p role="alert" data-testid="guide-error" className="mt-4 rounded-md border border-[#E7C3BB] bg-[#FBEDEA] px-4 py-3 text-[15px] font-semibold text-[#A63A2B]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} mt-5 w-full`}>
        {pending ? "Sending..." : "Get the guide"}
      </button>
      <p className="mt-3 text-[13px] text-[#6B706A]">We send trail tips about twice a month. Unsubscribe anytime.</p>
    </form>
  );
}
