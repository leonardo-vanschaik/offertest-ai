// Payment guard on small inline pages. No demo store needed. Run: node --import tsx --test test/guard.e2e.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Driver } from "../src/core/driver.ts";
import type { ComputerAction } from "../src/types.ts";

async function page(html: string, fn: (d: Driver) => Promise<void>) {
  const d = new Driver();
  await d.start("about:blank");
  try {
    await d.page.setContent(html);
    await fn(d);
  } finally {
    await d.close();
  }
}

const enter: ComputerAction = { type: "keypress", keys: ["Enter"] };

test("Enter submits through a pay button outside the form (form=id)", () =>
  page(`<form id="checkout"><input name="email"></form><button type="submit" form="checkout">Place order</button>`, async (d) => {
    await d.page.locator("input[name=email]").focus();
    assert.equal((await d.guard(enter))?.kind, "payment");
  }));

test("Enter on a payment page with no form counts as payment", () =>
  page(`<input name="email"><input autocomplete="cc-number"><div role="button" onclick="order()">Place order</div>`, async (d) => {
    await d.page.locator("input[name=email]").focus();
    assert.equal((await d.guard(enter))?.kind, "payment");
  }));

test("Enter in a discount field on a payment page with no form is allowed", () =>
  page(`<input name="discount" placeholder="Discount code"><input autocomplete="cc-number">`, async (d) => {
    await d.page.locator("input[name=discount]").focus();
    assert.equal(await d.guard(enter), null);
  }));

test("Enter in a form whose default button applies a code is allowed", () =>
  page(`<form><input name="email"><button>Apply</button></form><button type="submit" form="other">Place order</button><input autocomplete="cc-number">`, async (d) => {
    await d.page.locator("input[name=email]").focus();
    assert.equal(await d.guard(enter), null);
  }));
