# Eval

41 frozen cases: 11 ad families x the demo store's scenarios (17 should pass, 24 should fail). Labels were fixed before any scored run. 30 cases test the checkout funnel. 8 test non-checkout funnels: a free trial sign-up (`/store/trail-club`) and a lead-magnet download (`/store/guides/first-thru-hike`). 3 test the agent checkout (UCP): the code works on the website but not for AI shopping agents. The landing-page baseline cannot see this.

```bash
(cd examples/demo-store && npm install && npm run dev)   # terminal 1
npx tsx eval/run.ts --mode both                           # terminal 2
```

- **hit**: the verdict matches the label. **miss**: a broken offer the tool passed. **false alarm**: a working offer the tool failed.
- **agent** is OfferTest. **baseline** is one model call on the landing page, no clicking.
- Accuracy comes with a 95% Wilson interval, because 41 cases is a small sample.
- Results: `eval/results/latest.json`. Run folders with screenshots: `eval/results/runs/`.

## Reading the promises

`eval/promises.ts` scores only the first step: Muse Spark Open (open weights, through OpenRouter) and Muse Spark each read the 11 ads above and write their promises. No store or browser is needed. It needs `META_API_KEY` and `OPENROUTER_API_KEY`.

```bash
npx tsx eval/promises.ts                       # both models
npx tsx eval/promises.ts --models spark-open    # one model
```

- **Promises found**: each ad has labeled promises (for example, a discount with "SAVE20" and "20"). One is found when an extracted promise has the right kind and states every fact in its claim or in a condition with a value. The ad quote does not count. A fact stated as untrue ("does not give 20% off") does not count, and "no credit card" must be stated as absent. Tests: `test/promise-score.test.ts`.
- **Quotes word for word**: every extracted promise's ad quote must be in the ad, checked by the same quote check as the verdicts.
- Results: `eval/results/promises.json`, with each model's promises per ad, the provider, and its quantization.
