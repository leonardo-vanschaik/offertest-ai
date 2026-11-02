<p align="center">
  <img src="docs/assets/logo.jpg" alt="OfferTest AI" width="280">
</p>

<h3 align="center">An AI agent that clicks through your ad's funnel like a customer<br>and proves whether every promise in the ad holds.</h3>

<p align="center">
  Discount codes, prices, free shipping, free trials, free downloads. OfferTest reads your Meta ad, tests each promise in the real funnel up to the payment step, and backs every verdict with word-for-word quotes and screenshots. Built on Meta's <b>Muse Wonder</b> computer-use model and the open-weight <b>Muse Spark Open</b>.
</p>

<p align="center">
  <img alt="Muse Wonder" src="https://img.shields.io/badge/Muse_Wonder-computer_use-0866FF">
  <img alt="Muse Spark Open" src="https://img.shields.io/badge/Muse_Spark_Open-open_weights-0866FF">
  <img alt="SAM 3.1" src="https://img.shields.io/badge/SAM_3.1-segmentation-0866FF">
  <img alt="Benchmark" src="https://img.shields.io/badge/benchmark-41%2F41_correct-2EA44F">
  <a href="https://github.com/leonardo-vanschaik/offertest-ai/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/leonardo-vanschaik/offertest-ai/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522-339933">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-lightgrey">
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#what-it-catches">What it catches</a> ·
  <a href="#accuracy">Accuracy</a> ·
  <a href="#open-weights">Open weights</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#use-it-where-you-work">Ads Manager, CI, agents</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>

<p align="center">
  <img src="docs/assets/report.png" alt="An OfferTest report: FAIL. The ad says 20% off the Ridge. The checkout shows: This code has expired." width="860">
</p>

## Why

An ad that says "20% off with code SAVE20" sends every click to a checkout. If the code expired at midnight, you pay for each of those clicks and lose the sale. Offers break quietly: a discount reaches its end date, a price changes, a size sells out, a theme update hides the code field. Nobody clicks through every ad after every change.

OfferTest does. Run it before an ad launches, on a schedule while it runs, or after every store deploy.

## What it catches

| The ad says | What your customer finds |
|---|---|
| "20% off with code SAVE20" | The code expired at midnight. |
| "20% off" | The cart takes off 10%. |
| "20% off the Ridge shoe" | The code only works on other products. |
| "Save 20% with SAVE20" | The code needs a $150 cart first, and the ad never said so. |
| "Only $120" | The product page shows $135. |
| "Free shipping" | Checkout adds $8.95. |
| "All sizes in stock" | The advertised size is sold out. |
| "30-day free trial, no card" | The sign-up form asks for a card, or the trial is 14 days. |
| "Free guide" | The download link is dead, or the guide costs $4.99. |
| "Use code SAVE20" | It works on the website, but AI shopping agents get "code not valid". |

It works on any funnel a Meta ad can send people to: a store, a landing page, a sign-up or free trial, a booking page, a download, an Instant Form, a carousel, a Messenger or WhatsApp chat, and an app store page.

## Quickstart

**See it work in one minute, with no key.** Needs Node 22.12 or later.

```bash
git clone https://github.com/leonardo-vanschaik/offertest-ai.git
cd offertest-ai
npm install
npx offertest demo
```

The demo replays two real runs that OfferTest recorded with Meta's models on our sample store: the ad fails because the code SAVE20 expired, and after the fix the re-test passes with a test-mode purchase. It checks every recorded file against its SHA-256, runs the quote check again on the recorded pages, and opens the report. No key, no cost. The recordings and how they were made: [examples/recordings](examples/recordings). The same report online: [offertest.ai/report](https://offertest.ai/report/20261102204739-63bdba/report.html).

**Run it live on the hosted sample store.** Needs a [Meta Model API key](docs/SETUP.md#1-meta-model-api-key-required-1-minute). The store at [demo.offertest.ai](https://demo.offertest.ai/store) is set to the case in the film: SAVE20 expired yesterday.

```bash
npx offertest init        # guided setup: API key, browser, agent skill
npx offertest check --url https://demo.offertest.ai/store/products/ridge-trail-shoe \
  --headline "20% off the Ridge." --text "Use code SAVE20 at checkout. Free shipping."
```

**Or run the store yourself,** with all 15 store scenarios you can switch between:

```bash
(cd examples/demo-store && npm install && npm run dev)    # in a second terminal: the store on :3000
curl -X POST localhost:3000/api/store/scenario -H 'content-type: application/json' -d '{"scenario":"code_expired"}'
npx offertest check --url http://localhost:3000/store/products/ridge-trail-shoe \
  --headline "20% off the Ridge." --text "Use code SAVE20 at checkout. Free shipping."
```

With `OPENROUTER_API_KEY` set, Muse Spark Open reads the promises, as in the recordings ([Open weights](#open-weights)). Without it, Muse Spark does that step.

This is the first recorded run, as the terminal showed it:

```
● Reading the ad's promises (Muse Spark Open, open weights)
● Following the funnel like a customer (Muse Wonder · computer use)
   1 Open localhost:3000/store/products/ridge-trail-shoe
   2 Click (899, 412)
   3 Click (940, 494)
   4 Click (936, 346) · Type "SAVE20" · Click (1115, 346)
   5 Click (987, 635)
   6 Agent's note
   7 Built a cart in the store's agent checkout (UCP) with the ad's codes
● Judging each promise against word-for-word evidence (Muse Wonder + quote check)
● Proposing one fix (Muse Wonder)

FAIL  Followed the funnel to localhost:3000/store/checkout  $0.27
  Promises read by Muse Spark Open (open weights) on BaseTen, fp4
  ✗ Code SAVE20 gives 20% off the Ridge
      ad: "20% off the Ridge."   funnel: "This code has expired."
  ✗ Code SAVE20 gives 20% off at checkout
      ad: "Use code SAVE20 at checkout."   funnel: "This code has expired."
  ✓ Free shipping is available
      ad: "Free shipping."   funnel: "Shipping: $0.00"

  Fix: Remove the expiry date from SAVE20 so it again gives 20% off the Ridge.
    - Store admin > Discounts > SAVE20: open the code and confirm Discount is set to 20%.
    - Store admin > Discounts > SAVE20 > Active dates: clear the end date, set Status to Active, and save.
    - Check at checkout: add the $120.00 Ridge, enter SAVE20, and confirm a $24.00 discount applies instead of 'This code has expired.'
```

**Check your own ads.**

```bash
npx offertest check                    # every ad about to launch in your ad account
npx offertest check --url https://yourstore.com/products/x --headline "20% off" --text "Use code SAVE20"
```

Each check writes a folder with a one-file `report.html`, a `result.json` for scripts and agents, a step-by-step `log.jsonl`, and every screenshot. `offertest doctor` checks your setup and prints the fix for anything wrong. Full setup, with every Meta permission and what it is for: [docs/SETUP.md](docs/SETUP.md).

## Accuracy

We tested OfferTest on 41 ads: 17 with working offers and 24 with broken ones, across 13 failure types. We compared it with a landing-page check that uses the same Meta models and the same judge, but reads only the page the ad links to and does not click. Muse Spark Open read the promises in this run (2 Nov 2026).

| | OfferTest | Landing-page check |
|---|---|---|
| Correct verdicts | **41 / 41** (95% CI 91 to 100%) | 15 / 41 (95% CI 24 to 52%) |
| Broken offers caught | **24 / 24** | 9 / 24 |
| Broken offers passed as fine | **0** | 2 |
| Working offers failed (false alarms) | **0** | 0 |
| Unresolved | 0 | 24 |
| Model cost per ad | $0.28 | $0.06 |
| Time per ad | about 1.5 min | about 0.3 min |

Most broken offers only show up in the cart, at checkout, after a sign-up, or behind a download link. A check that does not click cannot see them. OfferTest costs more per ad because it drives a real browser through the funnel.

**How we tested.** The 41 cases run against a sample store we built ([examples/demo-store](examples/demo-store)), so the right answer is known for every case. Each case switches on one offer bug. We fixed the labels before the first scored run on 30 Oct 2026. In that first run, with Muse Spark reading the promises, OfferTest also got 41 of 41, and the landing-page check got 12 of 41 ([eval/results/2026-10-30-muse-spark.json](eval/results/2026-10-30-muse-spark.json)). In the 2 Nov run, one case stopped on a 503 error from the Meta Model API and was run again; `latest.json` keeps both tries. Results: [eval/results/latest.json](eval/results/latest.json). Run it yourself: [eval/README.md](eval/README.md).

## Open weights

The promise step runs on **Muse Spark Open**, Meta's open-weight model, through [OpenRouter](https://openrouter.ai/meta/muse-spark-open). OfferTest sends it only to the hackathon's inference partners: Baseten first, then Fireworks, then Modal. Set `OPENROUTER_API_KEY` to use it. Without the key, Muse Spark on the Meta Model API does this step, so a Meta key is all you need.

Every run records the model that read the promises, the provider, its quantization, and OpenRouter's request ids: in `result.json` (`openWeights`), in `log.jsonl`, and in the report. The two runs in `offertest demo` ran on Baseten at fp4. So did all 82 runs of the [41-ad benchmark](#accuracy) (41 OfferTest runs and 41 landing-page checks), with no fallback to another model.

We scored both models on the 11 ads of the benchmark. A promise counts only when the model states its facts (a code and its amount, a trial length, "no credit card") in its own claim or conditions, not only in the ad quote it copies, and does not state them as untrue.

| | Muse Spark Open | Muse Spark |
|---|---|---|
| Promises found | **14 / 14** | 14 / 14 |
| Ad quotes found word for word | **17 / 17** | 15 / 15 |
| Time for all 11 ads | **30 s** | 102 s |
| Cost for all 11 ads | **$0.03** | $0.11 |

Results: [eval/results/promises.json](eval/results/promises.json). Run it: `npx tsx eval/promises.ts`.

## How it works

```mermaid
flowchart TD
    EXT["Ads Manager<br/>Test offer button"]
    CLI["CLI or CI<br/>offertest check"]
    SKILL["Coding agent<br/>OfferTest skill"]
    MKT["Meta Marketing API<br/>headline, text, image,<br/>link, Instant Form"]
    SPARK["Muse Spark Open<br/>open weights: turns the ad<br/>into testable promises"]
    WONDER["Muse Wonder<br/>computer use: clicks<br/>through the funnel"]
    UCP["Agent checkout<br/>UCP / ACP cart<br/>with the ad's codes"]
    JUDGE["Muse Wonder judge<br/>sees only the ad and<br/>the captured pages"]
    QC["Quote check<br/>both quotes must exist<br/>word for word"]
    OUT["Verdict, proof, fix<br/>report.html, result.json<br/>pause the failing ad"]

    EXT & CLI & SKILL --> MKT --> SPARK
    SPARK --> WONDER --> JUDGE
    SPARK --> UCP --> JUDGE
    JUDGE --> QC --> OUT
```

1. **Read the ad.** OfferTest pulls the real ad from Ads Manager: headline, text, image, button, link, and destination type.
2. **Find the promises.** Muse Spark Open, Meta's open-weight model, turns each promise into a test, with a word-for-word quote from the ad. Without an OpenRouter key, Muse Spark does this.
3. **Follow the funnel.** Muse Wonder drives a fresh browser with no cookies, like a new customer. It picks options, adds to cart, types codes, and signs up. For stores, OfferTest also builds a cart in the store's AI-agent checkout ([UCP and ACP](docs/AGENT-CHECKOUT.md)).
4. **Judge with proof.** Muse Wonder judges each promise from the captured pages only. Code then checks that both quotes exist word for word. A verdict without proof becomes `unresolved`, never a guess.
5. **Fix.** For each broken promise you get one change, where to make it, and the command to re-test.

**It never pays.** A guard in the browser blocks the final pay button and order requests. `--no-submit` also stops it before sign-up and lead forms. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#safety).

## Use it where you work

**Inside Ads Manager.** The [Chrome extension](extension/) adds a **Test offer** button. Select ads, click it, and the side panel shows each promise with the ad's words next to what the funnel shows. Pause a failing ad from the same panel.

**From the command line.**

| You want to | Run |
|---|---|
| Check every ad about to launch | `offertest check --account act_123` |
| Re-check live ads | `offertest check --account act_123 --live` |
| Check one ad | `offertest check --ad <id>` |
| Pause live ads whose offer broke | `offertest check --account act_123 --live --pause-failing` |
| Test on a phone and the Facebook in-app browser | `offertest check --ad <id> --mobile` |

All commands and options: [docs/CLI.md](docs/CLI.md).

**In CI.** Exit code 0 means every promise holds, 1 means one broke, 2 means unresolved. Re-check live ads every 6 hours with GitHub Actions:

```yaml
on:
  schedule: [{ cron: "0 */6 * * *" }]
jobs:
  offertest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { repository: leonardo-vanschaik/offertest-ai, path: offertest }
      - uses: actions/setup-node@v7
        with: { node-version: 22 }
      - run: npm ci --prefix offertest
      - run: node offertest/dist/cli.mjs check --account ${{ vars.META_AD_ACCOUNT_ID }} --live --json
        env:
          META_API_KEY: ${{ secrets.META_API_KEY }}
          META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
      - uses: actions/upload-artifact@v7
        if: always()
        with: { name: offertest-reports, path: offertest-runs }
```

**From an agent.** Muse, or any agent, uses OfferTest through the skill. The CLI is the same engine. The skill works in Muse Code, Claude Code, and Codex. Run `npm link` once in this folder, so the agent can run `offertest` from any folder, then install the skill:

```bash
muse skills install ./skills/offertest            # Muse Code
cp -r skills/offertest ~/.claude/skills/          # Claude Code
cp -r skills/offertest ~/.agents/skills/          # Codex
```

Then ask: *"Check the ads I'm about to launch."* The agent runs OfferTest, reads `result.json`, and tells you what broke and how to fix it.

## Built on Meta AI

| Meta tool | Job in OfferTest |
|---|---|
| **Muse Wonder** (`muse-wonder-1.0`) | Computer use through the funnel, the judge, and the fix |
| **Muse Spark Open** (`meta/muse-spark-open`, open weights) | Reads the ad's text and image and writes the promises, through OpenRouter on Baseten, Fireworks, or Modal |
| **Muse Spark** (`muse-spark-1.3`) | Does the same job on the Meta Model API when no OpenRouter key is set |
| **SAM 3.1** (`sam-3.1`) | Boxes the advertised product and buttons in the report |
| **Meta Marketing API** | Reads ads, destinations, and Instant Forms. Pauses failing ads. |
| **Muse Code** | Runs OfferTest through the skill |

How the computer-use loop works, and what we changed to make Muse Wonder reliable on long funnels: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Docs

- [Setup](docs/SETUP.md): API key, Ads Manager permissions, browser, agent skill
- [CLI reference](docs/CLI.md): commands, options, exit codes, output files
- [Architecture](docs/ARCHITECTURE.md): verdicts, safety, the computer-use loop, tests
- [Agent checkout](docs/AGENT-CHECKOUT.md): UCP and ACP, where AI shopping agents buy
- [Chrome extension](extension/README.md): the Test offer button in Ads Manager
- [Benchmark](eval/README.md): the 41 cases and how to run them

## Development

```bash
npm install
npm test                                                 # unit tests
(cd examples/demo-store && npm install && npm run dev)   # sample store on :3000
npm run test:e2e                                         # browser tests
npm run test:journeys                                    # 46 end-to-end user journeys
```

How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md). Report a security problem: [SECURITY.md](SECURITY.md).

License: Apache-2.0
