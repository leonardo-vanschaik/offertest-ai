# Alder Trail Co. (demo store)

A small store we own, with switchable offer bugs. OfferTest's eval and demo video run against it.

```bash
npm install
npm run dev            # http://localhost:3000/store
```

Switch the scenario at `/store/admin`, or:

```bash
curl -X POST localhost:3000/api/store/scenario -H 'content-type: application/json' -d '{"scenario":"code_expired"}'
```

Scenarios: `baseline`, `code_expired`, `agent_code_rejected`, `code_wrong_percent`, `code_missing`, `code_excludes_product`, `code_min_spend`, `price_raised`, `shipping_charged`, `size_sold_out`, `shipping_threshold_ok`, `trial_requires_card`, `trial_14_days`, `guide_link_broken`, `guide_paywalled`.

Non-checkout funnels:

- Free trial: `/store/trail-club` -> `/store/trail-club/join` -> `/store/trail-club/welcome`. Baseline: 30 days, no card. `trial_requires_card` adds card fields to the join form. `trial_14_days` makes the trial 14 days.
- Lead magnet: `/store/guides/first-thru-hike` -> email form -> `/store/guides/first-thru-hike/thanks` with a link to `/guides/first-thru-hike.pdf`. `guide_link_broken` points the link at a missing file (404). `guide_paywalled` asks $4.99 instead.
Test card: 4242 4242 4242 4242. Orders appear at `/store/admin`.

## Agent checkout (UCP)

The store also has an agent checkout, like every Shopify store: `/.well-known/ucp` points AI shopping agents to `/api/ucp/mcp` (`search_catalog`, `create_cart`, `get_cart`). Carts there are priced for the "agent" sales channel. In the `agent_code_rejected` scenario SAVE20 works on the website but is rejected in agent checkout.

## Agent purchase (ACP)

The store also sells through the Agentic Commerce Protocol (spec 2026-04-17), the checkout API AI agents such as ChatGPT use: `POST /api/acp/checkout_sessions`, `GET` and `POST /api/acp/checkout_sessions/{id}`, `.../complete`, `.../cancel`. Send `Authorization: Bearer alder-trail-demo` (change it with `ACP_API_KEY`) and an `Idempotency-Key` on every POST. Sessions use the same "agent" pricing as UCP, so `agent_code_rejected` rejects SAVE20 here too, in `discounts.rejected` with `discount_code_invalid`.

Payment never uses real money. With no Stripe key, any `spt_` test token pays (`spt_declined` is always declined). Set `STRIPE_SECRET_KEY=sk_test_...` to charge real Stripe test-mode Shared Payment Tokens instead. A completed session creates a normal store order.

Check it with `npx acp-check endpoints http://localhost:3000/api/acp --auth-token alder-trail-demo --item ridge-trail-shoe --allow-complete`.
