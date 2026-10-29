import type { ScenarioName, StoreConfig } from "@/lib/types";
import { baselineConfig } from "./catalog";

// Pure: builds the config for a scenario from a fresh baseline.

export const SCENARIOS: { name: ScenarioName; label: string }[] = [
  { name: "baseline", label: "Baseline (everything matches the ad)" },
  { name: "code_expired", label: "SAVE20 expired yesterday" },
  { name: "code_wrong_percent", label: "SAVE20 gives 10% instead of 20%" },
  { name: "code_missing", label: "SAVE20 does not exist" },
  { name: "code_excludes_product", label: "SAVE20 does not apply to Ridge" },
  { name: "code_min_spend", label: "SAVE20 needs a $150 subtotal" },
  { name: "price_raised", label: "Ridge costs $135.00" },
  { name: "shipping_charged", label: "$8.95 shipping, free over $150" },
  { name: "size_sold_out", label: "Ridge size 10 sold out" },
  { name: "shipping_threshold_ok", label: "Free shipping over $50 (Ridge still free)" },
  { name: "trial_requires_card", label: "Trail Club trial asks for a card" },
  { name: "trial_14_days", label: "Trail Club trial is 14 days" },
  { name: "guide_link_broken", label: "Guide download link is a 404" },
  { name: "guide_paywalled", label: "Guide costs $4.99" },
];

export function isScenarioName(x: unknown): x is ScenarioName {
  return typeof x === "string" && SCENARIOS.some((s) => s.name === x);
}

export function scenarioConfig(name: ScenarioName, now: Date = new Date()): StoreConfig {
  const c = baselineConfig();
  c.scenario = name;
  const save20 = c.coupons.find((x) => x.code === "SAVE20")!;
  const ridge = c.products.find((p) => p.id === "ridge")!;
  switch (name) {
    case "baseline":
      break;
    case "code_expired":
      save20.expiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      break;
    case "code_wrong_percent":
      save20.percentOff = 10;
      break;
    case "code_missing":
      c.coupons = c.coupons.filter((x) => x.code !== "SAVE20");
      break;
    case "code_excludes_product":
      save20.productIds = ["summit"];
      break;
    case "code_min_spend":
      save20.minSubtotalCents = 15000;
      break;
    case "price_raised":
      ridge.priceCents = 13500;
      break;
    case "shipping_charged":
      c.shipping = { flatRateCents: 895, freeOverCents: 15000 };
      break;
    case "size_sold_out":
      ridge.variants.find((v) => v.id === "ridge-slate-10")!.stock = 0;
      break;
    case "shipping_threshold_ok":
      c.shipping = { flatRateCents: 895, freeOverCents: 5000 };
      break;
    case "trial_requires_card":
      c.funnels.trialRequiresCard = true;
      break;
    case "trial_14_days":
      c.funnels.trialDays = 14;
      break;
    case "guide_link_broken":
      c.funnels.guide = "broken_link";
      break;
    case "guide_paywalled":
      c.funnels.guide = "paywalled";
      break;
  }
  return c;
}
