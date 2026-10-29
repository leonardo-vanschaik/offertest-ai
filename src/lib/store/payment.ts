// Test-mode payment rules. Pure.

export const TEST_CARD = "4242424242424242";

export const PAYMENT_MESSAGES = {
  declined: "Your card was declined.",
  badExpiry: "Enter a valid expiry date (MM/YY) in the future.",
  badCvc: "Enter the 3 or 4 digit security code (CVC).",
} as const;

/** Returns null when the card is accepted, else the customer-facing error. */
export function checkTestCard(
  cardNumber: string,
  expiry: string,
  cvc: string,
  now: Date = new Date(),
): string | null {
  const digits = cardNumber.replace(/[\s-]/g, "");
  const m = expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return PAYMENT_MESSAGES.badExpiry;
  const month = Number(m[1]);
  let year = Number(m[2]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return PAYMENT_MESSAGES.badExpiry;
  // Card is valid through the last day of the expiry month.
  if (new Date(year, month, 1).getTime() <= now.getTime()) return PAYMENT_MESSAGES.badExpiry;
  if (!/^\d{3,4}$/.test(cvc.trim())) return PAYMENT_MESSAGES.badCvc;
  if (digits !== TEST_CARD) return PAYMENT_MESSAGES.declined;
  return null;
}
