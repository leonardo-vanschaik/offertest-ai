# CLI reference

```
offertest check --ad <ad id>                 test one ad from Meta Ads Manager
offertest check --account <act_123>          test every ad about to launch (paused or in review)
offertest check --url <landing url> --headline "..." --text "..." [--image ad.png]
offertest agent-checkout --url <product url> [--code SAVE20]
                                             test a code in the store's AI-agent checkout (no keys, free)
offertest acp --acp-url <endpoint> --item <id> [--code SAVE20]
                                             buy through your store's ACP agent checkout in test mode
offertest ads [--account <act_123>] [--live] list ads and where they send people
offertest serve [--port 7777]                local server for the Ads Manager Chrome extension
offertest init                               guided setup: Meta API key, Ads Manager, browser, agent skill
offertest doctor                             check the setup and print the fix for anything wrong
offertest install-browser                    download Chromium if you have no Chrome
```

## Check options

| Option | What it does |
|---|---|
| `--cta <text>` | Ad button text (default "Shop now") |
| `--live` | With `--account`: test live (ACTIVE) ads instead of ads about to launch |
| `--limit <n>` | With `--account`: test at most n ads (default 5) |
| `--pause-failing` | Pause a failing ad in Ads Manager (asks first) |
| `--pay` | Allow a test-mode payment (asks before paying; test stores only) |
| `--no-submit` | Do not submit forms (sign-up, lead, booking) |
| `--no-agent-checkout` | Skip the agent checkout (UCP) check |
| `--acp-url <url>` | Also test your store's ACP checkout. Key in `--acp-key` or `OFFERTEST_ACP_KEY`. See [AGENT-CHECKOUT.md](AGENT-CHECKOUT.md) |
| `--no-buy` | With ACP: never finish the purchase |
| `--item <id>` | ACP item id (default: the last part of the landing page path) |
| `--mobile` | Phone viewport and the Facebook in-app browser user agent |
| `--headless` / `--headful` | Hide or show the browser (hidden by default when not in a terminal) |
| `--max-turns <n>` | Agent turns per funnel (default 25) |
| `--max-usd <n>` | Stop a run above this model cost |
| `--out <dir>` | Where run folders go (default `./offertest-runs`) |
| `--json` | Print result paths and verdicts as JSON |
| `--yes` | Answer yes to approval prompts (payment, pause) |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Every promise holds |
| 1 | At least one promise is broken |
| 2 | Unresolved: the agent could not reach the evidence, or the page blocked it |
| 3 | Error |
| 4 | Usage error |

## Environment

| Variable | Used for |
|---|---|
| `META_API_KEY` | Meta Model API (required) |
| `META_ACCESS_TOKEN` | Marketing API: read ads (`ads_read`), pause ads (`ads_management`) |
| `META_AD_ACCOUNT_ID` | Default ad account |
| `OFFERTEST_ACP_URL`, `OFFERTEST_ACP_KEY` | Your store's ACP checkout |
| `STRIPE_TEST_KEY` | `sk_test_` key for ACP test payments |

## Output

Each check writes `offertest-runs/<id>/`:

- `report.html`: one file with the verdicts, quotes, screenshots, the fix, and a step viewer.
- `result.json`: the same data for scripts and agents (`schemaVersion: 1`).
- `log.jsonl`: every step, action, and model call, append-only.
- `shots/` and `pages/`: every screenshot and the text of every page.
