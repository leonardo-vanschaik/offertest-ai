// Payment guard on small inline pages. No demo store needed. Run: node --import tsx --test test/guard.e2e.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
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

test("--no-submit also blocks Sign up, Subscribe, and Join, which send customer data", () =>
  noSubmitPage(
    `<form><input name="email"><button id="u">Sign up</button></form><form><input name="e2"><button id="s">Subscribe</button></form><form><input name="e3"><button id="j">Join now</button></form><form><input name="q"><button id="c">Continue</button></form>`,
    async (d) => {
      for (const id of ["#u", "#s", "#j"]) assert.equal((await d.guard(await at(d, id)))?.kind, "submit", id);
      await d.page.locator("input[name=e2]").focus();
      assert.equal((await d.guard(enter))?.kind, "submit");
      assert.equal(await d.guard(await at(d, "#c")), null, "moving to the next step is allowed");
    },
  ));

test("--no-submit blocks script-driven sign-up buttons, and no sign-up request leaves the browser", async () => {
  const site = await sendsSite();
  const d = new Driver();
  await d.start(`${site.url}/`, { allowSubmit: false });
  try {
    for (const id of ["#b", "#r", "#a", "#i"]) assert.equal((await d.guard(await at(d, id)))?.kind, "submit", id);
    await d.page.locator("#b").focus();
    assert.equal((await d.guard(enter))?.kind, "submit", "Enter on the focused button");
    assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "submit", "Space on the focused button");
    // Still allowed: a script button that adds to cart, and one that opens the next view.
    for (const id of ["#c", "#g"]) assert.equal(await d.guard(await at(d, id)), null, id);
    // Run every click the way the funnel does (only what the guard lets through): nothing is sent.
    for (const id of ["#b", "#r", "#a", "#i", "#c", "#g"]) {
      const click = await at(d, id);
      if (!(await d.guard(click))) await d.execute(click);
    }
    await d.page.waitForTimeout(300);
    assert.deepEqual(site.posts, []);
    // A link to the trial page only opens it.
    assert.equal(await d.guard(await at(d, "#l")), null);
  } finally {
    await d.close();
    site.close();
  }
});

test("--no-submit: a Subscribe link may open its page, but its script cannot send anything", async () => {
  const site = await sendsSite();
  const d = new Driver();
  await d.start(`${site.url}/`, { allowSubmit: false });
  try {
    for (const id of ["#s", "#p"]) {
      const click = await at(d, id);
      assert.equal(await d.guard(click), null, `${id}: opening a page is allowed`);
      await d.execute(click);
      await d.page.waitForTimeout(300);
      await d.page.goto(`${site.url}/`);
    }
    // A handler that waits before it sends is blocked too: the block lasts until a new page loads.
    const late = await at(d, "#d");
    assert.equal(await d.guard(late), null);
    await d.execute(late);
    await d.page.waitForTimeout(4000);
    assert.deepEqual(site.posts, []);
    // A new page lifts the block: shopping that posts (add to cart) still works.
    await d.page.goto(`${site.url}/`);
    await d.execute(await at(d, "#k"));
    await d.page.waitForTimeout(300);
    assert.deepEqual(site.posts, ["/cart"]);
    site.posts.length = 0;
    // The same by keyboard.
    await d.page.locator("#s").focus();
    const enterKey: ComputerAction = { type: "keypress", keys: ["Enter"] };
    assert.equal(await d.guard(enterKey), null);
    await d.execute(enterKey);
    await d.page.waitForTimeout(300);
    assert.deepEqual(site.posts, []);
    assert.ok(d.blockedRequests.some((u) => u.endsWith("/signup")));
  } finally {
    await d.close();
    site.close();
  }
});

test("without --no-submit, script-driven sign-up buttons are allowed", () =>
  page(`<button type="button" id="b" onclick="fetch('/signup',{method:'POST'})">Sign up</button>`, async (d) => {
    assert.equal(await d.guard(await at(d, "#b")), null);
  }));

// A page whose sign-up buttons send with fetch() instead of a form, served over http so a request would show.
async function sendsSite() {
  const posts: string[] = [];
  const html = `<input id="email" value="test@offertest.ai">
<button type="button" id="b" onclick="fetch('/signup',{method:'POST'})">Sign up</button>
<div role="button" id="r" onclick="fetch('/signup',{method:'POST'})">Subscribe</div>
<a href="#" id="a" onclick="fetch('/lead',{method:'POST'})">Claim your guide</a>
<input type="button" id="i" value="Start free trial" onclick="fetch('/trial',{method:'POST'})">
<a href="/trial" id="l">Start free trial</a>
<a href="/subscribe" id="s" onclick="fetch('/signup',{method:'POST',keepalive:true})">Subscribe</a>
<a href="/subscribe" id="p" onclick="event.preventDefault(); fetch('/signup',{method:'POST'})">Subscribe now</a>
<a href="/subscribe" id="d" onclick="event.preventDefault(); setTimeout(() => fetch('/signup',{method:'POST'}), 3500)">Join the club</a>
<button type="button" id="k" onclick="fetch('/cart',{method:'POST'})">Add to bag</button>
<button type="button" id="c">Add to cart</button>
<button type="button" id="g">Get 20% off</button>`;
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") posts.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, posts, close: () => srv.close() };
}

test("--no-submit sees a form inside an embedded frame: Enter and Space there are blocked", () =>
  noSubmitPage(
    `<h1>Get the guide</h1><iframe srcdoc='<form action="/lead" method="post"><input name="email"><button id="g">Get the guide</button></form>' width="400" height="200"></iframe>`,
    async (d) => {
      const frame = d.page.frameLocator("iframe");
      await frame.locator("input[name=email]").focus();
      assert.equal((await d.guard(enter))?.kind, "submit");
      await frame.locator("#g").focus();
      assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "submit");
      assert.equal((await d.guard(await at(d, "iframe")))?.kind, undefined, "a click on the frame's empty area is not a submit");
    },
  ));
