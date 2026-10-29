import type { ComputerAction, Run, Step, StoreFix } from "@/lib/types";
import { formatCents } from "@/lib/types";

export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return "$0.00";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSeconds(ms: number): string {
  if (!Number.isFinite(ms)) return "0 s";
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)} s`;
  if (s < 120) return `${Math.round(s)} s`;
  return formatDuration(ms);
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return formatDateTime(iso);
}

export function stepOffset(run: Run, step: Step): string {
  const ms = new Date(step.at).getTime() - new Date(run.createdAt).getTime();
  return `+${formatDuration(ms)}`;
}

/** URL without protocol, for display in chrome-like frames. */
export function displayUrl(url: string | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "");
}

export function displayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Advertiser name shown on the ad card. The contract has no advertiser field,
 * so derive it: our owned test store runs under /store on this app.
 */
export function advertiserName(landingUrl: string): string {
  try {
    const u = new URL(landingUrl);
    if (u.pathname.startsWith("/store")) return "Alder Trail Co.";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "Your store";
  }
}

export function isTerminal(run: Run): boolean {
  return run.status === "done" || run.status === "error";
}

export function needsPolling(run: Run): boolean {
  if (!isTerminal(run)) return true;
  if (run.approvals.some((a) => a.status === "pending")) return true;
  if (run.fix && (run.fix.status === "approved" || run.fix.status === "applied") && !run.fix.retestRunId)
    return true;
  return false;
}

export function lastPointer(step: Step | undefined): { x: number; y: number; kind: string } | null {
  if (!step?.actions) return null;
  for (let i = step.actions.length - 1; i >= 0; i--) {
    const a = step.actions[i];
    if (a.type === "click" || a.type === "double_click" || a.type === "move" || a.type === "scroll")
      return { x: a.x, y: a.y, kind: a.type };
    if (a.type === "drag" && a.path.length) {
      const p = a.path[a.path.length - 1];
      return { x: p.x, y: p.y, kind: "drag" };
    }
  }
  return null;
}

export function describeAction(a: ComputerAction): string {
  switch (a.type) {
    case "click":
      return `Click at ${a.x}, ${a.y}`;
    case "double_click":
      return `Double-click at ${a.x}, ${a.y}`;
    case "drag":
      return "Drag";
    case "keypress":
      return `Press ${a.keys.join(" + ")}`;
    case "move":
      return `Move to ${a.x}, ${a.y}`;
    case "scroll":
      return `Scroll ${a.scroll_y > 0 ? "down" : a.scroll_y < 0 ? "up" : "sideways"}`;
    case "type":
      return `Type “${a.text}”`;
    case "screenshot":
      return "Look at the screen";
    case "wait":
      return "Wait";
  }
}

function formatIsoShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

/** A short, exact, human-readable description of a store fix. */
export function describeStoreFix(f: StoreFix): { label: string; lines: [string, string][] } {
  switch (f.type) {
    case "extend_coupon":
      return { label: "Extend coupon", lines: [["Code", f.code], ["Expires", formatIsoShort(f.expiresAt)]] };
    case "set_coupon_percent":
      return { label: "Change coupon percent", lines: [["Code", f.code], ["Percent off", `${f.percentOff}%`]] };
    case "create_coupon": {
      const c = f.coupon;
      const off = c.percentOff != null ? `${c.percentOff}%` : c.amountOffCents != null ? formatCents(c.amountOffCents) : "none";
      return {
        label: "Create coupon",
        lines: [["Code", c.code], ["Discount", off], ["Expires", formatIsoShort(c.expiresAt)]],
      };
    }
    case "set_coupon_products":
      return {
        label: "Change coupon products",
        lines: [["Code", f.code], ["Products", f.productIds ? f.productIds.join(", ") : "Whole cart"]],
      };
    case "set_coupon_min_spend":
      return {
        label: "Change minimum spend",
        lines: [["Code", f.code], ["Minimum", f.minSubtotalCents == null ? "None" : formatCents(f.minSubtotalCents)]],
      };
    case "set_price":
      return { label: "Change price", lines: [["Product", f.productId], ["Price", formatCents(f.priceCents)]] };
    case "set_shipping":
      return {
        label: "Change shipping",
        lines: [
          ["Flat rate", formatCents(f.flatRateCents)],
          ["Free over", f.freeOverCents == null ? "Never free" : f.freeOverCents === 0 ? "Always free" : formatCents(f.freeOverCents)],
        ],
      };
    case "restock_variant":
      return {
        label: "Restock size",
        lines: [["Product", f.productId], ["Variant", f.variantId], ["Stock", String(f.stock)]],
      };
  }
}
