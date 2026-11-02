import type { Coupon, Funnels, Product, StoreConfig } from "@/lib/types";

// Baseline store data. Pure: no I/O. Every scenario starts from a fresh copy of this.

export const STORE_NAME = "Alder Trail Co.";
// Working codes stay valid long past judging and the community vote. The code_expired scenario sets a past date.
export const BASELINE_EXPIRY = "2027-12-31T23:59:00-05:00";
export const FIRST_ORDER_NUMBER = 10427;
export const DEFAULT_STOCK = 25;

function sizes(prefix: string, labels: string[], labelPrefix = "Size "): Product["variants"] {
  return labels.map((l) => ({
    id: `${prefix}-${l.toLowerCase()}`,
    label: `${labelPrefix}${l}`,
    stock: DEFAULT_STOCK,
  }));
}

export function baselineProducts(): Product[] {
  return [
    {
      id: "ridge",
      slug: "ridge-trail-shoe",
      name: "Ridge trail shoe",
      color: "Slate",
      description:
        "A light, grippy trail shoe for long days on mixed ground. Recycled mesh upper, cushioned midsole, and 4 mm lugs that hold on wet rock.",
      priceCents: 12000,
      image: "/store/ridge.svg",
      variants: sizes("ridge-slate", ["7", "8", "9", "10", "11", "12"]),
    },
    {
      id: "summit",
      slug: "summit-rain-jacket",
      name: "Summit rain jacket",
      color: "Moss",
      description:
        "A packable 2.5-layer shell with taped seams, an adjustable hood, and pit zips. Stuffs into its own chest pocket.",
      priceCents: 8900,
      image: "/store/summit.svg",
      variants: sizes("summit-moss", ["S", "M", "L", "XL"]),
    },
    {
      id: "basecamp",
      slug: "basecamp-wool-socks",
      name: "Basecamp wool socks",
      color: "Oatmeal",
      description:
        "Midweight merino blend socks with a cushioned footbed and a seamless toe. Warm in the cold, dry in the heat.",
      priceCents: 1800,
      image: "/store/basecamp.svg",
      variants: [{ id: "basecamp-oatmeal-os", label: "One size", stock: DEFAULT_STOCK }],
    },
    {
      id: "switchback",
      slug: "switchback-daypack",
      name: "Switchback daypack",
      color: "Charcoal",
      description:
        "A 22 L daypack with a padded back panel, hip belt, and a hydration sleeve. Water-resistant ripstop with a roll-free zip top.",
      priceCents: 6400,
      image: "/store/switchback.svg",
      variants: [{ id: "switchback-charcoal-os", label: "One size", stock: DEFAULT_STOCK }],
    },
  ];
}

export function baselineCoupons(): Coupon[] {
  return [
    {
      code: "SAVE20",
      percentOff: 20,
      productIds: ["ridge"],
      expiresAt: BASELINE_EXPIRY,
      active: true,
    },
    {
      code: "TRAIL10",
      amountOffCents: 1000,
      productIds: ["summit"],
      expiresAt: BASELINE_EXPIRY,
      active: true,
    },
  ];
}

export function baselineFunnels(): Funnels {
  return { trialDays: 30, trialRequiresCard: false, guide: "ok" };
}

export function baselineConfig(): StoreConfig {
  return {
    storeName: STORE_NAME,
    products: baselineProducts(),
    coupons: baselineCoupons(),
    shipping: { flatRateCents: 895, freeOverCents: 0 },
    funnels: baselineFunnels(),
    scenario: "baseline",
  };
}
