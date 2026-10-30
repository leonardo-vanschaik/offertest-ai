// End-to-end journey harness. Runs the real `offertest` CLI (and `offertest serve`) as a child process against:
// - the demo store (real pages, real browser),
// - a fake Meta Model API whose "computer use" model is a scripted shopper: it replays each step in its own
//   hidden browser to find where to click, then sends the real agent that click,
// - a fake Meta Marketing API (Graph) with the journey's ads, lead forms, and pause calls.
// The fake judge is rule based: it reads the evidence the real run collected and quotes the matching line,
// so verdicts depend on what the store really showed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Driver } from "../../src/core/driver.ts";
import type { ComputerAction } from "../../src/types.ts";

export const STORE = process.env.DEMO_STORE ?? "http://localhost:3000";
export const ROOT = path.resolve(import.meta.dirname, "../..");
export const EXTENSION_ORIGIN = "chrome-extension://hfjeehndnoioofnabimflagfndlmddme";

// ---------- what a journey scripts ----------

export type ShopStep =
  | { click: string; guarded?: boolean } // Playwright selector; guarded: a pay button the shadow must not press
  | { fill: string; text: string }
  | { press: string; guarded?: boolean } // a key, sent to whatever has focus
  | { say: string }; // the agent's last words
export type Promise_ = { kind: string; claim: string; adQuote: string; card?: number | null; conditions?: { key: string; value: string }[] };
// A judge rule per promise, in promise order (a1, a2, ...). The first rule that matches a line of evidence wins.
// fake: a judge that makes up a supporting quote (the quote check must catch it).
export type Rule = { contradicted?: RegExp; supported?: RegExp; url?: RegExp; fake?: string };
export type GraphData = {
  ads?: Record<string, object>;
  forms?: Record<string, object>;
  account?: { id: string; name?: string; effective_status: string }[];
  expiredToken?: boolean;
  pageSize?: number; // split the account's ad list into pages, like Meta does
};
export type Journey = {
  shopper?: Record<string, ShopStep[]>; // landing URL substring -> steps
  promises?: Promise_[];
  rules?: Rule[];
  mobile?: boolean;
  fix?: { summary: string; target?: "funnel" | "ad" };
  graph?: GraphData;
  // Several ads in one run (account sweep): promises and rules per ad, found by a headline substring.
  byAd?: Record<string, { promises: Promise_[]; rules: Rule[] }>;
};

// ---------- fake Meta (Model API + Graph) ----------

type Calls = { pauses: string[]; graphPaths: string[]; turns: number; judged: number };

export class FakeMeta {
  url = "";
  journey: Journey = {};
  calls: Calls = { pauses: [], graphPaths: [], turns: 0, judged: 0 };
  private server?: http.Server;
  private shadow?: Driver;
  private steps: ShopStep[] = [];

  async start() {
    this.server = http.createServer((req, res) => this.handle(req, res).catch((e) => this.send(res, 500, { error: { message: String(e) } })));
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server!.address() as { port: number }).port}`;
  }

  async stop() {
    await this.shadow?.close().catch(() => {});
    this.server?.close();
  }

  // A new journey: new script, fresh call log.
  set(j: Journey) {
    this.journey = j;
    this.calls = { pauses: [], graphPaths: [], turns: 0, judged: 0 };
  }

  env(extra: Record<string, string> = {}): Record<string, string> {
    return { META_API_KEY: "test-key", META_BASE_URL: `${this.url}/v1`, META_GRAPH_URL: `${this.url}/graph`, META_ACCESS_TOKEN: "test-token", ...extra };
  }

  private send(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    let raw = "";
    for await (const c of req) raw += c;
    const url = new URL(req.url ?? "/", this.url);
    if (url.pathname.startsWith("/graph/")) return this.graph(req.method ?? "GET", url, raw, res);
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname === "/v1/models") return this.send(res, 200, { data: [{ id: "muse-wonder-1.0" }, { id: "muse-spark-1.3" }] });
    if (url.pathname === "/v1/chat/completions") return this.send(res, 200, this.chat(body));
    if (url.pathname === "/v1/responses") {
      if (body.model === "sam-3.1") return this.send(res, 500, {});
      return this.send(res, 200, await this.computer(body));
    }
    this.send(res, 404, {});
  }

  // ----- Model API: promises, judge, fix -----

  private chat(body: { response_format?: { json_schema?: { name?: string } }; messages?: { content: unknown }[] }) {
    const name = body.response_format?.json_schema?.name;
    const prompt = textOf(body.messages ?? []);
    // Match on the ad's own headline, not on page text that may repeat it.
    const headline = prompt.match(/Headline: (.*)/)?.[1] ?? "";
    const key = Object.keys(this.journey.byAd ?? {}).find((k) => headline.includes(k));
    const j = key ? { ...this.journey, ...this.journey.byAd![key] } : this.journey;
    let content: unknown = "ok";
    if (name === "offer_assertions") content = { subject: "", imageText: "", assertions: (j.promises ?? []).map((p) => ({ card: null, conditions: [], ...p })) };
    else if (name === "offer_verdicts") content = this.judge(prompt, j);
    else if (name === "offer_fix")
      content = { target: j.fix?.target ?? "funnel", summary: j.fix?.summary ?? "Make the store honor the ad's offer.", rationale: "The funnel does not match the ad.", steps: ["Open the store admin and change the offer."], adHeadline: null, adText: null };
    return { id: "c", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 90 } };
  }

  private judge(prompt: string, j: Journey) {
    this.calls.judged++;
    // Evidence blocks look like "--- step 7 · https://...\n<page text>".
    const blocks = [...prompt.matchAll(/--- step (\d+) · (\S+)\n([\s\S]*?)(?=\n--- step \d+ · |\n*$)/g)].map((m) => ({ step: Number(m[1]), url: m[2], lines: m[3].split("\n") }));
    const find = (re: RegExp | undefined, urlRe?: RegExp) => {
      if (!re) return undefined;
      for (const b of [...blocks].reverse()) {
        if (urlRe && !urlRe.test(b.url)) continue;
        const line = b.lines.find((l) => re.test(l));
        if (line) return { step: b.step, quote: line.trim() };
      }
      return undefined;
    };
    const verdicts = (j.promises ?? []).map((p, i) => {
      const rule = j.rules?.[i] ?? {};
      if (rule.fake)
        return { assertionId: `a${i + 1}`, status: "supported", adQuote: p.adQuote, pageQuote: rule.fake, evidenceStep: blocks.at(-1)?.step ?? 0, reason: `The page says: ${rule.fake}` };
      const bad = find(rule.contradicted, rule.url);
      const good = !bad ? find(rule.supported, rule.url) : undefined;
      const hit = bad ?? good;
      return {
        assertionId: `a${i + 1}`,
        status: bad ? "contradicted" : good ? "supported" : "unresolved",
        adQuote: p.adQuote,
        pageQuote: hit?.quote ?? "",
        evidenceStep: hit?.step ?? 0,
        reason: bad ? `The funnel says: ${bad.quote}` : good ? `The funnel shows: ${good.quote}` : "The funnel did not show this.",
      };
    });
    return { verdicts };
  }

  // ----- Model API: the scripted shopper (computer use) -----

  private async computer(body: { input?: unknown; previous_response_id?: string }) {
    this.calls.turns++;
    const usage = { input_tokens: 1500, output_tokens: 40 };
    const landing = !body.previous_response_id ? textOf(body.input).match(/Landing page: (\S+)/)?.[1] : undefined;
    if (landing) {
      // A new funnel: open the same page in the shadow browser and load this funnel's script.
      await this.shadow?.close().catch(() => {});
      this.shadow = new Driver();
      await this.shadow.start(landing, { mobile: this.journey.mobile, headful: false });
      const key = Object.keys(this.journey.shopper ?? {}).find((k) => landing.includes(k));
      this.steps = [...(key ? this.journey.shopper![key] : [])];
    }
    const step = this.steps.shift();
    if (!step || "say" in step) {
      const text = step && "say" in step ? step.say : "I checked every promise.";
      return { id: `r${this.calls.turns}`, output: [{ type: "message", content: [{ type: "output_text", text }] }], output_text: text, usage };
    }
    const actions = await this.act(step);
    return { id: `r${this.calls.turns}`, output: [{ type: "computer_call", id: `cc${this.calls.turns}`, call_id: `call${this.calls.turns}`, actions, pending_safety_checks: [], status: "completed" }], usage };
  }

  // Find the element in the shadow page, mirror the action there, and return the same action for the agent.
  private async act(step: Exclude<ShopStep, { say: string }>): Promise<ComputerAction[]> {
    const page = this.shadow!.page;
    if ("press" in step) {
      if (!step.guarded) await page.keyboard.press(step.press);
      return [{ type: "keypress", keys: [step.press] }];
    }
    const sel = "click" in step ? step.click : step.fill;
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: "visible", timeout: 10_000 });
    const before = await page.evaluate(() => window.scrollY);
    await loc.scrollIntoViewIfNeeded();
    const after = await page.evaluate(() => window.scrollY);
    const box = (await loc.boundingBox())!;
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    const actions: ComputerAction[] = [];
    if (after !== before) actions.push({ type: "scroll", x, y, scroll_x: 0, scroll_y: after - before });
    actions.push({ type: "click", button: "left", x, y });
    if ("fill" in step) actions.push({ type: "type", text: step.text });
    // Mirror it in the shadow (never press a pay button there).
    if (!("click" in step && step.guarded)) {
      await page.mouse.click(x, y);
      if ("fill" in step) await page.keyboard.type(step.text);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);
    }
    return actions;
  }

  // ----- Marketing API (Graph) -----

  private graph(method: string, url: URL, raw: string, res: http.ServerResponse) {
    const g = this.journey.graph ?? {};
    const p = url.pathname.replace(/^\/graph\/v[\d.]+\//, "");
    this.calls.graphPaths.push(`${method} ${p}${url.search}`);
    if (g.expiredToken) return this.send(res, 400, { error: { message: "Error validating access token: Session has expired", code: 190 } });
    if (method === "POST") {
      const params = new URLSearchParams(raw);
      if (params.get("status") === "PAUSED") this.calls.pauses.push(p);
      return this.send(res, 200, { success: true });
    }
    if (p === "me") return this.send(res, 200, { id: "1", name: "Test Owner" });
    if (p === "debug_token") return this.send(res, 200, { data: { app_id: "1", expires_at: 0, scopes: ["ads_read", "ads_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads"] } });
    if (p === "me/adaccounts") return this.send(res, 200, { data: [{ id: "act_1", name: "Alder Trail Co.", account_status: 1, currency: "USD" }] });
    const acct = p.match(/^(act_\d+)\/ads$/);
    if (acct) {
      const want = JSON.parse(url.searchParams.get("effective_status") ?? "[]") as string[];
      const all = (g.account ?? []).filter((a) => !want.length || want.includes(a.effective_status));
      const from = Number(url.searchParams.get("after") ?? 0);
      const size = g.pageSize ?? all.length;
      const next = from + size < all.length ? String(from + size) : undefined;
      return this.send(res, 200, { data: all.slice(from, from + size), ...(next ? { paging: { cursors: { after: next }, next: `${url.origin}${url.pathname}?after=${next}` } } : {}) });
    }
    if (g.ads?.[p]) return this.send(res, 200, g.ads[p]);
    if (g.forms?.[p]) return this.send(res, 200, g.forms[p]);
    return this.send(res, 404, { error: { message: `Unsupported get request. Object with ID '${p}' does not exist`, code: 100 } });
  }
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(textOf).join("\n");
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if ("content" in o) return textOf(o.content);
  }
  return "";
}

// ---------- the CLI as a user runs it ----------

export type CliRun = { code: number; stdout: string; stderr: string; out: string; home: string; json?: JsonResult[] };
export type JsonResult = { id: string; ad: string; overall: string; boundary: string; report: string; verdicts: { assertionId: string; status: string; pageQuote: string }[]; fix?: { summary: string }; error?: string };

// Each run gets its own home (no real saved keys) and working folder, like a fresh machine.
export function cli(args: string[], env: Record<string, string> = {}, opts: { input?: string; timeoutMs?: number } = {}): Promise<CliRun> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-cwd-"));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), path.join(ROOT, "src/cli.ts"), ...args], {
      cwd,
      // A fresh home has no saved keys; the browser cache stays where Playwright put it.
      env: { PATH: process.env.PATH ?? "", HOME: home, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), "Library/Caches/ms-playwright"), ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.end(opts.input ?? "");
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 180_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      let json: JsonResult[] | undefined;
      if (args.includes("--json")) {
        const start = stdout.indexOf("[");
        try {
          json = start >= 0 ? JSON.parse(stdout.slice(start)) : undefined;
        } catch {}
      }
      resolve({ code: code ?? -1, stdout, stderr, out: path.join(cwd, "offertest-runs"), home, json });
    });
  });
}

// The run folder's result.json, for checks the JSON summary does not carry.
export function resultOf(run: CliRun, i = 0): { steps: { url?: string; summary: string; kind: string }[]; confirmation?: { url: string }; overall: string; boundary: string; blocked?: string } {
  const dir = fs.readdirSync(run.out).sort()[i];
  return JSON.parse(fs.readFileSync(path.join(run.out, dir, "result.json"), "utf8"));
}

// Every page text the run saved, for a readable failure message.
export function pagesOf(run: CliRun, i = 0): string {
  const dir = path.join(run.out, fs.readdirSync(run.out).sort()[i], "pages");
  if (!fs.existsSync(dir)) return "(no pages)";
  return fs.readdirSync(dir).sort().map((f) => `--- ${f}\n${fs.readFileSync(path.join(dir, f), "utf8").slice(0, 1500)}`).join("\n");
}

// ---------- the demo store ----------

export async function scenario(name: string) {
  const res = await fetch(`${STORE}/api/store/scenario`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: name }) });
  if (!res.ok) throw new Error(`scenario ${name}: ${res.status}`);
}

export async function storeFix(fix: object) {
  const res = await fetch(`${STORE}/api/store/fix`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fix) });
  if (!res.ok) throw new Error(`fix: ${res.status} ${await res.text()}`);
}

export async function orderCount(): Promise<number> {
  return ((await (await fetch(`${STORE}/api/store/orders`)).json()) as unknown[]).length;
}

// ---------- a tiny site for pages the demo store does not have (password wall) ----------

export async function staticSite(pages: Record<string, string>): Promise<{ url: string; close: () => void; posts: string[] }> {
  const posts: string[] = [];
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") posts.push(req.url ?? "");
    const html = pages[new URL(req.url ?? "/", "http://x").pathname];
    res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
    res.end(html ?? "<h1>Not found</h1>");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, close: () => srv.close(), posts };
}

// ---------- shopper scripts for the demo store ----------

export const RIDGE = `${STORE}/store/products/ridge-trail-shoe`;
export const SUMMIT = `${STORE}/store/products/summit-rain-jacket`;
export const TRAIL_CLUB = `${STORE}/store/trail-club`;
export const GUIDE = `${STORE}/store/guides/first-thru-hike`;

// Pick a size, add to cart, apply the code, go to checkout, read it, stop before paying.
export function buyWithCode(size: string, code?: string): ShopStep[] {
  return [
    { click: `button[aria-label^="${size}"]` },
    { click: 'button[type="submit"]:has-text("Add to cart")' },
    ...(code ? [{ fill: 'input[name="code"]', text: code }, { click: 'button:has-text("Apply")' }] : []),
    { click: 'a[href="/store/checkout"]' },
    { say: "I read the cart and the checkout totals." },
  ];
}

// The same, then fill the checkout and press Place order.
export function payWithCode(size: string, code: string): ShopStep[] {
  return [
    ...buyWithCode(size, code).slice(0, -1),
    { fill: "#email", text: "test@offertest.ai" },
    { fill: "#name", text: "Test Shopper" },
    { fill: "#address", text: "100 Test Street, Columbus, OH 43215" },
    { fill: "#card", text: "4242424242424242" },
    { fill: "#expiry", text: "12/30" },
    { fill: "#cvc", text: "123" },
    { click: 'button[data-requires-approval="payment"]', guarded: true },
    { say: "I tried to place the order." },
  ];
}

export const startTrial: ShopStep[] = [{ click: 'a:has-text("Start free trial")' }, { say: "I read the trial sign-up form." }];

export const getGuide: ShopStep[] = [
  { fill: "#email", text: "test@offertest.ai" },
  { click: 'button[type="submit"]' },
  { click: '[data-testid="guide-download"]' },
  { say: "I tried to download the guide." },
];

// A Marketing API ad with a link to the store.
export function graphAd(id: string, o: { headline: string; text: string; link?: string; status?: string; cards?: { name: string; link: string }[]; formId?: string }) {
  const cta = o.formId ? { type: "SIGN_UP", value: { lead_gen_form_id: o.formId } } : { type: "SHOP_NOW", value: { link: o.link } };
  return {
    id,
    name: `Ad ${id}`,
    account_id: "1",
    effective_status: o.status ?? "PAUSED",
    creative: {
      id: `cr${id}`,
      call_to_action_type: cta.type,
      object_story_spec: {
        page_id: "page1",
        link_data: {
          link: o.link,
          message: o.text,
          name: o.headline,
          call_to_action: cta,
          ...(o.cards ? { child_attachments: o.cards.map((c) => ({ name: c.name, link: c.link, call_to_action: { type: "SHOP_NOW", value: { link: c.link } } })) } : {}),
        },
      },
    },
  };
}

// ---------- `offertest serve` for the Chrome extension ----------

export async function serveCli(env: Record<string, string>): Promise<{ url: string; stop: () => void; log: () => string }> {
  const port = 17000 + Math.floor(Math.random() * 2000);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "offertest-cwd-"));
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), path.join(ROOT, "src/cli.ts"), "serve", "--port", String(port)], {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: home, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), "Library/Caches/ms-playwright"), ...env },
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${url}/health`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, stop: () => child.kill(), log: () => log };
}
