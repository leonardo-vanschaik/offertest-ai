// Alder Trail Co. test store library. Server-only (node:fs or D1, see state.ts), except pricing.ts which is pure.
export {
  getConfig,
  setScenario,
  applyFix,
  listOrders,
  getOrder,
  createOrder,
  resetStore,
  getCartEpoch,
  StoreError,
  STORE_FILE,
} from "./state";
export type { NewOrderInput } from "./state";
export {
  priceCart,
  findCoupon,
  isCouponExpired,
  cartCount,
  describeCoupon,
  describeShipping,
  COUPON_MESSAGES,
} from "./pricing";
export { SCENARIOS, isScenarioName, scenarioConfig } from "./scenarios";
export { baselineConfig, baselineFunnels, STORE_NAME, BASELINE_EXPIRY, FIRST_ORDER_NUMBER } from "./catalog";
export { TEST_CARD, checkTestCard, PAYMENT_MESSAGES } from "./payment";
