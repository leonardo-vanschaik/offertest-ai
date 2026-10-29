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

Scenarios: `baseline`, `code_expired`, `code_wrong_percent`, `code_missing`, `code_excludes_product`, `code_min_spend`, `price_raised`, `shipping_charged`, `size_sold_out`, `shipping_threshold_ok`, `trial_requires_card`, `trial_14_days`, `guide_link_broken`, `guide_paywalled`.

Non-checkout funnels:

- Free trial: `/store/trail-club` -> `/store/trail-club/join` -> `/store/trail-club/welcome`. Baseline: 30 days, no card. `trial_requires_card` adds card fields to the join form. `trial_14_days` makes the trial 14 days.
- Lead magnet: `/store/guides/first-thru-hike` -> email form -> `/store/guides/first-thru-hike/thanks` with a link to `/guides/first-thru-hike.pdf`. `guide_link_broken` points the link at a missing file (404). `guide_paywalled` asks $4.99 instead.
Test card: 4242 4242 4242 4242. Orders appear at `/store/admin`.
