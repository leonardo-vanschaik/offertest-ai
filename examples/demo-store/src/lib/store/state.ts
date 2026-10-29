import fs from "node:fs";
import path from "node:path";
import type { Coupon, Order, PricedCart, ScenarioName, StoreConfig, StoreFix } from "@/lib/types";
import { baselineConfig, baselineFunnels, FIRST_ORDER_NUMBER } from "./catalog";
import { scenarioConfig } from "./scenarios";

// Server-only state. Persists to data/store.json so it survives dev reloads and is shared
// by every process that imports this module (Next server, eval scripts).

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

function writeState(state: StoreState): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function readState(): StoreState {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const s = JSON.parse(raw) as StoreState;
    if (s && s.version === 1 && s.config && Array.isArray(s.orders)) {
      s.config.funnels ??= baselineFunnels(); // store.json written before funnels existed
      return s;
    }
  } catch {
    // missing or unreadable: fall through to baseline
  }
  const s = freshState();
  writeState(s);
  return s;
}

function mutate<T>(fn: (s: StoreState) => T): T {
  const s = readState();
  const out = fn(s);
  writeState(s);
  return out;
}

export function getConfig(): StoreConfig {
  return readState().config;
}

export function getCartEpoch(): number {
  return readState().cartEpoch;
}

/** Reset config to baseline, then apply the scenario. Clears carts. Keeps orders. */
export function setScenario(name: ScenarioName): StoreConfig {
  return mutate((s) => {
    s.config = scenarioConfig(name);
    s.cartEpoch = Date.now();
    return s.config;
  });
}

/** Reset to baseline, delete all orders, restart order ids at AT-10427, clear carts. */
export function resetStore(): StoreConfig {
  const s = freshState();
  writeState(s);
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
export function applyFix(fix: StoreFix): StoreConfig {
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
export function listOrders(): Order[] {
  return [...readState().orders].reverse();
}

export function getOrder(id: string): Order | null {
  return readState().orders.find((o) => o.id === id.trim().toUpperCase()) ?? null;
}

export type NewOrderInput = {
  email: string;
  name: string;
  address: string;
  cardLast4: string;
  priced: PricedCart; // must come from priceCart() on the server
};

/** Create an order with the next AT- id. Caller validates fields and payment first. */
export function createOrder(input: NewOrderInput): Order {
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
