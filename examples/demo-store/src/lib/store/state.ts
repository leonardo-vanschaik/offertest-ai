import fs from "node:fs";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Coupon, Order, PricedCart, ScenarioName, StoreConfig, StoreFix } from "@/lib/types";
import { baselineConfig, baselineFunnels, FIRST_ORDER_NUMBER } from "./catalog";
import { scenarioConfig } from "./scenarios";

// Server-only state. Locally it persists to data/store.json so it survives dev reloads and is shared
// by every process that imports this module (Next server, eval scripts).
// On Cloudflare Workers (no lasting file system) it is one row of the STORE_DB D1 database.

export const STORE_FILE = path.join(process.cwd(), "data", "store.json");

type StoreState = {
  version: 1;
  config: StoreConfig;
  orders: Order[]; // oldest first on disk
  nextOrderNumber: number;
  cartEpoch: number; // bumped on scenario/reset; carts from older epochs are treated as empty
};

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

function freshState(): StoreState {
  return {
    version: 1,
    config: baselineConfig(),
    orders: [],
    nextOrderNumber: FIRST_ORDER_NUMBER,
    cartEpoch: Date.now(),
  };
}

function parseState(raw: string | null): StoreState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoreState;
    if (s && s.version === 1 && s.config && Array.isArray(s.orders)) {
      s.config.funnels ??= baselineFunnels(); // state written before funnels existed
      return s;
    }
  } catch {
    // unreadable: caller falls back to baseline
  }
  return null;
}

type Backend = {
  read(): Promise<StoreState>;
  mutate<T>(fn: (s: StoreState) => T): Promise<T>; // fn changes the latest state; the change is saved unless fn throws
  replace(s: StoreState): Promise<void>;
};

// ---------- File backend (next dev, next start, eval scripts) ----------

function writeFile(state: StoreState): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function readFile(): StoreState {
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(STORE_FILE, "utf8");
  } catch {
    // missing: fall through to baseline
  }
  const s = parseState(raw);
  if (s) return s;
  const fresh = freshState();
  writeFile(fresh);
  return fresh;
}

const fileBackend: Backend = {
  read: async () => readFile(),
  // Sync read, change, and write: requests in this process cannot interleave.
  mutate: async (fn) => {
    const s = readFile();
    const out = fn(s);
    writeFile(s);
    return out;
  },
  replace: async (s) => writeFile(s),
};

// ---------- D1 backend (Cloudflare Workers) ----------

// The few D1 methods used here. Schema: migrations/0001_state.sql.
type D1 = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
  exec(sql: string): Promise<unknown>;
};

declare global {
  interface CloudflareEnv {
    STORE_DB?: D1;
  }
}

const ROW = "store";
const CAS_TRIES = 20;
let tableReady: Promise<unknown> | undefined;

function d1Backend(db: D1): Backend {
  // Same table as the migration, so a database without it still works.
  tableReady ??= db.exec("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)").catch((e) => {
    tableReady = undefined; // try again on the next request
    throw e;
  });

  const save = (next: StoreState, prev: string) =>
    db.prepare("UPDATE state SET value = ? WHERE key = ? AND value = ?").bind(JSON.stringify(next), ROW, prev).run();

  // The parsed state and the raw row text it came from (for compare-and-swap).
  async function load(): Promise<{ s: StoreState; raw: string }> {
    await tableReady;
    for (let i = 0; i < CAS_TRIES; i++) {
      const raw = (await db.prepare("SELECT value FROM state WHERE key = ?").bind(ROW).first<{ value: string }>())?.value ?? null;
      const s = parseState(raw);
      if (s && raw !== null) return { s, raw };
      // Missing or unreadable: start from baseline, unless another request just did.
      if (raw === null) await db.prepare("INSERT OR IGNORE INTO state (key, value) VALUES (?, ?)").bind(ROW, JSON.stringify(freshState())).run();
      else await save(freshState(), raw);
    }
    throw new StoreError("Store state is busy. Try again.", 503);
  }

  return {
    read: async () => (await load()).s,
    // Compare-and-swap: write only if the row did not change since the read, else retry on the new state.
    mutate: async (fn) => {
      for (let i = 0; i < CAS_TRIES; i++) {
        const { s, raw } = await load();
        const out = fn(s);
        if ((await save(s, raw)).meta.changes === 1) return out;
      }
      throw new StoreError("Store state is busy. Try again.", 503);
    },
    replace: async (s) => {
      await tableReady;
      await db
        .prepare("INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .bind(ROW, JSON.stringify(s))
        .run();
    },
  };
}

// On Workers use the STORE_DB binding. Elsewhere (Node) use the file: the async Cloudflare
// context would start a local wrangler proxy there instead of failing.
async function backend(): Promise<Backend> {
  if (globalThis.navigator?.userAgent !== "Cloudflare-Workers") return fileBackend;
  const { env } = await getCloudflareContext({ async: true });
  if (!env.STORE_DB) throw new Error("STORE_DB D1 binding is missing. See DEPLOY.md.");
  return d1Backend(env.STORE_DB);
}

const readState = async () => (await backend()).read();
const mutate = async <T>(fn: (s: StoreState) => T): Promise<T> => (await backend()).mutate(fn);

export async function getConfig(): Promise<StoreConfig> {
  return (await readState()).config;
}

export async function getCartEpoch(): Promise<number> {
  return (await readState()).cartEpoch;
}

/** Reset config to baseline, then apply the scenario. Clears carts. Keeps orders. */
export async function setScenario(name: ScenarioName): Promise<StoreConfig> {
  return mutate((s) => {
    s.config = scenarioConfig(name);
    s.cartEpoch = Date.now();
    return s.config;
  });
}

/** Reset to baseline, delete all orders, restart order ids at AT-10427, clear carts. */
export async function resetStore(): Promise<StoreConfig> {
  const s = freshState();
  await (await backend()).replace(s);
  return s.config;
}

function couponOrThrow(config: StoreConfig, code: string): Coupon {
  const c = config.coupons.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!c) throw new StoreError(`Unknown coupon code: ${code}`);
  return c;
}

function checkProducts(config: StoreConfig, ids: string[]): void {
  for (const id of ids) {
    if (!config.products.some((p) => p.id === id)) throw new StoreError(`Unknown product: ${id}`);
  }
}

function checkDate(iso: string): void {
  if (Number.isNaN(new Date(iso).getTime())) throw new StoreError(`Invalid date: ${iso}`);
}

/** Apply one approved fix. Throws StoreError (status 400) on unknown product, variant, or code. */
export async function applyFix(fix: StoreFix): Promise<StoreConfig> {
  return mutate((s) => {
    const c = s.config;
    switch (fix.type) {
      case "extend_coupon": {
        checkDate(fix.expiresAt);
        couponOrThrow(c, fix.code).expiresAt = fix.expiresAt;
        break;
      }
      case "set_coupon_percent": {
        const cp = couponOrThrow(c, fix.code);
        cp.percentOff = fix.percentOff;
        delete cp.amountOffCents;
        break;
      }
      case "create_coupon": {
        const coupon: Coupon = { ...fix.coupon, code: fix.coupon.code.trim().toUpperCase() };
        if (!coupon.code) throw new StoreError("Coupon code is required");
        checkDate(coupon.expiresAt);
        if (coupon.productIds) checkProducts(c, coupon.productIds);
        c.coupons = c.coupons.filter((x) => x.code.toUpperCase() !== coupon.code);
        c.coupons.push(coupon);
        break;
      }
      case "set_coupon_products": {
        const cp = couponOrThrow(c, fix.code);
        if (fix.productIds === null) delete cp.productIds;
        else {
          checkProducts(c, fix.productIds);
          cp.productIds = [...fix.productIds];
        }
        break;
      }
      case "set_coupon_min_spend": {
        const cp = couponOrThrow(c, fix.code);
        if (fix.minSubtotalCents === null) delete cp.minSubtotalCents;
        else cp.minSubtotalCents = fix.minSubtotalCents;
        break;
      }
      case "set_price": {
        const p = c.products.find((x) => x.id === fix.productId);
        if (!p) throw new StoreError(`Unknown product: ${fix.productId}`);
        p.priceCents = fix.priceCents;
        break;
      }
      case "set_shipping": {
        c.shipping = { flatRateCents: fix.flatRateCents, freeOverCents: fix.freeOverCents };
        break;
      }
      case "restock_variant": {
        const p = c.products.find((x) => x.id === fix.productId);
        if (!p) throw new StoreError(`Unknown product: ${fix.productId}`);
        const v = p.variants.find((x) => x.id === fix.variantId);
        if (!v) throw new StoreError(`Unknown variant: ${fix.variantId}`);
        v.stock = fix.stock;
        break;
      }
      default: {
        const never: never = fix;
        throw new StoreError(`Unknown fix type: ${JSON.stringify(never)}`);
      }
    }
    return c;
  });
}

/** All orders, newest first. */
export async function listOrders(): Promise<Order[]> {
  return [...(await readState()).orders].reverse();
}

export async function getOrder(id: string): Promise<Order | null> {
  return (await readState()).orders.find((o) => o.id === id.trim().toUpperCase()) ?? null;
}

export type NewOrderInput = {
  email: string;
  name: string;
  address: string;
  cardLast4: string;
  priced: PricedCart; // must come from priceCart() on the server
};

/** Create an order with the next AT- id. Caller validates fields and payment first. */
export async function createOrder(input: NewOrderInput): Promise<Order> {
  if (input.priced.lines.length === 0) throw new StoreError("Cart is empty");
  return mutate((s) => {
    const order: Order = {
      id: `AT-${s.nextOrderNumber}`,
      createdAt: new Date().toISOString(),
      email: input.email,
      name: input.name,
      address: input.address,
      cardLast4: input.cardLast4,
      testMode: true,
      priced: input.priced,
    };
    s.nextOrderNumber += 1;
    s.orders.push(order);
    return order;
  });
}
