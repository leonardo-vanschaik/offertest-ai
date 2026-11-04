import { test } from "node:test";
import assert from "node:assert/strict";
import { appliedCodes, cartText, codesFrom } from "../src/core/ucp.ts";

test("codes come from promise conditions", () => {
  assert.deepEqual(codesFrom([{ code: "save20", percent: "20%" }, { discount_code: "TRAIL10" }, { product: "Ridge" }, { code: "use it now" }]), ["SAVE20", "TRAIL10"]);
});

test("a rejected code shows the store's message and full totals", () => {
  const text = cartText(
    {
      currency: "USD",
      line_items: [{ item: { title: "Ridge trail shoe - Size 7", price: 12000 }, quantity: 1 }],
      discounts: { codes: ["SAVE20"], applied: [] },
      messages: [{ type: "warning", code: "discount_code_expired", content: "This code has expired." }],
      totals: [{ type: "subtotal", display_text: "Subtotal", amount: 12000 }, { type: "total", display_text: "Total", amount: 12000 }],
    },
    "https://shop.example/api/ucp/mcp",
    ["SAVE20"],
  );
  assert.match(text, /Discounts applied: none/);
  assert.match(text, /discount_code_expired\): This code has expired\./);
  assert.match(text, /Total: \$120\.00/);
});

test("an applied code shows a negative amount", () => {
  const text = cartText(
    { discounts: { codes: ["SAVE20"], applied: [{ code: "SAVE20", title: "20% off", amount: 2400 }] }, totals: [{ type: "discount", amount: -2400 }] },
    "e",
    ["SAVE20"],
  );
  assert.match(text, /Discount applied: SAVE20 "20% off" -\$24\.00/);
  assert.match(text, /discount: -\$24\.00/);
});

test("only the whole code counts as applied: SAVE20VIP is not SAVE20", () => {
  const text = cartText(
    {
      discounts: { codes: ["SAVE20", "SAVE20VIP"], applied: [{ code: "SAVE20VIP", title: "VIP", amount: 2400 }] },
      messages: [{ type: "warning", code: "discount_code_expired", content: "SAVE20 has expired." }],
    },
    "e",
    ["SAVE20", "SAVE20VIP"],
  );
  assert.deepEqual([...appliedCodes(text)], ["SAVE20VIP"]);
  assert.equal(appliedCodes(text).has("SAVE20"), false);
  assert.deepEqual([...appliedCodes(cartText({ discounts: { applied: [{ code: "save20", amount: 2400 }] } }, "e", ["SAVE20"]))], ["SAVE20"], "any case");
});

test("no discount result is said plainly, not as a rejection", () => {
  assert.match(cartText({ totals: [] }, "e", ["SAVE20"]), /no discount result/);
});
