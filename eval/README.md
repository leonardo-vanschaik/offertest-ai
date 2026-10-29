# Eval

38 frozen cases: 11 ad families x the demo store's scenarios (16 should pass, 22 should fail). Labels were fixed before any scored run. 30 cases test the checkout funnel. 8 test non-checkout funnels: a free trial sign-up (`/store/trail-club`) and a lead-magnet download (`/store/guides/first-thru-hike`).

```bash
(cd examples/demo-store && npm install && npm run dev)   # terminal 1
npx tsx eval/run.ts --mode both                           # terminal 2
```

- **hit**: the verdict matches the label. **miss**: a broken offer the tool passed. **false alarm**: a working offer the tool failed.
- **agent** is OfferTest. **baseline** is one model call on the landing page, no clicking.
- Accuracy comes with a 95% Wilson interval, because 38 cases is a small sample.
- Results: `eval/results/latest.json`. Run folders with screenshots: `eval/results/runs/`.
