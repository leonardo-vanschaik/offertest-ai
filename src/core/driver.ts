import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { ComputerAction } from "../types.ts";

export const DESKTOP = { width: 1280, height: 800 };
// Meta ads mostly open in the in-app browser on a phone.
export const MOBILE = { width: 390, height: 844 };
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0;FBBV/1;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]";

const KEY_MAP: Record<string, string> = {
  ENTER: "Enter", RETURN: "Enter", TAB: "Tab", ESC: "Escape", ESCAPE: "Escape", BACKSPACE: "Backspace",
  DELETE: "Delete", SPACE: " ", UP: "ArrowUp", DOWN: "ArrowDown", LEFT: "ArrowLeft", RIGHT: "ArrowRight",
  ARROWUP: "ArrowUp", ARROWDOWN: "ArrowDown", ARROWLEFT: "ArrowLeft", ARROWRIGHT: "ArrowRight",
  PAGEUP: "PageUp", PAGEDOWN: "PageDown", HOME: "Home", END: "End", CTRL: "Control", CONTROL: "Control",
  CMD: "Meta", META: "Meta", SUPER: "Meta", ALT: "Alt", OPTION: "Alt", SHIFT: "Shift",
};
const key = (k: string) => KEY_MAP[k.toUpperCase()] ?? (k.length === 1 ? k : k[0].toUpperCase() + k.slice(1));

// Buttons that spend money. Checked in the live DOM, so the model cannot talk past it.
const PAY_TEXT =
  /^\s*(place (my )?order|pay( now| \$?[\d.,]+)?|complete (my )?(order|purchase|payment)|confirm (and pay|order|purchase|payment)|submit (order|payment)|buy now and pay|purchase|order now and pay|finalizar compra|pagar( ahora)?|commander|payer|jetzt kaufen|zahlungspflichtig bestellen)\s*$/i;
const PAY_IDS = ["#checkout-pay-button", "#place_order", "#submit-button", "[data-requires-approval]"];
// Default buttons that clearly do not place an order: Enter on their form needs no approval.
const SAFE_SUBMIT = /^(apply|redeem|use code|search|go|subscribe|sign ?up|join|log ?in|sign ?in|update|calculate|check|validate|save)\b/;

// Order-submit requests on common platforms. Aborted when the run does not allow payment.
const ORDER_SUBMIT = [
  /\/graphql.*SubmitForCompletion/i, // Shopify checkout
  /checkout\.pci\.shopifyinc\.com\/sessions/i,
  /\/wc\/store\/v1\/checkout(\?|$)/i, // WooCommerce block checkout
  /[?&]wc-ajax=checkout/i, // WooCommerce classic checkout
  /\/internalapi\/v1\/checkout\/order/i, // BigCommerce
  /api\.stripe\.com\/v1\/payment_intents\/[^/]+\/confirm/i,
  /api\.stripe\.com\/v1\/payment_pages\/[^/]+\/confirm/i, // Stripe Checkout
  /paypal\.com\/.*\/(capture|authorize)/i,
];

export type Guard = { kind: "payment"; label: string } | null;

export class Driver {
  private browser?: Browser;
  private context?: BrowserContext;
  page!: Page;
  viewport = DESKTOP;
  allowPayment = false;
  blockedRequests: string[] = [];
  downloads: string[] = []; // a download leaves the page unchanged, so the agent would not see it

  async start(url: string, opts: { headful?: boolean; mobile?: boolean; allowPayment?: boolean } = {}) {
    this.allowPayment = !!opts.allowPayment;
    this.viewport = opts.mobile ? MOBILE : DESKTOP;
    this.browser = await launch(!opts.headful);
    // A fresh browser with no cookies: every run is a new customer.
    this.context = await this.browser.newContext({
      viewport: this.viewport,
      deviceScaleFactor: 1,
      acceptDownloads: true,
      serviceWorkers: "block", // so route() sees every request
      ...(opts.mobile ? { userAgent: MOBILE_UA, isMobile: true, hasTouch: true } : {}),
    });
    await this.context.route("**/*", (route) => {
      const req = route.request();
      if (!this.allowPayment && req.method() !== "GET" && ORDER_SUBMIT.some((re) => re.test(req.url()))) {
        this.blockedRequests.push(req.url());
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    // Payment popups (PayPal, Shop Pay, wallets) are closed unless payment is allowed.
    this.context.on("page", async (p) => {
      if (!this.allowPayment && /paypal|shop\.app|pay\.google|apple\.com\/apple-pay|klarna|afterpay/i.test(p.url() || "")) await p.close();
    });
    this.context.on("page", (p) => this.watchDownloads(p));
    this.page = await this.context.newPage();
    this.watchDownloads(this.page);
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await this.settle();
    await this.dismissOverlays();
  }

  private watchDownloads(p: Page) {
    p.on("download", async (d) => {
      const file = await d.path().catch(() => null);
      const size = file ? (await import("node:fs")).statSync(file).size : 0;
      const failure = await d.failure().catch(() => "unknown");
      this.downloads.push(
        failure ? `Download failed: ${d.suggestedFilename()} (${failure})` : `Downloaded file: ${d.suggestedFilename()} (${(size / 1024).toFixed(1)} KB) from ${d.url()}`,
      );
    });
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }

  url(): string {
    return this.page.url();
  }

  async screenshot(): Promise<Buffer> {
    return await this.page.screenshot({ type: "jpeg", quality: 85 });
  }

  // Visible text plus an accessibility snapshot, so quotes split across elements still match.
  async text(): Promise<string> {
    const inner = await this.page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const aria = await this.page.locator("body").ariaSnapshot({ timeout: 3000 }).catch(() => "");
    const dl = this.downloads.length ? `\n\n[browser downloads]\n${this.downloads.join("\n")}` : "";
    return (aria ? `${inner}\n\n[accessibility snapshot]\n${aria}` : inner) + dl;
  }

  // Bot walls and gates the agent cannot pass. Reported, not solved.
  async blockedReason(): Promise<string | null> {
    const t = (await this.page.evaluate(() => `${document.title}\n${document.body?.innerText?.slice(0, 3000) ?? ""}`).catch(() => "")).toLowerCase();
    const frames = this.page.frames().map((f) => f.url()).join(" ");
    if (/challenges\.cloudflare\.com|turnstile|hcaptcha\.com|recaptcha/.test(frames) && /verify you are human|checking your browser|are you a robot|captcha/.test(t))
      return "Bot check (captcha) on the page";
    if (/just a moment|checking your browser|attention required/.test(t) && /cloudflare/.test(t)) return "Cloudflare bot check";
    if (/access denied/.test(t) && /reference #/.test(t)) return "Akamai bot block";
    if (/\/password(\?|$)/.test(this.url()) || /enter store using password|this store is password protected/.test(t)) return "Store is password protected";
    return null;
  }

  // Cookie banners and email popups hide the page. Close the common ones before the agent looks.
  async dismissOverlays() {
    const labels = /^(accept( all)?( cookies)?|allow all|agree|i agree|got it|ok|close|no,? thanks|not now|maybe later|dismiss|×|x)$/i;
    for (let i = 0; i < 2; i++) {
      const clicked = await this.page
        .evaluate((src) => {
          const re = new RegExp(src, "i");
          const els = Array.from(document.querySelectorAll<HTMLElement>("button, [role=button], a, [aria-label]"));
          for (const el of els) {
            const label = (el.innerText || el.getAttribute("aria-label") || "").trim();
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const inOverlay = !!el.closest("[role=dialog], [aria-modal=true], [id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [class*=popup i], [class*=modal i], [id*=onetrust i], [class*=klaviyo i]");
            if (inOverlay && r.width > 0 && r.height > 0 && style.visibility !== "hidden" && re.test(label)) {
              el.click();
              return true;
            }
          }
          return false;
        }, labels.source)
        .catch(() => false);
      if (!clicked) break;
      await this.page.waitForTimeout(400);
    }
  }

  // Would this action spend money? Checked in the page and its iframes.
  async guard(action: ComputerAction): Promise<Guard> {
    if (action.type === "click" || action.type === "double_click") {
      const hit = await this.payTargetAt(action.x, action.y);
      // A known pay-button id always counts; a "Pay"/"Place order" label counts on a payment page.
      if (hit && (hit.byId || (await this.onPaymentPage()))) return { kind: "payment", label: hit.label };
      return null;
    }
    const submits =
      (action.type === "keypress" && action.keys.some((k) => /^(enter|return)$/i.test(k))) ||
      (action.type === "type" && /[\r\n]/.test(action.text));
    if (submits) {
      // Enter in the discount-code field must work. It only counts as payment when it would press a pay
      // button: the focused button itself, or the default (first) submit button of the focused field's form.
      const label = await this.enterSubmitsPay();
      if (label) return { kind: "payment", label };
    }
    // Space (or typing a space) activates a focused button: check what has focus.
    const activates =
      (action.type === "keypress" && action.keys.some((k) => /^(space| )$/i.test(k))) || (action.type === "type" && action.text.includes(" "));
    if (activates) {
      const focused = await this.focusedPayButton();
      if (focused) return { kind: "payment", label: focused };
    }
    return null;
  }

  private async enterSubmitsPay(): Promise<string | null> {
    const focused = await this.focusedPayButton();
    if (focused) return focused;
    const r = await this.page
      .evaluate(([src, ids, safe]) => {
        const a = document.activeElement as HTMLInputElement | null;
        if (!a || a === document.body || /^(textarea|button)$/i.test(a.tagName)) return { pay: null, known: true };
        const form = a.form ?? a.closest("form");
        // form.elements includes submit buttons outside the form that point at it with form="id".
        const def = form && (Array.from(form.elements).find((el) => (el as HTMLButtonElement).type === "submit") as HTMLElement | undefined);
        // A discount-code field is safe to submit on Enter.
        const field = [a.name, a.id, a.placeholder, a.getAttribute("aria-label"), a.labels?.[0]?.innerText].join(" ");
        const discountField = /discount|coupon|promo|gift ?card|voucher/i.test(field);
        // Unknown: a script may submit on Enter.
        if (!def) return { pay: null, known: discountField };
        const text = (def.innerText || (def as HTMLInputElement).value || def.getAttribute("aria-label") || "").trim();
        if (ids.some((sel: string) => def.matches(sel)) || new RegExp(src, "i").test(text)) return { pay: text || "Pay", known: true };
        // Only a default button that clearly does something else (apply a code, search, sign up) is known safe.
        // A plain "Submit" on a payment page may place the order.
        return { pay: null, known: discountField || new RegExp(safe, "i").test(text) };
      }, [PAY_TEXT.source, PAY_IDS, SAFE_SUBMIT.source] as [string, string[], string])
      .catch(() => ({ pay: null, known: false }));
    if (r.pay) return r.pay;
    // No default button, no form, or a button that may place the order: on a payment page, ask.
    if (!r.known && (await this.onPaymentPage())) return "Enter on the payment page";
    return null;
  }

  private async focusedPayButton(): Promise<string | null> {
    const label = await this.page
      .evaluate(([src, ids]) => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !/^(button|a|input)$/i.test(a.tagName) && a.getAttribute("role") !== "button") return null;
        const text = (a.innerText || (a as HTMLInputElement).value || a.getAttribute("aria-label") || "").trim();
        return ids.some((sel: string) => a.matches(sel)) || new RegExp(src, "i").test(text) ? text || "Pay" : null;
      }, [PAY_TEXT.source, PAY_IDS] as [string, string[]])
      .catch(() => null);
    // Focus inside a payment iframe (wallet or card frame) also counts.
    if (!label && this.page.frames().some((f) => /paypal|shop\.app|pay\.google|apple-pay/i.test(f.url()))) {
      const inFrame = await this.page.evaluate(() => document.activeElement?.tagName === "IFRAME").catch(() => false);
      if (inFrame) return "Express pay button";
    }
    return label;
  }

  private async payTargetAt(x: number, y: number): Promise<{ label: string; byId: boolean } | null> {
    const probe = ([px, py, src, ids]: [number, number, string, string[]]): { label: string; byId: boolean } | null => {
      const re = new RegExp(src, "i");
      let el = document.elementFromPoint(px, py) as HTMLElement | null;
      for (let i = 0; el && i < 6; i++, el = el.parentElement) {
        const label = (el.innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").trim();
        if (ids.some((sel) => el!.matches(sel))) return { label: label || "Pay", byId: true };
        if (/^(button|a|input)$/i.test(el.tagName) || el.getAttribute("role") === "button")
          return re.test(label) ? { label, byId: false } : null;
      }
      return null;
    };
    const top = await this.page.evaluate(probe, [x, y, PAY_TEXT.source, PAY_IDS] as [number, number, string, string[]]).catch(() => null);
    if (top) return top;
    // Clicks that land on a cross-origin iframe (Shop Pay, PayPal, Stripe wallets): probe inside it.
    for (const frame of this.page.frames().slice(1)) {
      const el = await frame.frameElement().catch(() => null);
      const box = await el?.boundingBox().catch(() => null);
      if (!box || x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
      if (/paypal|shop\.app|pay\.google|apple-pay|stripe\.com\/.*(payment-request|wallet)/i.test(frame.url())) return { label: "Express pay button", byId: true };
      const inner = await frame
        .evaluate(probe, [x - box.x, y - box.y, PAY_TEXT.source, PAY_IDS] as [number, number, string, string[]])
        .catch(() => null);
      if (inner) return inner;
    }
    return null;
  }

  async onPaymentPage(): Promise<boolean> {
    if (/checkout|\/checkouts\/|payment|\/pay\b/i.test(this.url())) return true;
    const hasCardField = await this.page
      .evaluate(() => !!document.querySelector('input[autocomplete="cc-number"], input[name*="card" i], [data-requires-approval]'))
      .catch(() => false);
    return hasCardField || this.page.frames().some((f) => /stripe\.com|checkout\.pci\.shopifyinc|braintree|adyen|paypal/i.test(f.url()));
  }

  async execute(action: ComputerAction) {
    const p = this.page;
    switch (action.type) {
      case "click":
        if (action.button === "back") await p.goBack().catch(() => {});
        else if (action.button === "forward") await p.goForward().catch(() => {});
        else await p.mouse.click(action.x, action.y, { button: action.button === "right" ? "right" : action.button === "wheel" ? "middle" : "left" });
        break;
      case "double_click":
        await p.mouse.dblclick(action.x, action.y);
        break;
      case "move":
        await p.mouse.move(action.x, action.y);
        break;
      case "drag": {
        const [first, ...rest] = action.path;
        if (!first) break;
        await p.mouse.move(first.x, first.y);
        await p.mouse.down();
        for (const pt of rest) await p.mouse.move(pt.x, pt.y, { steps: 4 });
        await p.mouse.up();
        break;
      }
      case "scroll":
        await p.mouse.move(action.x, action.y);
        await p.mouse.wheel(action.scroll_x, action.scroll_y);
        break;
      case "type":
        await p.keyboard.type(action.text, { delay: 12 });
        break;
      case "keypress": {
        const keys = action.keys.map(key);
        await p.keyboard.press(keys.length > 1 ? keys.join("+") : keys[0] ?? "");
        break;
      }
      case "wait":
        await p.waitForTimeout(1500);
        break;
      case "screenshot":
        break;
    }
    await this.settle();
  }

  private async settle() {
    // The agent may have opened a new tab (target=_blank): follow it.
    const pages = this.context?.pages() ?? [];
    const newest = pages[pages.length - 1];
    if (newest && newest !== this.page && !newest.isClosed()) this.page = newest;
    await this.page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    await this.page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
    await this.page.waitForTimeout(250);
  }
}

// Prefer the user's installed Chrome; fall back to Playwright's Chromium.
async function launch(headless: boolean): Promise<Browser> {
  const channels = [process.env.OFFERTEST_BROWSER_CHANNEL, "chrome", "msedge", undefined];
  let last: unknown;
  for (const channel of channels) {
    try {
      return await chromium.launch({ headless, ...(channel ? { channel } : {}) });
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`No browser found. Install Chrome, or run: npx offertest install-browser\n${String(last).split("\n")[0]}`);
}

export function describeAction(a: ComputerAction): string {
  switch (a.type) {
    case "click":
      return `Click (${a.x}, ${a.y})`;
    case "double_click":
      return `Double-click (${a.x}, ${a.y})`;
    case "type":
      return `Type "${a.text.length > 40 ? a.text.slice(0, 40) + "…" : a.text}"`;
    case "keypress":
      return `Press ${a.keys.join("+")}`;
    case "scroll":
      return `Scroll ${a.scroll_y > 0 ? "down" : a.scroll_y < 0 ? "up" : "sideways"}`;
    case "move":
      return `Move (${a.x}, ${a.y})`;
    case "drag":
      return "Drag";
    case "wait":
      return "Wait";
    case "screenshot":
      return "Look at the screen";
  }
}
