<p align="center">
  <img src="docs/assets/logo.jpg" alt="OfferTest AI" width="320">
</p>

<h3 align="center">Your ad makes a promise. OfferTest checks that the customer actually gets it, before you pay for the clicks.</h3>

<p align="center">
  An AI agent built on Meta's Muse Wonder opens your ad's funnel like a customer: store checkout, landing page, Instant Form, free trial, booking, or download.<br>
  It tests every promise in the ad and proves each verdict with word-for-word quotes and screenshots.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#works-with-meta-ads-manager">Ads Manager</a> ·
  <a href="#use-it-from-your-coding-agent">Muse Code skill</a> ·
  <a href="#how-it-uses-meta-ai">Meta AI</a> ·
  <a href="#does-it-work">Eval</a>
</p>

---

<!-- demo GIF: docs/assets/demo.gif -->
<!-- Example output below: replace with a real run before submitting. -->

```
$ npx offertest check --ad 120214455667788

● Pulled ad 120214455667788 "20% off the Ridge trail shoe." from Meta Ads Manager (PAUSED)
● Reading the ad's promises (Muse Spark)
● Following the funnel like a customer (Muse Wonder · computer use)
   1 Open aldertrail.co/products/ridge-trail-shoe
   2 Click (884, 412) · Click (1010, 520)
   3 Type "SAVE20" · Click (1102, 388)
   ...
FAIL  Followed to the payment step, not paid  $0.41
  ✗ Code SAVE20 gives 20% off the Ridge trail shoe
      ad: "Use code SAVE20 at checkout."   funnel: "This code has expired."

  Fix: Extend SAVE20 to Nov 9, 11:59 PM, the ad's last day.
    - Shopify admin > Discounts > SAVE20 > Active dates
  Report: offertest-runs/20261030-1412-a1b2c3/report.html
```

## Why

Ads promise things: a price, a code, free shipping, a 30-day free trial, a free guide. When the funnel does not deliver (the code expired, the trial asks for a card, the download link is dead), every click on that ad is paid for and then lost. Google tests promo codes before it shows a merchant promotion. Nothing does that for your Meta ad. OfferTest does, and it does it the way your customer would: by clicking through.

## Quickstart

```bash
npx offertest init                                   # 3-minute guided setup: opens each page, tests each key
npx offertest check                                  # test every ad about to launch in your ad account
npx offertest check --url https://yourstore.com/p/x --headline "20% off" --text "Use code SAVE20"
```

`offertest init` walks you through the Meta Model API key, connecting Ads Manager (no App Review, no ID), the browser, and installing the skill in Muse Code, Claude Code, or Codex. `offertest doctor` checks the setup at any time and prints the fix for anything wrong. Prefer to read first? [docs/SETUP.md](docs/SETUP.md).

Needs Node 22+. Each check writes `offertest-runs/<id>/` with a one-file `report.html`, `result.json`, an append-only `log.jsonl`, and every screenshot.

## Works with Meta Ads Manager

| You want to | Run |
|---|---|
| Check every ad that is about to launch | `offertest check --account act_123` |
| Audit live ads | `offertest check --account act_123 --live` |
| Check one ad | `offertest check --ad <id>` |
| See your ads and where they send people | `offertest ads` |
| Pause a live ad whose offer is broken | `offertest check --account act_123 --live --pause-failing` |
| Click "Test offer" inside Ads Manager | [Chrome extension](extension/) + `offertest serve` |

OfferTest reads the ad itself from the Marketing API: headline, primary text, image, button, URL parameters, and the destination type. Reading your own ad account needs a token with `ads_read`, which you get on standard access with a development-mode app. Pausing needs `ads_management`. Lead ads (Instant Forms) need Page permissions. [docs/SETUP.md](docs/SETUP.md) lists every permission and what it is for.

### Every funnel type

| Ad destination | What OfferTest does |
|---|---|
| Website: store, landing page, booking, sign-up, free trial, download | Muse Wonder clicks through it like a customer, up to the payment step |
| Instant Form (lead ad) | Reads the form from Meta, then follows the thank-you button to its page |
| Carousel / dynamic creative | Tests each card's or variant's own link and promise |
| Messenger / WhatsApp / Instagram Direct | Checks the welcome message against the ad's offer |
| App install | Opens the store page |

### Agent checkout: where AI shopping agents buy

Shoppers now buy through AI agents such as Meta Muse, ChatGPT, and Gemini. Those agents do not click through your website: they use the store's agent checkout (the [Universal Commerce Protocol](https://ucp.dev), which every Shopify store publishes at `/.well-known/ucp`). A code can work on the website and still fail there, for example when the discount is limited to the Online Store sales channel.

So for every website ad, OfferTest also builds a cart in the store's agent checkout with the ad's codes and reads the real totals. A code that fails there fails the test, and the report quotes the store's message. This needs no keys, costs nothing, and never places an order. Try it on any Shopify store:

```
$ npx offertest agent-checkout --url https://yourstore.com/products/ridge --code SAVE20
Agent checkout cart (UCP: the channel AI shopping agents such as Meta Muse buy through)
Item: Ridge trail shoe - Size 7 x1: $120.00
Discount codes sent: SAVE20
Discounts applied: none
Store message (warning discount_code_invalid): This code is not valid.
Total: $120.00

Does not work in agent checkout: SAVE20
```

Skip it with `--no-agent-checkout`.

### Agent purchase (ACP): a full AI-agent buy, in test mode

The [Agentic Commerce Protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) (ACP, by Stripe, OpenAI, and Meta) is the checkout API AI agents such as ChatGPT use to buy. The store owner gives the agent a key, so this runs on stores you own. OfferTest acts as the agent: it opens a checkout session with the ad's codes, reads which codes the store applied or rejected, and finishes a test purchase. It never uses real money: the store's demo token, or a Stripe test-mode payment token (set `STRIPE_TEST_KEY` to your store's `sk_test_` key).

```
$ npx offertest acp --acp-url https://yourstore.com/api/acp --acp-key <key> --item ridge-trail-shoe --code SAVE20
Agent checkout session (ACP: the checkout API AI agents such as ChatGPT buy through)
Item: Ridge trail shoe - Size 7 x1: $120.00
Discount codes sent: SAVE20
Discounts applied: none
Discount rejected: SAVE20 (discount_code_invalid): This code is not valid.
Total: $120.00
Test purchase: completed, order AT-10428, paid $120.00 in test mode

Does not work in ACP checkout: SAVE20
```

Add `--acp-url` and `--acp-key` (or `OFFERTEST_ACP_URL` and `OFFERTEST_ACP_KEY`) to `check`, and every website ad is also tested in the ACP checkout. Like the browser, `check` stops before payment unless you add `--pay`, and then it asks you first. `--item` sets the store's item id; the default is the `?variant=` in the landing link, else the last part of the landing page path. `--no-buy` never finishes the purchase. The demo store has an ACP checkout at `http://localhost:3000/api/acp` (key `alder-trail-demo`), and it passes the [`acp-check`](https://www.npmjs.com/package/acp-check) conformance tool.

### Payments

It never pays real money. Without `--pay` it stops at the payment step. With `--pay` (test-mode stores only, for example a Shopify Bogus Gateway or Stripe test mode) it asks you before the final click.

## Use it from your coding agent

The same skill works in **Muse Code**, Claude Code, and Codex:

```bash
muse skills install ./skills/offertest            # Muse Code
cp -r skills/offertest ~/.claude/skills/          # Claude Code
cp -r skills/offertest ~/.agents/skills/          # Codex
```

Then ask: *"Check the ads I'm about to launch."* The agent runs OfferTest, reads `result.json`, and tells you what broke and how to fix it.

## How it uses Meta AI

| Model | Job |
|---|---|
| **Muse Wonder** (`muse-wonder-1.0`) | Computer use: follows the funnel from screenshots with the native `computer` tool. Judges each promise. Writes the fix. |
| **Muse Spark** (`muse-spark-1.3`) | Turns the ad (text and image) into typed, testable promises. |
| **SAM 3.1** (`sam-3.1`) | Boxes the advertised product and the button in a screenshot for the report. |
| **Meta Marketing API** | Pulls the real ad, its destination, and Instant Forms from Ads Manager; pauses failing ads. |
| **Muse Code** | Runs OfferTest through the skill in `skills/offertest`. |

### How a verdict is made

1. **Promises.** Muse Spark reads the ad and writes each promise as a test with a word-for-word quote from the ad.
2. **Funnel.** Muse Wonder drives a fresh Chrome session (no cookies, like a new customer). Our code executes its clicks with Playwright. A guard in the browser blocks the final pay button and order-submit requests unless you allow a test payment.
3. **Judge.** Muse Wonder sees only the ad, the promises, and the exact text of every page. It never sees the agent's own opinion of how it went.
4. **Quote check.** Code checks that both quotes exist word for word, with number boundaries ("$24.00" does not match "$124.00"). A verdict that fails the check becomes `unresolved`.
5. **Fix.** For a failure, Muse Wonder proposes one change, with where to make it.

## Does it work?

We built a small store, **Alder Trail Co.** ([examples/demo-store](examples/demo-store)), with switchable offer bugs: expired code, wrong percent, missing code, code that excludes the product, hidden minimum spend, raised price, shipping charged, sold-out size, trial that demands a card, broken download link, and a code that works on the website but not in agent checkout. Labels were frozen before the scored run.

<!-- EVAL_TABLE -->
_Scored run pending._

Run it yourself: [eval/README.md](eval/README.md).

## Why OfferTest

OfferTest is open source, starts from the ad in Ads Manager, follows any funnel type, runs inside coding agents, and backs every verdict with word-for-word proof.

## Development

```bash
npm install
npm test                       # unit tests
npm run typecheck
npm run dev -- check --help    # run the CLI from source
(cd examples/demo-store && npm install && npm run dev)   # demo store on :3000
npm run test:e2e               # browser tests (needs the demo store on :3000)
npm run test:journeys          # 45 user journeys, about 7 minutes (needs the demo store on :3000)
```

The journey tests (`test/journeys/`) run the real `offertest` command and `offertest serve`, a real browser, and the demo store. Only Meta is faked: a scripted shopper stands in for Muse Wonder and clicks where a hidden copy of the page says the button is, a rule-based judge quotes what the store really showed, and a fake Marketing API serves ads, accounts, lead forms, and pause calls. They cover store owners (codes, prices, shipping, sold-out sizes, fix and re-test, phone), agencies (Ads Manager, account sweeps, carousels, lead ads, pausing), trials and lead magnets, broken links and password walls, payment and form-submit safety, CI exit codes and JSON, `doctor`, the Chrome extension bridge, and AI-agent checkout (UCP and ACP). They test the wiring, not the real model's judgment: that is what `eval/` is for.

Layout: `src/core` (agent, browser, judge), `src/meta` (Meta APIs), `src/report` (HTML report), `skills/` (agent skill), `extension/` (Ads Manager button), `eval/`, `examples/demo-store/`.

## Built at the Meta Global AI Developer Hackathon

Built solo between 27 Oct and 4 Nov 2026, Indie track, theme "Build for Your World". Everything in this repo was written during the event; see the git history.

License: Apache-2.0
