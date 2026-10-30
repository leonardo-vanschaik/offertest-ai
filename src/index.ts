// Library entry: use OfferTest from your own code.
export { runTest, VERSION } from "./core/run.ts";
export { getAd, listAds, pauseAd, getLeadForm } from "./meta/ads.ts";
export { writeReport } from "./report/html.ts";
export { agentCheckout } from "./core/ucp.ts";
export { acpCheckout } from "./core/acp.ts";
export type * from "./types.ts";
