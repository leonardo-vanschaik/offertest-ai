# Deploy the demo store to Cloudflare

The store runs on Cloudflare Workers at `https://demo.offertest.ai` through the OpenNext adapter (`@opennextjs/cloudflare`).
Locally (`npm run dev`, `npm start`) the store keeps its state in `data/store.json`.
On Cloudflare it keeps the same state in one row of a D1 database (binding `STORE_DB`).

## First deploy

Run these commands in `examples/demo-store`.

1. Install the packages.

   ```bash
   npm install
   ```

2. Log in to Cloudflare. This opens the browser.

   ```bash
   npx wrangler login
   ```

3. Create the D1 database.

   ```bash
   npx wrangler d1 create offertest-demo
   ```

   The command prints a `database_id`. Open `wrangler.jsonc` and replace `00000000-0000-0000-0000-000000000000` with it.
   If wrangler asks to add the binding to your config, answer no. The binding is already there.

4. Create the tables in the remote database.

   ```bash
   npm run cf:db:remote
   ```

5. Set the store admin key. Without it the admin (scenario, fix, reset, order list) is off on the public store.

   ```bash
   npx wrangler secret put STORE_ADMIN_KEY
   ```

6. Build and deploy.

   ```bash
   npm run cf:deploy
   ```

   The route in `wrangler.jsonc` has `custom_domain: true`. Cloudflare creates the DNS record for `demo.offertest.ai` itself.

7. Check it.

   ```bash
   curl https://demo.offertest.ai/api/store/config
   ```

   Then open `https://demo.offertest.ai/store`.

## Later deploys

```bash
npm run cf:deploy
```

## Switch scenarios on the live store

Everyone shares the public store, so the admin needs the key from step 5. Use `https://demo.offertest.ai/store/admin?key=<key>`, or:

```bash
curl -X POST https://demo.offertest.ai/api/store/scenario -H "x-admin-key: $STORE_ADMIN_KEY" \
  -H 'content-type: application/json' -d '{"scenario":"code_expired"}'
```

The next page load shows the new scenario. D1 is strongly consistent, so there is no delay.

Reset the store (baseline config, no orders):

```bash
curl -X POST https://demo.offertest.ai/api/store/reset -H "x-admin-key: $STORE_ADMIN_KEY"
```

Keep the public store on `code_expired`: that is the example in the OfferTest README.

## Optional settings

Change the ACP API key (default `alder-trail-demo`):

```bash
npx wrangler secret put ACP_API_KEY
```

Everything is in D1 and shared by every Workers instance: the scenario, orders, ACP checkout sessions, UCP carts, and ACP idempotency keys. A session is paid at most once: `complete` takes a lock on the session with a compare-and-swap write.

Orders keep no full contact data. The store saves `t***@example.com`, a first name with an initial, and no street address, because anyone can type real details into a public test store. It keeps the newest 200 orders.

## Test the Workers build locally

This needs no Cloudflare login. It uses a local D1 database in `.wrangler/`.

```bash
npm run cf:db:local
npm run cf:preview
```

The store is then at `http://localhost:8787/store`.
