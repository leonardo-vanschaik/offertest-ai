import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ComputerAction } from "@/lib/types";

export const VIEWPORT = { width: 1280, height: 800 };

// Keys the model sends map to Playwright key names.
const KEY_MAP: Record<string, string> = {
  ENTER: "Enter",
  RETURN: "Enter",
  TAB: "Tab",
  ESC: "Escape",
  ESCAPE: "Escape",
  BACKSPACE: "Backspace",
  DELETE: "Delete",
  SPACE: " ",
  UP: "ArrowUp",
  DOWN: "ArrowDown",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
  ARROWUP: "ArrowUp",
  ARROWDOWN: "ArrowDown",
  ARROWLEFT: "ArrowLeft",
  ARROWRIGHT: "ArrowRight",
  PAGEUP: "PageUp",
  PAGEDOWN: "PageDown",
  HOME: "Home",
  END: "End",
  CTRL: "Control",
  CONTROL: "Control",
  CMD: "Meta",
  META: "Meta",
  SUPER: "Meta",
  ALT: "Alt",
  OPTION: "Alt",
  SHIFT: "Shift",
};

function key(k: string): string {
  return KEY_MAP[k.toUpperCase()] ?? (k.length === 1 ? k : k[0].toUpperCase() + k.slice(1));
}

export type Guard = { kind: "payment"; label: string } | null;

export class Driver {
  private browser?: Browser;
  private context?: BrowserContext;
  page!: Page;

  // A fresh browser with no cookies: every run is a new customer session.
  async start(url: string) {
    this.browser = await chromium.launch({ headless: process.env.OFFERTEST_HEADFUL !== "1" });
    this.context = await this.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    this.page = await this.context.newPage();
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.settle();
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }

  url(): string {
    return this.page.url();
  }

  async screenshot(): Promise<Buffer> {
    return await this.page.screenshot({ type: "jpeg", quality: 75 });
  }

  async text(): Promise<string> {
    try {
      return await this.page.evaluate(() => document.body?.innerText ?? "");
    } catch {
      return "";
    }
  }

  // Would this action trigger a step that needs human approval (the store's "Place order")?
  // The guard reads the live DOM, so the model cannot talk its way past it.
  async guard(action: ComputerAction): Promise<Guard> {
    if (action.type === "click" || action.type === "double_click") {
      const label = await this.page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y)?.closest("[data-requires-approval]");
          return el ? (el as HTMLElement).innerText || "Place order" : null;
        },
        [action.x, action.y] as const,
      );
      return label ? { kind: "payment", label } : null;
    }
    if (action.type === "keypress" && action.keys.some((k) => /^(enter|return| )$/i.test(k))) {
      const label = await this.page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (a?.closest("[data-requires-approval]")) return a.innerText || "Place order";
        const form = a?.closest("form");
        const btn = form?.querySelector("[data-requires-approval]") as HTMLElement | null;
        return btn ? btn.innerText || "Place order" : null;
      });
      return label ? { kind: "payment", label } : null;
    }
    return null;
  }

  async execute(action: ComputerAction) {
    const p = this.page;
    switch (action.type) {
      case "click": {
        const button = action.button === "right" ? "right" : action.button === "wheel" ? "middle" : "left";
        if (action.button === "back") await p.goBack().catch(() => {});
        else if (action.button === "forward") await p.goForward().catch(() => {});
        else await p.mouse.click(action.x, action.y, { button });
        break;
      }
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
        await p.keyboard.type(action.text, { delay: 15 });
        break;
      case "keypress": {
        const keys = action.keys.map(key);
        if (keys.length > 1) await p.keyboard.press(keys.join("+"));
        else if (keys[0]) await p.keyboard.press(keys[0]);
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
    await this.page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    await this.page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
    await this.page.waitForTimeout(250);
  }
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
