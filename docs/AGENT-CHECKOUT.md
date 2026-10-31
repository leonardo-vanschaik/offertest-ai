# Agent checkout: where AI shopping agents buy

Shoppers now buy through AI agents such as Meta Muse, ChatGPT, and Gemini. Those agents do not click through your website. They use the store's agent checkout. A code can work on the website and still fail there, for example when the discount is limited to the Online Store sales channel. OfferTest tests both.

## UCP (Universal Commerce Protocol)

Every Shopify store publishes a [UCP](https://ucp.dev) agent checkout at `/.well-known/ucp`. For every website ad, OfferTest also builds a cart there with the ad's codes and reads the real totals. A code that fails there fails the test, and the report quotes the store's message. This needs no keys, costs nothing, and never places an order. Try it on any Shopify store:

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

## ACP (Agentic Commerce Protocol): a full AI-agent buy, in test mode

The [Agentic Commerce Protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) (ACP, by Stripe, OpenAI, and Meta) is the checkout API AI agents such as ChatGPT use to buy. The store owner gives the agent a key, so this runs on stores you own. OfferTest acts as the agent: it opens a checkout session with the ad's codes, reads which codes the store applied or rejected, and finishes a test purchase. It never uses real money: it uses the store's demo token, or a Stripe test-mode payment token (set `STRIPE_TEST_KEY` to your store's `sk_test_` key).

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

- Add `--acp-url` and `--acp-key` (or `OFFERTEST_ACP_URL` and `OFFERTEST_ACP_KEY`) to `check`, and every website ad is also tested in the ACP checkout.
- Like the browser, `check` stops before payment unless you add `--pay`, and then it asks you first.
- `--item` sets the store's item id. The default is the `?variant=` in the landing link, else the last part of the landing page path.
- `--no-buy` never finishes the purchase.

The demo store has an ACP checkout at `http://localhost:3000/api/acp` (key `alder-trail-demo`). It passes the [`acp-check`](https://www.npmjs.com/package/acp-check) conformance tool.
