# Set up OfferTest

**Fastest way:** run the guided setup. It opens each page for you, tests every key as you paste it, and tells you exactly what to fix.

```bash
npx offertest init
npx offertest doctor     # check everything, any time
```

This page explains the same steps, if you prefer to read first.

---

## 1. Meta Model API key (required, 1 minute)

OfferTest's AI runs on Meta's models: **Muse Wonder** (the agent that clicks through your funnel), **Muse Spark** (reads your ad), and **SAM 3.1** (marks the product in screenshots).

1. Open [dev.meta.ai](https://dev.meta.ai) and sign in.
2. Create an API key. Hackathon participants: claim your $150 credits on the same site.
3. Paste the key when `offertest init` asks for it.

A typical check costs about $0.20 to $1 in model usage.

## 2. Connect Meta Ads Manager (optional, 3 minutes)

Without this step you can still test any ad by typing its text and URL. With it, OfferTest reads your real ads (text, image, button, link, URL parameters, Instant Forms) and can pause an ad whose offer is broken.

Reading your own ad account needs **no App Review, no business verification, and no ID**: an app in development mode gets standard access to your own ads.

### A. Create a Meta app (once)

1. Open [developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation/).
2. Choose **Other**, then app type **Business**. Name it `OfferTest` and create it.
3. On the app dashboard, find **Marketing API** and click **Set up**.

### B. Get a token

1. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Under **Meta App**, pick your OfferTest app.
3. Under **Permissions**, add:
   - `ads_read`: read your ads (required)
   - `ads_management`: pause broken ads (optional)
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`: read Instant Forms for lead ads (optional)
4. Click **Generate Access Token**, approve, and copy it.
5. Paste it when `offertest init` asks.

### C. Make the token last 60 days

Explorer tokens expire after about an hour. `offertest init` notices this and offers to extend the token to 60 days. It needs your app's **App Secret**: [your apps](https://developers.facebook.com/apps/) > OfferTest > **App settings** > **Basic** > **App secret** > **Show**. The secret is used once for the exchange and is not saved.

### D. Pick your ad account

`offertest init` lists every ad account the token can see. Pick one as the default, or pass `--account act_<id>` on each command. The ID is also in the Ads Manager URL (`act=`).

## 3. Browser (automatic)

OfferTest uses Google Chrome if you have it, otherwise Microsoft Edge, otherwise Playwright's Chromium. If none is found, `offertest init` offers to download Chromium (about 150 MB), or run:

```bash
npx offertest install-browser
```

## 4. Use it from your coding agent (optional)

`offertest init` finds Muse Code, Claude Code, and Codex and installs the skill for you. By hand:

```bash
muse skills install ./skills/offertest --scope user     # Muse Code
cp -r skills/offertest ~/.claude/skills/                # Claude Code
cp -r skills/offertest ~/.agents/skills/                # Codex
```

Then ask your agent: *"Check the ads I'm about to launch."*

## 5. The Chrome extension for Ads Manager (optional)

Adds a **Test offer** button inside Ads Manager. See [extension/README.md](../extension/README.md).

---

## Where things are saved

- Keys: `~/.offertest/.env` (only readable by you). Environment variables and a `.env` file in the current folder also work: `META_API_KEY`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`.
- Results: `./offertest-runs/<id>/` (report.html, result.json, log.jsonl, screenshots).

## Common problems

| You see | Do this |
|---|---|
| Meta rejected this key | Copy the key again from dev.meta.ai |
| Ads Manager token expired | `offertest init`, step 2 |
| The token lacks ads_read | Add `ads_read` in the Graph API Explorer and generate a new token |
| Report: "Instant Form: Meta did not return the form", or doctor: "No pages_..." | If the error names a permission: run `offertest init`, answer **n** at "Keep this token?", and generate a new token with `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`. Other errors (expired token, deleted form) are shown in the report |
| No paused or in-review ads found | By default OfferTest tests ads that are paused, in a paused campaign or ad set, in review, or with issues. Add `--live` for active ads |
| This token cannot see ad account act_... | Use the Facebook profile that has access to that ad account, or pick another account in `offertest init` |
| No browser found | Install Google Chrome, or `npx offertest install-browser` |
| Blocked: bot check | The site blocks automated browsers. Run with `--headful`, or test a staging copy |
