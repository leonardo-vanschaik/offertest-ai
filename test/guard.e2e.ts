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

test("a drag that starts or ends on a pay button counts as a click on it", () =>
  page(`<form action="/custom-order"><input autocomplete="cc-number"><button id="s">Place order</button></form><p id="far">text</p>`, async (d) => {
    const s = (await at(d, "#s")) as { x: number; y: number };
    const far = (await at(d, "#far")) as { x: number; y: number };
    assert.equal((await d.guard({ type: "drag", path: [s, s] }))?.kind, "payment", "zero-distance drag");
    assert.equal((await d.guard({ type: "drag", path: [far, s] }))?.kind, "payment", "drag that ends on the button");
    assert.equal(await d.guard({ type: "drag", path: [far, far] }), null, "a drag on plain text");
  }));

test("Enter or Space on a pay button inside an embedded payment form asks first", () =>
  page(
    `<iframe srcdoc='<form action="/custom-order"><input autocomplete="cc-number"><button id="p">Place order</button> <button id="u">Submit</button></form>' width="500" height="200"></iframe>`,
    async (d) => {
      const frame = d.page.frameLocator("iframe");
      await frame.locator("#p").focus();
      assert.equal((await d.guard(enter))?.kind, "payment");
      assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "payment");
      await frame.locator("#u").focus();
      assert.equal((await d.guard(enter))?.kind, "payment", "a plain Submit next to a card field in the frame");
    },
  ));

test("next-step and apply buttons on a payment page need no approval", () =>
  page(
    `<form><input autocomplete="cc-number"><button id="c">Continue to shipping</button></form><form><input name="code"><button id="a">Apply</button></form>`,
    async (d) => {
      assert.equal(await d.guard(await at(d, "#c")), null);
      assert.equal(await d.guard(await at(d, "#a")), null);
    },
  ));

test("on a payment page, a script button that finishes the order asks first, by click, Enter, or Space", () =>
  page(
    `<input autocomplete="cc-number"><button type="button" id="b" onclick="fetch('/api/orders',{method:'POST'})">Buy now</button>
<div role="button" tabindex="0" id="c">Complete checkout</div><button type="button" id="s">Show order summary</button>
<button type="button" id="q" aria-label="Increase quantity">+</button><button type="button" id="r">Continue to payment</button>`,
    async (d) => {
      assert.equal((await d.guard(await at(d, "#b")))?.kind, "payment", "click Buy now");
      await d.page.locator("#b").focus();
      assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "payment", "Space on Buy now");
      assert.equal((await d.guard(enter))?.kind, "payment", "Enter on Buy now");
      assert.equal((await d.guard(await at(d, "#c")))?.kind, "payment", "a div button");
      assert.equal(await d.guard(await at(d, "#s")), null, "a summary toggle");
      assert.equal(await d.guard(await at(d, "#q")), null, "a quantity button");
      assert.equal(await d.guard(await at(d, "#r")), null, "a next-step button");
    },
  ));

test("off the payment page, a script Buy now button is free", () =>
  page(`<button type="button" id="b">Buy it now</button>`, async (d) => {
    assert.equal(await d.guard(await at(d, "#b")), null);
    await d.page.locator("#b").focus();
    assert.equal(await d.guard({ type: "keypress", keys: ["space"] }), null);
  }));

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

test("--no-submit blocks a form with customer details even when its button says Continue, but not a code or a cart step", () =>
  noSubmitPage(
    `<form method="post" action="/lead"><input name="email" id="e"><button id="c">Continue</button></form>
<form><input name="qty" value="1"><button id="n">Continue</button></form>
<form><input type="email" name="contact"><input name="code" id="k"><button id="a">Apply</button></form>`,
    async (d) => {
      assert.equal((await d.guard(await at(d, "#c")))?.kind, "submit", "Continue on a lead form");
      await d.page.locator("#e").focus();
      assert.equal((await d.guard(enter))?.kind, "submit", "Enter in the email field");
      const drag = (await at(d, "#c")) as { x: number; y: number };
      assert.equal((await d.guard({ type: "drag", path: [drag, drag] }))?.kind, "submit", "a drag on Continue");
      assert.equal(await d.guard(await at(d, "#n")), null, "a step with no customer details");
      assert.equal(await d.guard(await at(d, "#a")), null, "applying a code");
      await d.page.locator("#k").focus();
      assert.equal(await d.guard(enter), null, "Enter in the code field");
    },
  ));

test("--no-submit blocks a script-driven Continue button on a form with customer details, by click, Enter, or Space", () =>
  noSubmitPage(
    `<form><input name="email" value="test@offertest.ai"><button type="button" id="c" onclick="fetch('/lead',{method:'POST'})">Continue</button>
<button type="button" id="q">+</button><button type="button" id="a">Apply</button></form>
<form><input name="qty"><button type="button" id="n">Continue</button></form>`,
    async (d) => {
      assert.equal((await d.guard(await at(d, "#c")))?.kind, "submit", "click");
      await d.page.locator("#c").focus();
      assert.equal((await d.guard(enter))?.kind, "submit", "Enter on the focused button");
      assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "submit", "Space on the focused button");
      assert.equal(await d.guard(await at(d, "#q")), null, "a quantity button sends nothing");
      assert.equal(await d.guard(await at(d, "#a")), null, "applying a code");
      assert.equal(await d.guard(await at(d, "#n")), null, "Continue on a form with no customer details");
    },
  ));

test("--no-submit: a Continue link to a spot on the page acts as a button on a form with customer details", () =>
  noSubmitPage(
    `<form><input name="email" value="test@offertest.ai"><button id="a">Apply</button>
<a href="#next" role="button" id="c" onclick="fetch('/lead',{method:'POST'});return false">Continue</a></form>`,
    async (d) => {
      assert.equal((await d.guard(await at(d, "#c")))?.kind, "submit", "click");
      await d.page.locator("#c").focus();
      assert.equal((await d.guard(enter))?.kind, "submit", "Enter on the focused link");
      assert.equal((await d.guard({ type: "keypress", keys: ["space"] }))?.kind, "submit", "Space on the focused link");
    },
  ));

test("--no-submit: a Continue link to another page on a form with customer details may open it, but its script cannot send", async () => {
  const posts: string[] = [];
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") posts.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<form><input name="email" value="test@offertest.ai"><a href="/step2" id="c" onclick="event.preventDefault(); fetch('/lead',{method:'POST'})">Continue</a></form>`);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const d = new Driver();
  await d.start(`http://127.0.0.1:${(srv.address() as { port: number }).port}/`, { allowSubmit: false });
  try {
    const click = await at(d, "#c");
    assert.equal(await d.guard(click), null, "opening a page is allowed");
    await d.execute(click);
    await d.page.waitForTimeout(400);
    assert.deepEqual(posts, []);
  } finally {
    await d.close();
    srv.close();
  }
});

test("without --no-submit, a script-driven Continue button is allowed", () =>
  page(`<form><input name="email"><button type="button" id="c">Continue</button></form>`, async (d) => {
    assert.equal(await d.guard(await at(d, "#c")), null);
  }));

test("with --pay, an order request a checkout sends by itself is blocked until a payment is approved", async () => {
  const posts: string[] = [];
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") posts.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    // A checkout that confirms the order on a timer, with no click.
    res.end(`<input autocomplete="cc-number" value="4242424242424242"><script>setTimeout(() => fetch('/wc/store/v1/checkout', { method: 'POST' }), 200)</script>`);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/`;
  const d = new Driver();
  await d.start(url, { allowPayment: true });
  const send = () => d.page.evaluate(() => fetch("/wc/store/v1/checkout", { method: "POST" }).then(() => true, () => false));
  try {
    await d.page.waitForTimeout(800);
    assert.deepEqual(posts, [], "the timed order request did not reach the store");
    assert.ok(d.blockedRequests.some((u) => u.endsWith("/wc/store/v1/checkout")));
    d.approvePayment();
    assert.equal(await send(), true);
    assert.deepEqual(posts, ["/wc/store/v1/checkout"], "after approval, the order request goes through");
    d.endPayment();
    assert.equal(await send(), false, "the window closes after the approved action");
    assert.equal(posts.length, 1);
  } finally {
    await d.close();
    srv.close();
  }
});

test("without --pay, approval cannot open the payment window", async () => {
  const d = new Driver();
  await d.start("about:blank");
  try {
    d.approvePayment();
    // Serve the page; every other request goes on to the driver's own route (the payment block).
    await d.page.route("**/*", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 200, body: "<p>store</p>", contentType: "text/html" }) : r.fallback()));
    await d.page.goto("http://shop.test/");
    const ok = await d.page.evaluate(() => fetch("/wc/store/v1/checkout", { method: "POST" }).then(() => true, () => false));
    assert.equal(ok, false);
  } finally {
    await d.close();
  }
});

test("without --pay, a custom checkout's own order request never reaches the store", async () => {
  const posts: string[] = [];
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") posts.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<input autocomplete="cc-number">`);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const d = new Driver();
  await d.start(`http://127.0.0.1:${(srv.address() as { port: number }).port}/checkout`);
  const send = (path: string) => d.page.evaluate((p) => fetch(p, { method: "POST" }).then(() => true, () => false), path);
  try {
    assert.equal(await send("/api/orders"), false, "POST /api/orders");
    assert.equal(await send("/payments/confirm"), false, "POST /payments/confirm");
    assert.equal(await send("/cart/discount"), true, "applying a code still works");
    assert.deepEqual(posts, ["/cart/discount"]);
  } finally {
    await d.close();
    srv.close();
  }
});

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
    // A Subscribe link that opens a new tab: the new tab may shop, the opener's late send is blocked.
    const tab = await at(d, "#t");
    assert.equal(await d.guard(tab), null);
    await d.execute(tab);
    assert.notEqual(d.page.url(), "about:blank");
    await d.execute(await at(d, "#k"));
    await d.page.waitForTimeout(2000);
    assert.deepEqual(site.posts, ["/cart"]);
    site.posts.length = 0;
    await d.page.close();
    d.page = d.page.context().pages()[0];
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
<a href="/" target="_blank" id="t" onclick="setTimeout(() => fetch('/signup',{method:'POST'}), 1500)">Subscribe in a new tab</a>
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
