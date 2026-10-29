---
name: offertest
description: Test whether a Meta ad's offer actually holds before or while it spends. An AI agent (Meta Muse Wonder, computer use) follows the ad's funnel like a customer (store checkout, landing page, Instant Form, free trial, booking, lead magnet) and checks every promise with word-for-word proof. Use when the user wants to check, QA, or preflight Meta / Facebook / Instagram ads, ads in Ads Manager, a promo code, a landing page offer, or asks "will this ad's deal work?".
license: Apache-2.0
---

# OfferTest

OfferTest reads an ad, turns it into promises ("Code SAVE20 gives 20% off"), follows the funnel like a customer, and gives each promise a verdict: supported, contradicted, unresolved, or outside scope. Each verdict quotes the ad and the funnel word for word. If the ad fails, it proposes one fix.

## Setup (once)

```bash
npx offertest init        # guided: Meta Model API key, Ads Manager, browser (the user runs this in a terminal)
npx offertest doctor      # checks the setup; prints the fix for anything wrong
```

If a command fails with a setup error, run `npx offertest doctor` and tell the user the fix it prints. `init` is interactive: ask the user to run it themselves (in Muse Code or Claude Code they can type `! npx offertest init`).

Keys can also come from env: `META_API_KEY` (required), `META_ACCESS_TOKEN` (Ads Manager; `offertest init` lists the permissions), `META_AD_ACCOUNT_ID`.

## Pick the command

| The user has | Run |
|---|---|
| Ads in Ads Manager, wants to check what is about to launch | `npx offertest check --account act_<id>` |
| Live ads to audit | `npx offertest check --account act_<id> --live` |
| One ad id | `npx offertest check --ad <ad id>` |
| No ad id, only ad text and a URL | `npx offertest check --url <landing url> --headline "<headline>" --text "<primary text>" [--image <file>]` |
| Not sure which ads exist | `npx offertest ads [--account act_<id>]` |

Add `--json` when you need to parse the output. Add `--mobile` to test as a phone in the Facebook in-app browser.

## Rules

- Do not pass `--pay` unless the user says the store is in test mode. Without it, the agent stops at the payment step.
- Do not pass `--pause-failing` unless the user asks to pause failing ads.
- A run takes 1 to 5 minutes per ad. Run ads one command at a time; the CLI tests them in sequence.

## Read the result

- Exit code: `0` pass, `1` fail, `2` unresolved or blocked, `3` error, `4` usage.
- Each run writes `offertest-runs/<id>/` with `report.html`, `result.json`, `log.jsonl`, and `shots/`.
- In `result.json`: `overall`, `boundary` (how far the test went), `verdicts[]` (`status`, `adQuote`, `pageQuote`, `reason`), `fix` (`summary`, `steps`), `blocked`, `usage.usd`.

## Tell the user

1. The result first: PASS, FAIL, or UNRESOLVED, and how far the test went.
2. For each failed promise: what the ad says vs what the funnel shows, both quoted.
3. The fix, as the owner's next action.
4. The report path, so they can see the screenshots.
5. After they fix it, offer to re-run the same command.

If `blocked` is set (bot check, password page), say so and suggest running with `--headful` or on a staging copy of the site.
