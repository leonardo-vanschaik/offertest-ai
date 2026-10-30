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

test("Enter on a payment page whose form button says only Submit asks first", () =>
  page(`<form action="/custom-order"><input name="email"><input autocomplete="cc-number"><button>Submit</button></form>`, async (d) => {
    await d.page.locator("input[name=email]").focus();
    assert.equal((await d.guard(enter))?.kind, "payment");
  }));

test("Enter in a plain Submit form off the payment page is allowed", () =>
  page(`<form><input name="email"><button>Submit</button></form>`, async (d) => {
    await d.page.locator("input[name=email]").focus();
    assert.equal(await d.guard(enter), null);
  }));

// Where a button is on the page, for a click action.
async function at(d: Driver, sel: string): Promise<ComputerAction> {
  const b = (await d.page.locator(sel).boundingBox())!;
  return { type: "click", x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), button: "left" };
}

test("clicking or pressing a plain Submit button on a payment page asks first", () =>
  page(`<form action="/custom-order"><input autocomplete="cc-number"><button id="s">Submit</button></form>`, async (d) => {
    assert.equal((await d.guard(await at(d, "#s")))?.kind, "payment");
    await d.page.locator("#s").focus();
    assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "payment");
    assert.equal((await d.guard(enter))?.kind, "payment");
  }));

test("next-step and apply buttons on a payment page need no approval", () =>
  page(
    `<form><input autocomplete="cc-number"><button id="c">Continue to shipping</button></form><form><input name="code"><button id="a">Apply</button></form>`,
    async (d) => {
      assert.equal(await d.guard(await at(d, "#c")), null);
      assert.equal(await d.guard(await at(d, "#a")), null);
    },
  ));

// --no-submit: the guard blocks form submits that send data, but still lets codes be applied.
async function noSubmitPage(html: string, fn: (d: Driver) => Promise<void>) {
  const d = new Driver();
  await d.start("about:blank", { allowSubmit: false });
  try {
    await d.page.setContent(html);
    await fn(d);
  } finally {
    await d.close();
  }
}

test("--no-submit blocks sending a lead form by click or Enter, but not applying a code", () =>
  noSubmitPage(`<form><input name="email"><button id="s">Get the free guide</button></form><form><input name="code"><button id="a">Apply</button></form>`, async (d) => {
    assert.equal((await d.guard(await at(d, "#s")))?.kind, "submit");
    await d.page.locator("input[name=email]").focus();
    assert.equal((await d.guard(enter))?.kind, "submit");
    assert.equal(await d.guard(await at(d, "#a")), null);
    await d.page.locator("input[name=code]").focus();
    assert.equal(await d.guard(enter), null);
  }));
