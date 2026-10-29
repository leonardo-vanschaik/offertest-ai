// Frozen eval set. Labels were fixed from the demo store scenario table (examples/demo-store/README.md) before any scored run.
// Do not edit labels after a scored run. Add new cases with new ids instead.
export type ScenarioName =
  | "baseline"
  | "code_expired"
  | "agent_code_rejected"
  | "code_wrong_percent"
  | "code_missing"
  | "code_excludes_product"
  | "code_min_spend"
  | "price_raised"
  | "shipping_charged"
  | "size_sold_out"
  | "shipping_threshold_ok"
  | "trial_requires_card"
  | "trial_14_days"
  | "guide_link_broken"
  | "guide_paywalled";

export type Ad = { headline: string; text: string; cta: string };

export type EvalCase = {
  id: string;
  scenario: ScenarioName;
  ad: Ad;
  landingUrl: string;
  expected: "pass" | "fail";
  note: string;
};

const RIDGE = "http://localhost:3000/store/products/ridge-trail-shoe";
const SUMMIT = "http://localhost:3000/store/products/summit-rain-jacket";
const TRAIL_CLUB = "http://localhost:3000/store/trail-club";
const GUIDE = "http://localhost:3000/store/guides/first-thru-hike";

// ---------- Ad families (all Alder Trail Co.) ----------

// SAVE20, copy A: the demo ad, verbatim from the contract.
const SAVE20_A: Ad = {
  headline: "20% off the Ridge trail shoe.",
  text: "This week only. Use code SAVE20 at checkout.",
  cta: "Shop now",
};

// SAVE20, copy B: same promise, different words. No price, no shipping, no date claim.
const SAVE20_B: Ad = {
  headline: "Take 20% off the Ridge trail shoe.",
  text: "Enter code SAVE20 at checkout. Limited time at Alder Trail Co.",
  cta: "Shop now",
};

// Price, copy A: Ridge at $120 with free shipping.
const PRICE_A: Ad = {
  headline: "The Ridge trail shoe. $120.",
  text: "Light, grippy, built for rocky miles. Free shipping.",
  cta: "Shop now",
};

// Price, copy B: same promise, different words.
const PRICE_B: Ad = {
  headline: "Meet the Ridge: $120, shipped free.",
  text: "Our trail shoe in Slate, made for long days on the trail.",
  cta: "Shop now",
};

const FREESHIP: Ad = {
  headline: "Free shipping on every order.",
  text: "Gear up for the trail at Alder Trail Co. Shoes, jackets, socks, and packs.",
  cta: "Shop now",
};

const THRESHOLD: Ad = {
  headline: "Free shipping on orders over $50.",
  text: "Stock up on trail gear at Alder Trail Co.",
  cta: "Shop now",
};

// Availability, copy A: verbatim family line.
const AVAIL_A: Ad = {
  headline: "The Ridge in Slate, every size from 7 to 12, in stock now.",
  text: "Find your fit before trail season starts.",
  cta: "Shop now",
};

// Availability, copy B: same promise, different words.
const AVAIL_B: Ad = {
  headline: "Every size in stock.",
  text: "The Ridge trail shoe in Slate. Sizes 7 through 12, all available now.",
  cta: "Shop now",
};

const TRAIL10: Ad = {
  headline: "$10 off the Summit rain jacket with code TRAIL10.",
  text: "Stay dry on the trail. Enter TRAIL10 at checkout.",
  cta: "Shop now",
};

// Free trial (non-checkout funnel): Trail Club membership.
const TRIAL: Ad = {
  headline: "Try Trail Club free for 30 days.",
  text: "Member prices and free returns on every order. No credit card required.",
  cta: "Sign up",
};

// Lead magnet (non-checkout funnel): free PDF guide.
const GUIDE_AD: Ad = {
  headline: "Free: The First Thru-Hike Guide",
  text: "Everything we wish we knew before our first long trail. Instant download.",
  cta: "Download",
};

function c(
  id: string,
  scenario: ScenarioName,
  ad: Ad,
  expected: "pass" | "fail",
  note: string,
  landingUrl: string = RIDGE,
): EvalCase {
  return { id, scenario, ad, landingUrl, expected, note };
}

export const CASES: EvalCase[] = [
  // ---------- Clean and tricky passes (12) ----------
  c("save20a-baseline", "baseline", SAVE20_A, "pass",
    "Baseline: SAVE20 is active and gives 20% off the Ridge (-$24.00)."),
  c("save20a-size_sold_out", "size_sold_out", SAVE20_A, "pass",
    "Only size 10 is sold out. Other sizes add to cart and SAVE20 gives 20% off. The ad makes no size claim."),
  c("save20a-shipping_charged", "shipping_charged", SAVE20_A, "pass",
    "SAVE20 still gives 20% off. The ad makes no shipping claim, so the $8.95 shipping is outside its promises."),
  c("price-a-baseline", "baseline", PRICE_A, "pass",
    "Baseline: Ridge is $120.00 and shipping is free on all orders."),
  c("price-a-code_expired", "code_expired", PRICE_A, "pass",
    "Only SAVE20 changes. The ad makes no code claim. Ridge is $120.00 and ships free."),
  c("price-a-shipping_threshold_ok", "shipping_threshold_ok", PRICE_A, "pass",
    "Free shipping starts at $50. Ridge at $120.00 is over $50, so it ships free."),
  c("freeship-baseline", "baseline", FREESHIP, "pass",
    "Baseline: freeOverCents 0, so every order ships free."),
  c("threshold-shipping_threshold_ok", "shipping_threshold_ok", THRESHOLD, "pass",
    "Store rule is free shipping over $50, exactly what the ad says. A $120 Ridge order ships free."),
  c("avail-a-baseline", "baseline", AVAIL_A, "pass",
    "Baseline: all Ridge Slate sizes 7 to 12 have stock 25."),
  c("trail10-baseline", "baseline", TRAIL10, "pass",
    "Baseline: TRAIL10 gives $10 off the Summit (-$10.00).", SUMMIT),
  c("trail10-shipping_charged", "shipping_charged", TRAIL10, "pass",
    "TRAIL10 still gives $10 off the Summit. The ad promises nothing about shipping, so $8.95 shipping does not contradict it.", SUMMIT),
  c("trail10-code_expired", "code_expired", TRAIL10, "pass",
    "Only SAVE20 expires. TRAIL10 is unchanged and gives $10 off the Summit.", SUMMIT),

  // ---------- Real failures (18) ----------
  c("save20a-code_expired", "code_expired", SAVE20_A, "fail",
    "SAVE20 expired yesterday: cart says \"This code has expired.\" and total stays $120.00."),
  c("save20a-code_wrong_percent", "code_wrong_percent", SAVE20_A, "fail",
    "SAVE20 gives 10% (-$12.00), not the 20% the ad promises."),
  c("save20a-code_missing", "code_missing", SAVE20_A, "fail",
    "SAVE20 does not exist: cart says \"This code is not valid.\""),
  c("save20a-code_excludes_product", "code_excludes_product", SAVE20_A, "fail",
    "SAVE20 applies only to the Summit: cart says \"This code does not apply to items in your cart.\""),
  c("save20a-code_min_spend", "code_min_spend", SAVE20_A, "fail",
    "SAVE20 needs a $150 subtotal. One Ridge is $120, so the ad's undisclosed minimum blocks the 20% off."),
  c("save20b-code_expired", "code_expired", SAVE20_B, "fail",
    "Copy B, same promise. SAVE20 expired: \"This code has expired.\""),
  c("save20b-code_wrong_percent", "code_wrong_percent", SAVE20_B, "fail",
    "Copy B, same promise. SAVE20 gives 10%, not 20%."),
  c("save20b-code_missing", "code_missing", SAVE20_B, "fail",
    "Copy B, same promise. SAVE20 does not exist: \"This code is not valid.\""),
  c("save20b-code_excludes_product", "code_excludes_product", SAVE20_B, "fail",
    "Copy B, same promise. SAVE20 does not apply to the Ridge."),
  c("save20b-code_min_spend", "code_min_spend", SAVE20_B, "fail",
    "Copy B, same promise. SAVE20 needs $150; one Ridge is $120: \"Spend $150.00 or more to use this code.\""),
  c("price-a-price_raised", "price_raised", PRICE_A, "fail",
    "Ridge costs $135.00, not the $120 the ad states."),
  c("price-a-shipping_charged", "shipping_charged", PRICE_A, "fail",
    "Ridge at $120 is under the $150 free-shipping line, so $8.95 shipping is charged. The ad says free shipping."),
  c("price-b-price_raised", "price_raised", PRICE_B, "fail",
    "Copy B, same promise. Ridge costs $135.00, not $120."),
  c("price-b-shipping_charged", "shipping_charged", PRICE_B, "fail",
    "Copy B, same promise. A $120 Ridge order pays $8.95 shipping; the ad says shipped free."),
  c("freeship-shipping_charged", "shipping_charged", FREESHIP, "fail",
    "Shipping is $8.95 below $150. A single Ridge order ($120) is charged, so not every order ships free."),
  c("threshold-shipping_charged", "shipping_charged", THRESHOLD, "fail",
    "Free shipping starts at $150, not $50. A $120 Ridge order is over $50 but pays $8.95."),
  c("avail-a-size_sold_out", "size_sold_out", AVAIL_A, "fail",
    "Ridge Slate size 10 shows \"Sold out\", so not every size 7 to 12 is in stock."),
  c("avail-b-size_sold_out", "size_sold_out", AVAIL_B, "fail",
    "Copy B, same promise. Size 10 is sold out."),

  // ---------- Non-checkout funnels (8): free trial and lead magnet. 4 pass, 4 fail ----------
  c("trial-baseline", "baseline", TRIAL, "pass",
    "Baseline: the join form asks only name, email, and password. Welcome page says the free trial ends 30 days from today.", TRAIL_CLUB),
  c("trial-trial_requires_card", "trial_requires_card", TRIAL, "fail",
    "The join form requires card number, expiry, and CVC: \"A card is required to start your trial.\" The ad says no credit card required.", TRAIL_CLUB),
  c("trial-trial_14_days", "trial_14_days", TRIAL, "fail",
    "The trial is 14 days, not 30: landing and welcome pages say 14 days.", TRAIL_CLUB),
  c("trial-code_expired", "code_expired", TRIAL, "pass",
    "Only SAVE20 changes. Trail Club is still a 30-day free trial with no card.", TRAIL_CLUB),
  c("guide-baseline", "baseline", GUIDE_AD, "pass",
    "Baseline: after the email form, \"Download the guide (PDF)\" opens /guides/first-thru-hike.pdf.", GUIDE),
  c("guide-guide_link_broken", "guide_link_broken", GUIDE_AD, "fail",
    "The download link points to a missing file: 404, so there is no instant download.", GUIDE),
  c("guide-guide_paywalled", "guide_paywalled", GUIDE_AD, "fail",
    "Thanks page says \"Your guide is ready. Unlock it for $4.99\". The ad says free.", GUIDE),
  c("guide-price_raised", "price_raised", GUIDE_AD, "pass",
    "Only the Ridge price changes. The guide is still free and downloads right away.", GUIDE),

  // ---------- Agent checkout (UCP) (3): the website works, AI shopping agents do not ----------
  c("save20a-agent_code_rejected", "agent_code_rejected", SAVE20_A, "fail",
    "SAVE20 works on the website (-$24.00), but the agent checkout says \"This code is not valid.\" Shoppers who buy through an AI agent pay $120.00."),
  c("save20b-agent_code_rejected", "agent_code_rejected", SAVE20_B, "fail",
    "Copy B, same promise. The agent checkout rejects SAVE20."),
  c("price-a-agent_code_rejected", "agent_code_rejected", PRICE_A, "pass",
    "Only SAVE20 is web-only. The ad makes no code claim. Ridge is $120.00 and ships free in both channels."),
];

if (CASES.length !== 41) throw new Error(`eval/cases.ts must have 41 cases, has ${CASES.length}`);
if (new Set(CASES.map((x) => x.id)).size !== CASES.length) throw new Error("duplicate case id");
