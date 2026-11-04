import { chromium, type Browser, type BrowserContext, type Frame, type Page, type Request } from "playwright-core";
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
// Form buttons that clearly do not place an order (apply a code, go to the next checkout step). On a payment page
// any other form submit button, such as a plain "Submit", counts as payment: by click, Enter, or Space.
const SAFE_SUBMIT = /^(?!.*\b(pay|order|purchase|buy)\b)(apply|redeem|use code|search|go|subscribe|sign ?up|join|log ?in|sign ?in|update|calculate|check|validate|save|continue|next|review|add|remove|edit|change|close|cancel|back)\b/i;
// With --no-submit, only buttons that send nothing about the customer stay free: applying a code, searching,
// or moving between steps. Sign up, subscribe, join, log in, and save send data, so they are blocked.
const SAFE_STEP = /^(?!.*\b(pay|order|purchase|buy|sign ?up|subscribe|join|register|log ?in|sign ?in|save|send|submit|get|download|claim|book|request|start|confirm)\b)(apply|redeem|use code|search|go|update|calculate|check|validate|continue|next|review|add|remove|edit|change|close|cancel|back)\b/i;
// With --no-submit, a form that holds customer details (an email, a phone, a name, a street address, a
// message) sends them, whatever its button says ("Continue" too). Only a button that applies a code may send it.
const CUSTOMER_FIELD = /e-?mail|phone|mobile|\btel\b|\bname\b|first.?name|last.?name|full.?name|street|address|password|message|comment/i;
const CODE_STEP = /^(apply|redeem|use code)\b/i;
// On a payment page, a script button (no form, not a link) whose words finish the order counts as payment too:
// a custom checkout can send the order from a script ("Buy now", "Complete checkout", "Confirm order"). Steps
// before the order ("Confirm address", "Complete profile"), buttons that only show or hide part of the page
// ("Show order summary"), and next-step buttons (SAFE_SUBMIT) stay free.
const FINISHES =
  /\b(buy( it)? now|order now|pay( now\b|\s*[$€£]|\s+with\b)|(complete|confirm|finish|place|submit)( my| your| the)? (order|purchase|payment|checkout)|confirm and pay|pay and (place|complete))/i;
const VIEW_ONLY = /^(show|hide|view|see|open|close|toggle|more|less)\b/i;
const finishesOrder = (label: string) => FINISHES.test(label) && !SAFE_SUBMIT.test(label) && !VIEW_ONLY.test(label) && !CODE_STEP.test(label);
const sendsForm = (label: string, data: boolean) => !SAFE_STEP.test(label) || (data && !CODE_STEP.test(label));
// A script button (type="button") inside a form with customer details can send them too, when it moves the
// form forward. Buttons that only change the page (quantity, show password, remove) stay free.
const FORWARD = /\b(continue|next|review|proceed|done|finish|go|ok)\b/i;
// A script-driven button (no form) can send data too. With --no-submit, one whose words say it sends is blocked.
// Narrower than SAFE_STEP: "Get 20% off" or "Start shopping" on a script button only opens the next view.
const SENDS =
  /\b(sign ?up|subscribe|join|register|create (an |my |your )?account|send|submit|download|claim|book|reserve|request|start (my |a |your )?(free )?trial|confirm|rsvp|enrol+|apply now|notify me|log ?in|sign ?in|get (my|the|your) (free )?(guide|e-?book|copy|download|quote|offer|code|access|trial|demo))\b/i;

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
  // A custom checkout's own order or payment endpoint (POST /api/orders, /payments/confirm).
  /\/(orders?|payments?|purchases?|charges?)(\/(create|submit|complete|confirm|place))?\/?(\?|$)/i,
];

// payment: would spend money. submit: would send a form (sign-up, lead) when the run forbids it (--no-submit).
export type Guard = { kind: "payment" | "submit"; label: string } | null;
type Target = { label: string; byId: boolean; pay: boolean; form: boolean; data: boolean; link: boolean };

export class Driver {
  private browser?: Browser;
  private context?: BrowserContext;
  page!: Page;
  viewport = DESKTOP;
  allowPayment = false; // this run may pay (--pay); each payment still needs approval
  private paymentApproved = false; // set for the approved pay action only (approvePayment / endPayment)
  allowSubmit = true;
  blockedRequests: string[] = [];
  // --no-submit: a link whose words say it sends (Subscribe) may open its page, but its scripts must not
  // POST anything. Activating one blocks every non-GET request from that tab until a new document loads
  // there, so a handler that prevents navigation or sends later is blocked too. A tab it opens is not blocked.
  private sendLinks = new WeakSet<ComputerAction>();
  private sendBlocked = new WeakSet<Page>();
  downloads: string[] = []; // a download leaves the page unchanged, so the agent would not see it

  async start(url: string, opts: { headful?: boolean; mobile?: boolean; allowPayment?: boolean; allowSubmit?: boolean } = {}) {
    this.allowPayment = !!opts.allowPayment;
    this.allowSubmit = opts.allowSubmit !== false;
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
      // Order-submit requests pass only while an approved payment runs, so a checkout script that confirms
      // the order by itself (on a timer, or after the card fields fill) cannot pay before you approve.
      if (!this.paying() && req.method() !== "GET" && ORDER_SUBMIT.some((re) => re.test(req.url()))) {
        this.blockedRequests.push(req.url());
        return route.abort("blockedbyclient");
      }
      if (!this.allowSubmit && req.method() !== "GET" && this.sendBlocked.has(pageOf(req))) {
        this.blockedRequests.push(req.url());
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    // Payment popups (PayPal, Shop Pay, wallets) are closed unless payment is allowed.
    this.context.on("page", async (p) => {
      if (!this.paying() && /paypal|shop\.app|pay\.google|apple\.com\/apple-pay|klarna|afterpay/i.test(p.url() || "")) await p.close();
    });
    this.context.on("page", (p) => this.watchPage(p));
    this.page = await this.context.newPage();
    this.watchPage(this.page);
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await this.settle();
    await this.dismissOverlays();
  }

  // Open the payment window for one approved action (the funnel asks you first); endPayment closes it.
  approvePayment() {
    this.paymentApproved = this.allowPayment;
  }

  endPayment() {
    this.paymentApproved = false;
  }

  private paying(): boolean {
    return this.allowPayment && this.paymentApproved;
  }

  private watchPage(p: Page) {
    this.watchDownloads(p);
    p.on("domcontentloaded", () => this.sendBlocked.delete(p)); // a new document: the old page's scripts are gone
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
    // A drag presses the mouse at its start and lets go at its end. On one button, that is a click.
    if (action.type === "drag") {
      for (const pt of [action.path[0], action.path[action.path.length - 1]]) {
        if (!pt) continue;
        const click: ComputerAction = { type: "click", button: "left", x: pt.x, y: pt.y };
        const g = await this.guard(click);
        if (g) return g;
        if (this.sendLinks.has(click)) this.sendLinks.add(action);
      }
      return null;
    }
    if (action.type === "click" || action.type === "double_click") {
      const hit = await this.payTargetAt(action.x, action.y);
      // A known pay-button id always counts. On a payment page, a "Pay"/"Place order" label, an unknown form submit
      // button, or a script button that finishes the order counts.
      if (!hit) return null;
      if (hit.byId) return { kind: "payment", label: hit.label };
      const finishes = hit.pay || (hit.form ? !SAFE_SUBMIT.test(hit.label) : !hit.link && finishesOrder(hit.label));
      if (finishes && (await this.onPaymentPage())) return { kind: "payment", label: hit.label || "Submit" };
      // --no-submit: a form submit button that does more than apply a code or move to the next step, any button
      // but "Apply" on a form with customer details, or a script button that says it sends or moves such a form
      // forward. A link to another page may open, but its scripts cannot send (see execute).
      const sends = SENDS.test(hit.label) || (hit.data && FORWARD.test(hit.label) && !CODE_STEP.test(hit.label));
      if (!this.allowSubmit && !hit.pay && (hit.form ? sendsForm(hit.label, hit.data) : !hit.link && sends)) return { kind: "submit", label: hit.label || "Submit" };
      if (!this.allowSubmit && hit.link && sends) this.sendLinks.add(action);
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
      if (!this.allowSubmit) {
        const form = (await this.enterSubmitsForm()) ?? (await this.focusedSend(action));
        if (form) return { kind: "submit", label: form };
      }
    }
    // Space (or typing a space) activates a focused button: check what has focus.
    const activates =
      (action.type === "keypress" && action.keys.some((k) => /^(space| )$/i.test(k))) || (action.type === "type" && action.text.includes(" "));
    if (activates) {
      const focused = await this.focusedPayButton();
      if (focused) return { kind: "payment", label: focused };
      if (!this.allowSubmit) {
        const form = (await this.enterSubmitsForm(true)) ?? (await this.focusedSend(action));
        if (form) return { kind: "submit", label: form };
      }
    }
    return null;
  }

  // A focused script button (not a form submit) whose words say it sends, or that moves a form with customer
  // details forward: its label, to block it. A focused link to another page with such words may open, but arms
  // the send block (see execute).
  private async focusedSend(action: ComputerAction): Promise<string | null> {
    const hit = await (await this.focusedFrame())
      .evaluate(
        ([src, forward, code, customer]) => {
          const a = document.activeElement as HTMLInputElement | null;
          if (!a || a === document.body) return null;
          const button = /^(button|input)$/i.test(a.tagName) || a.getAttribute("role") === "button" || a.tagName === "A";
          if (!button || (/^(submit|image)$/.test(a.type) && a.form)) return null;
          const href = a.tagName === "A" ? (a.getAttribute("href") ?? "") : "";
          const link = !!href && !href.startsWith("#") && !/^javascript:/i.test(href);
          const label = (a.innerText || a.value || a.getAttribute("aria-label") || "").trim();
          if (new RegExp(src, "i").test(label)) return { label, link };
          const owner = a.form ?? a.closest("form");
          const data =
            !!owner &&
            Array.from(owner.elements).some((f) => {
              const i = f as HTMLInputElement;
              return /^(email|tel|password)$/i.test(i.type) || new RegExp(customer, "i").test([i.name, i.id, i.getAttribute("autocomplete"), i.placeholder].join(" "));
            });
          return data && new RegExp(forward, "i").test(label) && !new RegExp(code, "i").test(label) ? { label, link } : null;
        },
        [SENDS.source, FORWARD.source, CODE_STEP.source, CUSTOMER_FIELD.source] as [string, string, string, string],
      )
      .catch(() => null);
    if (hit?.link) this.sendLinks.add(action);
    return hit && !hit.link ? hit.label : null;
  }

  // The frame that holds the focused control: focus inside an embedded form (an iframe) belongs to that frame.
  private async focusedFrame(): Promise<Frame> {
    let frame: Frame = this.page.mainFrame();
    for (let depth = 0; depth < 5; depth++) {
      const el = (await frame.evaluateHandle(() => document.activeElement).catch(() => null))?.asElement();
      const tag = el ? await el.evaluate((e) => e.tagName).catch(() => "") : "";
      if (tag !== "IFRAME" && tag !== "FRAME") return frame;
      const child = await el!.contentFrame().catch(() => null);
      if (!child) return frame;
      frame = child;
    }
    return frame;
  }

  // Would Enter (or Space on a focused button) send the focused form? Applying a code or a search does not count.
  private async enterSubmitsForm(buttonOnly = false): Promise<string | null> {
    const frame = await this.focusedFrame();
    return frame
      .evaluate(
        ([safe, buttonOnly, customer, code]) => {
          const a = document.activeElement as HTMLInputElement | null;
          if (!a || a === document.body || a.tagName === "TEXTAREA") return null;
          const isButton = /^(submit|image)$/.test(a.type) && /^(button|input)$/i.test(a.tagName);
          if (buttonOnly && !isButton) return null;
          const form = a.form ?? a.closest("form");
          if (!form) return null;
          const def = isButton ? (a as HTMLElement) : (Array.from(form.elements).find((el) => (el as HTMLButtonElement).type === "submit") as HTMLElement | undefined);
          const text = (def?.innerText || (def as HTMLInputElement | undefined)?.value || def?.getAttribute("aria-label") || "").trim();
          const field = [a.name, a.id, a.placeholder, a.getAttribute("aria-label")].join(" ");
          if (/discount|coupon|promo|gift ?card|voucher|search/i.test(field)) return null;
          const data = Array.from(form.elements).some((f) => {
            const i = f as HTMLInputElement;
            return /^(email|tel|password)$/i.test(i.type) || new RegExp(customer, "i").test([i.name, i.id, i.getAttribute("autocomplete"), i.placeholder].join(" "));
          });
          if (new RegExp(safe, "i").test(text) && !(data && !new RegExp(code, "i").test(text))) return null;
          return text || "Submit";
        },
        [SAFE_STEP.source, buttonOnly, CUSTOMER_FIELD.source, CODE_STEP.source] as [string, boolean, string, string],
      )
      .catch(() => null);
  }

  private async enterSubmitsPay(): Promise<string | null> {
    const focused = await this.focusedPayButton();
    if (focused) return focused;
    const r = await (await this.focusedFrame())
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

  // The focused button in the frame that holds focus, so a pay button inside an embedded form counts too.
  private async focusedPayButton(): Promise<string | null> {
    const frame = await this.focusedFrame();
    const hit = await frame
      .evaluate(([src, ids]) => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !/^(button|a|input)$/i.test(a.tagName) && a.getAttribute("role") !== "button") return null;
        const text = (a.innerText || (a as HTMLInputElement).value || a.getAttribute("aria-label") || "").trim();
        if (ids.some((sel: string) => a.matches(sel)) || new RegExp(src, "i").test(text)) return { label: text || "Pay", pay: true };
        const b = a as HTMLInputElement;
        if (/^(submit|image)$/.test(b.type) && b.form) return { label: text, pay: false, form: true };
        const href = a.tagName === "A" ? (a.getAttribute("href") ?? "") : "";
        const link = !!href && !href.startsWith("#") && !/^javascript:/i.test(href);
        return link || (b.tagName === "INPUT" && !/^(button|reset)$/.test(b.type)) ? null : { label: text, pay: false, form: false };
      }, [PAY_TEXT.source, PAY_IDS] as [string, string[]])
      .catch(() => null);
    // On a payment page, a focused form submit button with an unknown label (such as "Submit"), or a focused
    // script button that finishes the order, counts.
    const unknown = hit && !hit.pay && (hit.form ? !SAFE_SUBMIT.test(hit.label) : finishesOrder(hit.label));
    const label = hit && (hit.pay ? hit.label : unknown && (await this.onPaymentPage()) ? hit.label || "Submit" : null);
    // Focus inside a payment iframe (wallet or card frame) also counts.
    if (!label && /paypal|shop\.app|pay\.google|apple-pay/i.test(frame.url())) return "Express pay button";
    if (!label && this.page.frames().some((f) => /paypal|shop\.app|pay\.google|apple-pay/i.test(f.url()))) {
      const inFrame = await this.page.evaluate(() => document.activeElement?.tagName === "IFRAME").catch(() => false);
      if (inFrame) return "Express pay button";
    }
    return label;
  }

  // The button under (x, y): a pay button by id or label, a form submit button (form), a link to another
  // page (link), or a script-driven button.
  private async payTargetAt(x: number, y: number): Promise<Target | null> {
    const probe = ([px, py, src, ids, customer]: [number, number, string, string[], string]): Target | null => {
      const re = new RegExp(src, "i");
      let el = document.elementFromPoint(px, py) as HTMLElement | null;
      for (let i = 0; el && i < 6; i++, el = el.parentElement) {
        const label = (el.innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").trim();
        if (ids.some((sel) => el!.matches(sel))) return { label: label || "Pay", byId: true, pay: true, form: false, data: false, link: false };
        if (/^(button|a|input)$/i.test(el.tagName) || el.getAttribute("role") === "button") {
          if (re.test(label)) return { label, byId: false, pay: true, form: false, data: false, link: false };
          const b = el as HTMLInputElement;
          const href = el.tagName === "A" ? (el.getAttribute("href") ?? "") : "";
          if (b.tagName === "INPUT" && !/^(submit|image|button|reset)$/.test(b.type)) return null; // a text field, not a button
          const form = /^(submit|image)$/.test(b.type) && !!b.form;
          // The button's form sends customer details: an email, phone, or password field, or a field named for
          // one. A script button belongs to the form around it. (Inline, not a named helper: this runs in the page.)
          const owner = b.form ?? el.closest("form");
          const data =
            !!owner &&
            Array.from(owner.elements).some((f) => {
              const i = f as HTMLInputElement;
              return /^(email|tel|password)$/i.test(i.type) || new RegExp(customer, "i").test([i.name, i.id, i.getAttribute("autocomplete"), i.placeholder].join(" "));
            });
          // A link to a spot on the same page ("#next") opens nothing: it is a script button.
          return { label, byId: false, pay: false, form, data, link: !!href && !href.startsWith("#") && !/^javascript:/i.test(href) };
        }
      }
      return null;
    };
    const top = await this.page.evaluate(probe, [x, y, PAY_TEXT.source, PAY_IDS, CUSTOMER_FIELD.source] as [number, number, string, string[], string]).catch(() => null);
    if (top) return top;
    // Clicks that land on a cross-origin iframe (Shop Pay, PayPal, Stripe wallets): probe inside it.
    for (const frame of this.page.frames().slice(1)) {
      const el = await frame.frameElement().catch(() => null);
      const box = await el?.boundingBox().catch(() => null);
      if (!box || x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
      if (/paypal|shop\.app|pay\.google|apple-pay|stripe\.com\/.*(payment-request|wallet)/i.test(frame.url())) return { label: "Express pay button", byId: true, pay: true, form: false, data: false, link: false };
      const inner = await frame
        .evaluate(probe, [x - box.x, y - box.y, PAY_TEXT.source, PAY_IDS, CUSTOMER_FIELD.source] as [number, number, string, string[], string])
        .catch(() => null);
      if (inner) return inner;
    }
    return null;
  }

  async onPaymentPage(): Promise<boolean> {
    if (/checkout|\/checkouts\/|payment|\/pay\b/i.test(this.url())) return true;
    // Card fields in the page or in an embedded form.
    const hasCardField = (
      await Promise.all(
        this.page.frames().map((f) => f.evaluate(() => !!document.querySelector('input[autocomplete="cc-number"], input[name*="card" i], [data-requires-approval]')).catch(() => false)),
      )
    ).some(Boolean);
    return hasCardField || this.page.frames().some((f) => /stripe\.com|checkout\.pci\.shopifyinc|braintree|adyen|paypal/i.test(f.url()));
  }

  async execute(action: ComputerAction) {
    const p = this.page;
    if (this.sendLinks.has(action)) this.sendBlocked.add(p);
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

  // After an approved payment: wait for the store to leave the payment page (the order confirmation).
  async waitToLeave(url: string, ms = 15_000) {
    await this.page.waitForURL((u) => u.toString() !== url, { timeout: ms }).catch(() => {});
    await this.settle();
  }

  private async settle() {
    // The agent may have opened a new tab (target=_blank): follow it. The tab shows up a moment after the click.
    await this.page.waitForTimeout(300);
    const pages = this.context?.pages() ?? [];
    const newest = pages[pages.length - 1];
    if (newest && newest !== this.page && !newest.isClosed()) this.page = newest;
    await this.page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    await this.page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
    await this.page.waitForTimeout(250);
  }
}

// The tab a request comes from. Requests with no frame (none here: service workers are blocked) count as none.
const NO_PAGE = {} as Page;
function pageOf(req: Request): Page {
  try {
    return req.frame().page();
  } catch {
    return NO_PAGE;
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
  throw new Error(`No browser found. Install Chrome, or run: offertest install-browser\n${String(last).split("\n")[0]}`);
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
