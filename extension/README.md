# OfferTest for Ads Manager (Chrome extension)

Adds a **Test offer** button to Meta Ads Manager. Select ads, click the button, and the OfferTest side panel follows each ad's funnel like a customer and shows which promises hold, with the ad's words next to what the funnel shows. You can pause a failing ad from the panel.

The extension only reads `act` and `selected_ad_ids` from the Ads Manager URL. It does not read Meta's page, your Facebook session, or your cookies. The test runs on your computer through `offertest serve`, which uses your own Meta keys.

## 1. Start the local server

```sh
npx offertest init     # once: saves META_API_KEY and META_ACCESS_TOKEN (permissions: see ../docs/SETUP.md)
npx offertest serve    # keep this terminal open; listens on http://127.0.0.1:7777
```

## 2. Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin **OfferTest for Ads Manager** from the puzzle-piece menu (optional).

## 3. Use it

1. Open [Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/ads) and tick one or more ads.
2. Click **Test offer · N ads** at the bottom right, or the toolbar icon.
3. In the side panel, click **Run test**. If Ads Manager does not put the ad IDs in the URL (large selections), paste an ad ID into the panel instead.

In the server mode, the agent never pays. **Pause ad** always asks you to confirm first.

The `key` in `manifest.json` fixes the extension ID (`hfjeehndnoioofnabimflagfndlmddme`). `offertest serve` accepts actions only from that ID. If you fork the extension with a new key, set `OFFERTEST_EXTENSION_ID` to your ID.
