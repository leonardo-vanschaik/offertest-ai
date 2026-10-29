# Eval
Run: `npx tsx eval/run.ts [--mode agent|one_call|both] [--only id1,id2] [--limit n] [--resume] [--dry]`. Needs the app on :3000. `--dry` uses fake runs (no API, no browser).
Cases: `eval/cases.ts`, 30 ads x store scenarios (12 pass, 18 fail). Labels were frozen from the demo store scenario table (examples/demo-store/README.md) before the scored run. Do not edit them after.
Each case sets the store scenario, then runs the agent with `allowPayment: false` and no auto-approval. Cases run one at a time.
Metrics: **hit** = verdict equals the label. **miss** = label fail, agent said pass or unresolved. **false alarm** = label pass, agent said fail.
**unresolved** = agent gave no verdict (errored runs count here too). **completed** = runs that finished without error. usd and ms are totals.
Output: `eval/results/<timestamp>.json` and `eval/results/latest.json`, saved after every case. `--resume` skips cases already done in latest.json.
