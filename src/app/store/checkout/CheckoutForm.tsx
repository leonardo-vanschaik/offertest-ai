"use client";

import { useActionState } from "react";
import { placeOrder, type CheckoutState } from "../actions";
import { btnPrimary, card, input, label } from "../_components/ui";

export function CheckoutForm() {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const v = state.values;
  // key remounts the inputs so they show the values returned with a failed attempt
  const k = state.attempt ?? 0;

  return (
    <form action={action} key={k} className={`${card} p-6`} noValidate>
      <h2 className="text-[18px] font-semibold">Contact</h2>
      <div className="mt-3">
        <label htmlFor="email" className={label}>Email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={v?.email} className={input} />
      </div>

      <h2 className="mt-6 text-[18px] font-semibold">Shipping</h2>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className={label}>Full name</label>
          <input id="name" name="name" type="text" autoComplete="name" placeholder="First and last name" defaultValue={v?.name} className={input} />
        </div>
        <div>
          <label htmlFor="address" className={label}>Address</label>
          <input id="address" name="address" type="text" autoComplete="street-address" placeholder="Street, city, state, ZIP" defaultValue={v?.address} className={input} />
        </div>
      </div>

      <h2 className="mt-6 text-[18px] font-semibold">Payment</h2>
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

      {state.error && (
        <p role="alert" data-testid="checkout-error" className="mt-5 rounded-md border border-[#E7C3BB] bg-[#FBEDEA] px-4 py-3 text-[15px] font-semibold text-[#A63A2B]">
          {state.error}
        </p>
      )}

      <button type="submit" data-requires-approval="payment" disabled={pending} className={`${btnPrimary} mt-6 w-full`}>
        {pending ? "Placing order..." : "Place order"}
      </button>
    </form>
  );
}
