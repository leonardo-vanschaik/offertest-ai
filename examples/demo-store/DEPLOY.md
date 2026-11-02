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

4. Create the table in the remote database.

   ```bash
   npm run cf:db:remote
   ```

5. Build and deploy.

   ```bash
   npm run cf:deploy
   ```

   The route in `wrangler.jsonc` has `custom_domain: true`. Cloudflare creates the DNS record for `demo.offertest.ai` itself.

6. Check it.

   ```bash
   curl https://demo.offertest.ai/api/store/config
   ```

   Then open `https://demo.offertest.ai/store`.

## Later deploys

```bash
npm run cf:deploy
```

## Switch scenarios on the live store

Use `https://demo.offertest.ai/store/admin`, or:

```bash
curl -X POST https://demo.offertest.ai/api/store/scenario -H 'content-type: application/json' -d '{"scenario":"code_expired"}'
```

The next page load shows the new scenario. D1 is strongly consistent, so there is no delay.

Reset the store (baseline config, no orders):

```bash
curl -X POST https://demo.offertest.ai/api/store/reset
```

These admin endpoints have no login. Anyone with the URL can switch the scenario.

## Optional settings

Change the ACP API key (default `alder-trail-demo`):

```bash
npx wrangler secret put ACP_API_KEY
```

ACP checkout sessions and UCP carts are kept in memory. On Workers a later request can reach a different instance and not find the session. Store orders and the scenario are in D1 and are always shared.

## Test the Workers build locally

This needs no Cloudflare login. It uses a local D1 database in `.wrangler/`.

```bash
npm run cf:db:local
npm run cf:preview
```

The store is then at `http://localhost:8787/store`.
