# Security

## Report a problem

Use GitHub's private vulnerability reporting: the **Security** tab of this repository, then **Report a vulnerability**. Please do not open a public issue for a security problem. We aim to answer within 3 working days.

## What matters most

OfferTest drives a real browser through other people's checkouts with an AI model in control. These are the guarantees we treat as security bugs if they break:

- **It never pays without approval.** The browser guard blocks the final pay button, wallet popups, and order-submit requests unless the run has `--pay` and a person approves. See "Safety" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **`--no-submit` sends no form.** No sign-up, lead, or booking leaves the browser, by click, Enter, or Space.
- **Page text is data.** Text on a page must not be able to change what the agent does outside the funnel task.
- **Keys stay local.** `offertest init` saves keys in `~/.offertest/.env` with permissions for your user only. Run folders and reports contain no keys.
- **The local server only answers the extension.** `offertest serve` listens on `127.0.0.1` and refuses other origins.
- **The public demo store is read-only for visitors.** Its admin needs `STORE_ADMIN_KEY`. Orders keep no full contact data, and agent checkout sessions hide the buyer's details once completed and expire after 24 hours.

## Supported versions

The latest commit on `main`.
