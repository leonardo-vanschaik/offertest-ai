# Recorded runs

`offertest demo` replays these runs, so you can see OfferTest work with no Meta key and no cost.

| Folder | What happened |
|---|---|
| `1-before-launch` | The Ridge ad ("20% off the Ridge. Use code SAVE20 at checkout. Free shipping.") on the sample store, with SAVE20 expired. Muse Wonder selects every size, adds one pair to the cart, applies SAVE20, and reaches checkout. Verdict: FAIL, "This code has expired." It proposes a fix. |
| `2-after-the-fix` | The owner extends SAVE20. The re-test (`--retest-of` the first run) applies SAVE20, pays with the test card, and reaches the order confirmation. Verdict: PASS. |

Both were recorded on 2 Nov 2026 with `muse-wonder-1.0`, `muse-spark-1.3`, and `sam-3.1`, against [the sample store](../demo-store) on `localhost:3000`.

## What is in a recording

Each folder is the run folder that `offertest check` wrote, unchanged:

- `result.json`: the ad, the promises, every step, the verdicts with their quotes, the fix, the models, and the token use and cost.
- `log.jsonl`: every event with its time, including each browser action the model asked for.
- `shots/` and `pages/`: the screenshot and the text of every page the agent saw.

Plus `recording.json`: the exact command, the store state, the commit of the code that made the run, and the SHA-256 of every file.

## What the demo checks

1. Every file matches its SHA-256. A changed file stops the demo.
2. The quote check runs again on this computer: every verdict's ad quote and page quote must be in the recorded ad and pages, word for word, and the verdicts must give the recorded result.
3. It writes a new report with the current report code, marked "Recorded run, replayed".

The model answers are the recorded ones. To run the models yourself, see "Run it live on the sample store" in the [README](../../README.md#quickstart).

## Make a recording

Run a check, then turn its run folder into a recording:

```bash
node --import tsx examples/recordings/make.ts offertest-runs/<run id> 3-my-run \
  --intro "What this run shows." --command "offertest check ..." --store "what the store looked like"
```
