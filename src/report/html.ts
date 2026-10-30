import fs from "node:fs";
import path from "node:path";
import type { Ad, Assertion, ComputerAction, Destination, RunResult, Step, Verdict, VerdictStatus } from "../types.ts";

// One self-contained report.html per run: inline CSS and JS, screenshots as data URLs.

const MAX_SHOTS = 40;
const BUDGET = 14 * 1024 * 1024; // bytes of base64 image data; keeps the file under ~15 MB

export function writeReport(result: RunResult, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "report.html");
  fs.writeFileSync(file, renderReport(result, dir));
  return file;
}

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function jsonForScript(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028]/g, "\\u2028")
    .replace(/[\u2029]/g, "\\u2029");
}

// ---------- screenshots ----------

function mimeOf(p: string): string {
  const ext = path.extname(p).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
}

function readDataUrl(file: string): string | null {
  try {
    return `data:${mimeOf(file)};base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    return null;
  }
}

// Which screenshots to embed, most important first.
function shotOrder(r: RunResult): string[] {
  const all = r.steps.filter((s) => s.screenshot).map((s) => s.screenshot!);
  const evidence = r.verdicts
    .map((v) => r.steps.find((s) => s.n === v.evidenceStep)?.screenshot)
    .filter((s): s is string => !!s);
  const sam = r.sam ? [r.sam.screenshot] : [];
  const rest = all.length <= MAX_SHOTS ? all : [...all.filter((_, i) => i % 2 === 0), all[all.length - 1]!];
  return [...new Set([...evidence, ...sam, ...rest])];
}

function loadShots(r: RunResult, dir: string): Map<string, string> {
  const root = path.resolve(dir);
  const shots = new Map<string, string>();
  let used = 0;
  for (const rel of shotOrder(r)) {
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) continue; // stay inside the run folder
    const url = readDataUrl(abs);
    if (!url || used + url.length > BUDGET) continue;
    used += url.length;
    shots.set(rel, url);
  }
  return shots;
}

// ---------- small formatters ----------

const STATUS: Record<VerdictStatus, { label: string; tone: string }> = {
  supported: { label: "Supported", tone: "good" },
  contradicted: { label: "Contradicted", tone: "bad" },
  unresolved: { label: "Unresolved", tone: "warn" },
  outside_scope: { label: "Outside scope", tone: "mute" },
};

const OVERALL = {
  pass: { word: "PASS", tone: "good", line: "Every promise in this ad holds in the funnel." },
  fail: { word: "FAIL", tone: "bad", line: "The funnel breaks a promise this ad makes." },
  unresolved: { word: "UNRESOLVED", tone: "warn", line: "OfferTest could not confirm every promise." },
} as const;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) +
    " UTC"
  );
}

function fmtDuration(a: string, b?: string): string {
  if (!b) return "n/a";
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  if (Number.isNaN(s)) return "n/a";
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n > 0 && n < 1 ? 3 : 2)}`;
}

const num = (n: number) => n.toLocaleString("en-US");

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function link(url: string, text = url): string {
  return /^https?:\/\//i.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
}

function destInfo(d: Destination): { label: string; url?: string; detail?: string } {
  switch (d.type) {
    case "website":
      return { label: "Website", url: d.url };
    case "app":
      return { label: "App", url: d.url };
    case "lead_form":
      return { label: "Instant form", detail: d.form?.name ?? `form ${d.formId}` };
    case "messaging":
      return { label: { messenger: "Messenger", whatsapp: "WhatsApp", instagram: "Instagram Direct" }[d.channel], detail: d.welcomeMessage };
    case "call":
      return { label: "Phone call", detail: d.phone };
    default:
      return { label: "Unknown destination", detail: d.note };
  }
}

function actionText(a: ComputerAction): string {
  switch (a.type) {
    case "click":
      return `Click${a.button && a.button !== "left" ? ` (${a.button})` : ""} at ${a.x}, ${a.y}`;
    case "double_click":
      return `Double-click at ${a.x}, ${a.y}`;
    case "drag":
      return `Drag through ${a.path.length} points`;
    case "keypress":
      return `Press ${a.keys.join(" + ")}`;
    case "move":
      return `Move to ${a.x}, ${a.y}`;
    case "scroll":
      return `Scroll ${a.scroll_y >= 0 ? "down" : "up"} ${Math.abs(a.scroll_y || a.scroll_x)}px`;
    case "type":
      return `Type “${a.text}”`;
    case "screenshot":
      return "Take a screenshot";
    default:
      return "Wait";
  }
}

function modelName(id: string): string {
  if (/wonder/i.test(id)) return "Muse Wonder";
  if (/spark/i.test(id)) return "Muse Spark";
  if (/sam/i.test(id)) return `SAM ${id.match(/\d+(\.\d+)?/)?.[0] ?? ""}`.trim();
  return id;
}

const jobName = (job: string) => job.replace(/[_-]+/g, " ").trim();

// ---------- icons ----------

const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a63c9"/><stop offset="1" stop-color="#1a8dff"/></linearGradient></defs><path d="M23 23v-4.5a9 9 0 0 1 18 0V23" fill="none" stroke="#0a6fd8" stroke-width="5" stroke-linecap="round"/><path d="M17.4 21h29.2a4.5 4.5 0 0 1 4.47 4l3.2 27.5A5 5 0 0 1 49.3 58H14.7a5 5 0 0 1-4.97-5.5L12.93 25a4.5 4.5 0 0 1 4.47-4z" fill="url(#lg)"/><path d="M23.5 39.5l6.2 6.2 11.8-11.8" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const META_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 15.2c0 2 1 3.3 2.6 3.3 1.3 0 2.2-.6 3.8-3.3l1.2-2 .4-.7c1.1-1.8 2-2.8 3.2-2.8 1.3 0 2.4.9 3.2 2.5.9 1.8 1 3.4.4 4.3-.3.5-.8.6-1.3.6-1 0-1.9-.9-3.4-3.4l-.7-1.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.9 10.4C9.4 8 8.2 6.9 6.8 6.9c-2 0-3.3 2.9-3.3 6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const ICON = {
  good: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bad: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  warn: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5.5v5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="10" cy="14.5" r="1.4" fill="currentColor"/></svg>`,
  mute: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 10h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
};

// ---------- sections ----------

function header(r: RunResult): string {
  const o = OVERALL[r.overall ?? "unresolved"];
  const count = (s: VerdictStatus) => r.verdicts.filter((v) => v.status === s).length;
  const tiles = (Object.keys(STATUS) as VerdictStatus[])
    .map((s) => `<div class="tally t-${STATUS[s].tone}${count(s) ? "" : " zero"}"><b>${count(s)}</b><span>${STATUS[s].label}</span></div>`)
    .join("");
  const notes = [
    r.blocked ? `<div class="note n-warn"><b>Blocked</b> ${esc(r.blocked)}</div>` : "",
    r.error ? `<div class="note n-bad"><b>Error</b> ${esc(r.error)}</div>` : "",
    r.confirmation ? `<div class="note n-good"><b>Confirmation reached</b> ${esc(r.confirmation.text)} <span class="mono">${link(r.confirmation.url)}</span></div>` : "",
  ].join("");
  return `
<div class="result r-${o.tone}">
  <div class="result-top">
    <span class="eyebrow">Result</span>
    <span class="promises">${r.assertions.length} promise${r.assertions.length === 1 ? "" : "s"} tested</span>
  </div>
  <div class="result-main">
    <span class="result-icon">${ICON[o.tone]}</span>
    <div><div class="result-word">${o.word}</div><div class="result-line">${o.line}</div></div>
  </div>
  <div class="tallies">${tiles}</div>
  ${notes}
  <dl class="facts">
    <div><dt>Run</dt><dd class="mono">${esc(r.id)}</dd></div>
    <div><dt>Date</dt><dd>${esc(fmtDate(r.createdAt))}</dd></div>
    <div><dt>Duration</dt><dd class="num">${esc(fmtDuration(r.createdAt, r.finishedAt))}</dd></div>
    <div><dt>Cost</dt><dd class="num">${esc(fmtUsd(r.usage.usd))}</dd></div>
    <div class="wide"><dt>How far the test went</dt><dd>${esc(r.boundary)}</dd></div>
    ${r.retestOf ? `<div class="wide"><dt>Re-test of</dt><dd class="mono">${esc(r.retestOf)}</dd></div>` : ""}
  </dl>
</div>`;
}

function glance(r: RunResult): string {
  if (!r.assertions.length) return "";
  const rows = r.assertions
    .map((a) => {
      const st = STATUS[r.verdicts.find((v) => v.assertionId === a.id)?.status ?? "unresolved"];
      return `<a class="gl-row" href="#v-${esc(a.id)}"><span class="gl-icon i-${st.tone}">${ICON[st.tone as keyof typeof ICON]}</span><span class="gl-claim">${esc(a.claim)}</span><span class="gl-st s-${st.tone}">${st.label}</span></a>`;
    })
    .join("");
  return `<div class="card glance"><div class="glance-head"><span class="eyebrow">At a glance</span><span class="promises">click a promise for its evidence</span></div>${rows}</div>`;
}

function adImage(ad: Ad): string {
  const u = ad.imageUrl?.trim();
  let src: string | null = null;
  if (u && (/^data:image\//i.test(u) || /^https?:\/\//i.test(u))) src = u;
  else if (u && fs.existsSync(u)) src = readDataUrl(u);
  if (src) return `<img class="ad-img" src="${esc(src)}" alt="Ad image">`;
  return `<div class="ad-img ad-img-empty"><span>${esc(ad.headline)}</span></div>`;
}

function adSection(r: RunResult): string {
  const ad = r.ad;
  const d = destInfo(ad.destination);
  const page = ad.name || (d.url ? hostOf(d.url) : "Advertiser");
  const source =
    ad.source === "meta"
      ? `Pulled from Meta Ads Manager${ad.id ? ` · ad ${ad.id}` : ""}${ad.status ? ` · ${ad.status}` : ""}`
      : "Ad entered by hand";
  const cards = ad.cards?.length
    ? `<div class="cards">${ad.cards
        .map((c, i) => `<div class="mini"><span class="mini-n">Card ${i + 1}</span><b>${esc(c.headline)}</b>${c.text ? `<span>${esc(c.text)}</span>` : ""}<em>${esc(destInfo(c.destination).label)}${"url" in c.destination ? ` · ${esc(hostOf(c.destination.url))}` : ""}</em></div>`)
        .join("")}</div>`
    : "";
  return `
<div class="ad-col">
  <div class="source ${ad.source === "meta" ? "source-meta" : ""}" title="${esc(source)}">
    <span class="source-icon">${ad.source === "meta" ? META_ICON : ICON.mute}</span>
    <div><b>${ad.source === "meta" ? "Pulled from Meta Ads Manager" : "Ad entered by hand"}</b>${
      ad.source === "meta" && (ad.id || ad.status) ? `<span class="mono">${esc([ad.id ? `ad ${ad.id}` : "", ad.status ?? ""].filter(Boolean).join(" \u00b7 "))}</span>` : ""
    }</div>
  </div>
  <article class="phone">
    <header class="ad-head">
      <span class="avatar">${esc(page.slice(0, 1).toUpperCase())}</span>
      <div><b>${esc(page)}</b><span>Sponsored</span></div>
      <span class="dots">•••</span>
    </header>
    <p class="ad-text">${esc(ad.text)}</p>
    ${adImage(ad)}
    <footer class="ad-foot">
      <div class="ad-foot-text">
        ${d.url ? `<span class="ad-domain">${esc(hostOf(d.url).toUpperCase())}</span>` : ""}
        <b>${esc(ad.headline)}</b>
        ${ad.description ? `<span class="ad-desc">${esc(ad.description)}</span>` : ""}
      </div>
      <span class="cta">${esc(ad.cta)}</span>
    </footer>
  </article>
  <div class="dest">
    <span class="chip chip-accent">${esc(d.label)}</span>
    <span class="dest-url mono">${d.url ? link(d.url) : esc(d.detail ?? "")}</span>
  </div>
  ${cards}
</div>`;
}

function stepThumb(step: Step | undefined, idx: number, shots: Map<string, string>, tone: string): string {
  if (!step) return `<div class="ev ev-none"><span class="ev-shot">No evidence page for this promise.</span></div>`;
  const src = step.screenshot ? shots.get(step.screenshot) : undefined;
  return `<button class="ev ev-${tone}" data-goto="${idx}" type="button" title="Open step ${step.n} in the step viewer">
    <span class="ev-shot">${src ? `<img src="${src}" alt="Step ${step.n}">` : `<span class="ev-text">${esc(step.summary)}</span>`}</span>
    <span class="ev-label"><b>Evidence · step ${step.n}</b><span>Open in viewer →</span></span>
  </button>`;
}

function verdictCard(a: Assertion | undefined, v: Verdict | undefined, r: RunResult, shots: Map<string, string>, i: number): string {
  const status = v?.status ?? "unresolved";
  const s = STATUS[status];
  const claim = a?.claim ?? v?.adQuote ?? "";
  const adQuote = v?.adQuote ?? a?.adQuote ?? "";
  const idx = v?.evidenceStep != null ? r.steps.findIndex((x) => x.n === v.evidenceStep) : -1;
  const conds = a ? Object.entries(a.conditions ?? {}) : [];
  const tick = (ok: boolean, yes: string, no: string) =>
    `<li class="${ok ? "ok" : "no"}">${ok ? ICON.good : ICON.bad}${ok ? yes : no}</li>`;
  return `
<article class="verdict v-${s.tone}" id="v-${esc(a?.id ?? v?.assertionId ?? i)}">
  <div class="v-body">
    <div class="v-top">
      <span class="badge b-${s.tone}">${ICON[s.tone as keyof typeof ICON]}${s.label}</span>
      <span class="v-id mono">${esc(a?.id ?? v?.assertionId ?? `#${i + 1}`)}</span>
      ${a?.kind ? `<span class="tag">${esc(a.kind.replace(/_/g, " "))}</span>` : ""}
      ${a?.card != null ? `<span class="tag">card ${a.card + 1}</span>` : ""}
      ${conds.map(([k, val]) => `<span class="tag tag-soft">${esc(k)}: ${esc(val)}</span>`).join("")}
    </div>
    <h3 class="claim">${esc(claim)}</h3>
    <div class="quotes">
      <figure class="q q-ad"><figcaption>The ad says</figcaption><blockquote>${esc(adQuote)}</blockquote></figure>
      <figure class="q q-page q-${s.tone}"><figcaption>The funnel shows${v?.evidenceStep != null ? ` <span class="q-step">step ${v.evidenceStep}</span>` : ""}</figcaption>${
        v?.pageQuote ? `<blockquote>${esc(v.pageQuote)}</blockquote>` : `<blockquote class="q-none">No page quote captured.</blockquote>`
      }</figure>
    </div>
    ${v ? `<p class="reason">${esc(v.reason)}</p>` : `<p class="reason">No verdict was recorded for this promise.</p>`}
    <div class="v-foot">
      ${
        v
          ? `<ul class="checks"><li class="checks-h">Quote check</li>${tick(v.quoteCheck.adQuoteFound, "Ad quote found in the ad", "Ad quote not found in the ad")}${
              v.pageQuote ? tick(v.quoteCheck.pageQuoteFound, "Page quote found on the captured page", "Page quote not found on the captured page") : ""
            }</ul>`
          : ""
      }
      ${v?.downgraded ? `<div class="downgraded">${ICON.warn}Downgraded to unresolved: a quote did not pass the quote check.</div>` : ""}
    </div>
  </div>
  ${stepThumb(idx >= 0 ? r.steps[idx] : undefined, idx, shots, s.tone)}
</article>`;
}

function verdictSection(r: RunResult, shots: Map<string, string>): string {
  const seen = new Set<string>();
  const cards: string[] = [];
  r.assertions.forEach((a, i) => {
    const v = r.verdicts.find((x) => x.assertionId === a.id);
    if (v) seen.add(v.assertionId);
    cards.push(verdictCard(a, v, r, shots, i));
  });
  r.verdicts.filter((v) => !seen.has(v.assertionId) && !r.assertions.some((a) => a.id === v.assertionId)).forEach((v, i) => cards.push(verdictCard(undefined, v, r, shots, i)));
  if (!cards.length) cards.push(`<div class="empty-card">No promises were found in this ad.</div>`);
  return section("verdicts", "Promises", "Each promise in the ad, checked against what the funnel really shows.", cards.join(""));
}

// One shell word: single quotes stop $, backticks, and & from doing anything when the command is pasted.
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function retestCommand(r: Pick<RunResult, "ad">): string {
  const d = r.ad.destination;
  if (r.ad.source === "meta" && r.ad.id) return `offertest check --ad ${shellQuote(r.ad.id)}`;
  if ("url" in d) return `offertest check --url ${shellQuote(d.url)} --headline ${shellQuote(r.ad.headline)} --text ${shellQuote(r.ad.text)}`;
  return "offertest check";
}

function fixSection(r: RunResult): string {
  const f = r.fix;
  if (!f) return "";
  return `
<section class="card fix" id="fix">
  <div class="fix-head"><span class="eyebrow eyebrow-accent">Suggested fix</span><span class="tag">fix the ${esc(f.target)}</span></div>
  <h3 class="fix-summary">${esc(f.summary)}</h3>
  <p class="muted">${esc(f.rationale)}</p>
  ${f.steps.length ? `<ol class="fix-steps">${f.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
  ${
    f.adCopy
      ? `<div class="newcopy"><span class="eyebrow">New ad copy</span><b>${esc(f.adCopy.headline)}</b><p>${esc(f.adCopy.text)}</p></div>`
      : ""
  }
  <div class="retest"><span>Re-test after you fix it</span><code>${esc(retestCommand(r))}</code></div>
</section>`;
}

function samSection(r: RunResult, shots: Map<string, string>): string {
  if (!r.sam) return "";
  const src = shots.get(r.sam.screenshot);
  const pct = (n: number, of: number) => (of > 0 ? ((n / of) * 100).toFixed(3) : "0");
  const boxes = r.sam.boxes
    .map(
      (b) =>
        `<div class="box" style="left:${pct(b.left, b.w)}%;top:${pct(b.top, b.h)}%;width:${pct(b.right - b.left, b.w)}%;height:${pct(b.bottom - b.top, b.h)}%"><span>${esc(b.label)}</span></div>`,
    )
    .join("");
  const labels = [...new Set(r.sam.boxes.map((b) => b.label))];
  return `
<section class="card sam" id="sam">
  <div class="fix-head"><span class="eyebrow eyebrow-accent">Product match</span><span class="tag">SAM 3.1</span></div>
  <h3 class="fix-summary">${r.sam.boxes.length ? `Found the advertised product on the page` : `The advertised product was not found on the page`}</h3>
  <p class="muted">${r.sam.boxes.length} box${r.sam.boxes.length === 1 ? "" : "es"} for ${labels.map((l) => `“${esc(l)}”`).join(", ") || "no labels"}.</p>
  ${src ? `<div class="sam-frame"><img src="${src}" alt="SAM screenshot">${boxes}</div>` : `<div class="empty-card">Screenshot not embedded.</div>`}
</section>`;
}

function stepsSection(r: RunResult, shots: Map<string, string>): string {
  if (!r.steps.length) return section("steps", "Steps", "", `<div class="empty-card">The agent took no steps.</div>`);
  const evidence = new Map<number, string>();
  for (const v of r.verdicts) if (v.evidenceStep != null) evidence.set(v.evidenceStep, STATUS[v.status].tone);
  const first = r.steps.findIndex((s) => s.screenshot && shots.has(s.screenshot));
  const firstSrc = first >= 0 ? shots.get(r.steps[first]!.screenshot!)! : "";

  const tiles = r.steps
    .map((s, i) => {
      const src = s.screenshot ? shots.get(s.screenshot) : undefined;
      const ev = evidence.get(s.n);
      return `<button class="tile${src ? "" : " tile-text"}" type="button" data-i="${i}" data-url="${esc(s.url ?? "")}"${
        s.click ? ` data-cx="${s.click.x}" data-cy="${s.click.y}"` : ""
      } aria-label="Step ${s.n}">
  ${src ? `<img src="${src}" alt="">` : `<span class="tile-sum">${esc(s.summary)}</span>`}
  <span class="tile-meta"><b class="num">${String(s.n).padStart(2, "0")}</b><span>${esc(s.kind)}</span>${ev ? `<i class="ev-dot d-${ev}" title="Evidence"></i>` : ""}</span>
  <span class="tile-print">${esc(s.summary)}</span>
</button>`;
    })
    .join("");

  const details = r.steps
    .map((s, i) => {
      const ev = evidence.get(s.n);
      const noShot = !s.screenshot ? "No screenshot for this step." : !shots.has(s.screenshot) ? "Screenshot not embedded to keep the report small." : "";
      return `<div class="sd" data-i="${i}"${i === Math.max(first, 0) ? "" : " hidden"}>
  <div class="sd-top"><span class="sd-n num">Step ${s.n} <em>of ${r.steps.length}</em></span><span class="tag">${esc(s.kind)}</span>${
    ev ? `<span class="tag tag-${ev}">evidence</span>` : ""
  }<span class="sd-at num" title="${esc(s.at)}">${esc(s.at.match(/T(\d\d:\d\d:\d\d)/)?.[1] ?? s.at)}</span></div>
  <p class="sd-sum">${esc(s.summary)}</p>
  ${s.url ? `<div class="sd-url mono">${link(s.url)}</div>` : ""}
  ${noShot ? `<p class="sd-noshot">${noShot}</p>` : ""}
  ${s.actions?.length ? `<ul class="acts">${s.actions.map((a) => `<li>${esc(actionText(a))}</li>`).join("")}</ul>` : ""}
  ${s.modelText ? `<details class="mt"><summary>Model text</summary><pre>${esc(s.modelText)}</pre></details>` : ""}
</div>`;
    })
    .join("");

  return section(
    "steps",
    "Step viewer",
    "Everything the agent did, in order. Use ← and → to move between steps.",
    `<div class="viewer">
  <div class="stage">
    <div class="chrome"><span class="lights"><i></i><i></i><i></i></span><span class="urlbar mono" id="v-url"></span></div>
    <div class="canvas">
      <div class="frame" id="v-frame"><img id="v-img" src="${firstSrc}" alt="Step screenshot"><span class="click" id="v-click" hidden></span></div>
      <div class="noshot" id="v-noshot" hidden>No screenshot for this step</div>
      <button class="nav prev" id="v-prev" type="button" aria-label="Previous step">‹</button>
      <button class="nav next" id="v-next" type="button" aria-label="Next step">›</button>
    </div>
  </div>
  <aside class="detail">${details}</aside>
</div>
<div class="strip" id="v-strip">${tiles}</div>`,
  );
}

function modelsSection(r: RunResult): string {
  const rows = Object.entries(r.models)
    .map(([job, id]) => `<tr><td><b>${esc(modelName(id))}</b> <span class="muted">· ${esc(jobName(job))}</span></td><td class="mono">${esc(id)}</td></tr>`)
    .join("");
  const u = r.usage;
  return section(
    "models",
    "Models used",
    "",
    `<div class="models">
  <div class="card table-card"><table><thead><tr><th>Model and job</th><th>Model id</th></tr></thead><tbody>${
    rows || `<tr><td colspan="2" class="muted">No models recorded.</td></tr>`
  }</tbody></table></div>
  <div class="usage">
    <div class="stat"><span>Input tokens</span><b class="num">${num(u.inputTokens)}</b></div>
    <div class="stat"><span>Output tokens</span><b class="num">${num(u.outputTokens)}</b></div>
    <div class="stat"><span>Images</span><b class="num">${num(u.images)}</b></div>
    <div class="stat stat-accent"><span>Cost</span><b class="num">${esc(fmtUsd(u.usd))}</b></div>
  </div>
</div>`,
  );
}

function section(id: string, title: string, sub: string, body: string): string {
  return `<section class="sec" id="${id}"><div class="sec-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${body}</section>`;
}

// ---------- page ----------

export function renderReport(r: RunResult, dir: string): string {
  const shots = loadShots(r, dir);
  const o = OVERALL[r.overall ?? "unresolved"];
  let imgSrc = "data:";
  if (r.ad.imageUrl && /^https?:\/\//i.test(r.ad.imageUrl)) {
    try {
      imgSrc += " " + new URL(r.ad.imageUrl).origin;
    } catch {
      /* not a valid URL: data only */
    }
  }
  const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; script-src 'unsafe-inline'`;
  const sideBySide = r.fix || r.sam ? `<div class="pair${r.fix && r.sam ? "" : " pair-one"}">${fixSection(r)}${samSection(r, shots)}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${esc(csp).replace(/&#39;/g, "'")}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(`${o.word} · ${r.ad.headline} · OfferTest AI`)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="top">
  <div class="wrap top-in">
    <a class="brand" href="#">${LOGO}<span>OfferTest <em>AI</em></span></a>
    <nav class="toc"><a href="#verdicts">Promises</a>${r.fix ? `<a href="#fix">Fix</a>` : ""}${r.sam ? `<a href="#sam">Product</a>` : ""}<a href="#steps">Steps</a><a href="#models">Models</a></nav>
    <span class="runid mono">${esc(r.id)}</span>
  </div>
</div>
<main class="wrap">
  <div class="hero"><div class="hero-main">${header(r)}${glance(r)}</div>${adSection(r)}</div>
  ${verdictSection(r, shots)}
  ${sideBySide}
  ${stepsSection(r, shots)}
  ${modelsSection(r)}
</main>
<footer class="foot wrap"><span>${LOGO}Generated by OfferTest AI${r.tool?.version ? ` ${esc(r.tool.version)}` : ""}</span><span class="mono">schema v${esc(r.schemaVersion)} · ${esc(r.id)}</span></footer>
<script type="application/json" id="offertest-result">${jsonForScript(r)}</script>
<script>${JS}</script>
</body>
</html>
`;
}

// ---------- inline JS: step viewer ----------

const JS = `(function(){
var tiles=[].slice.call(document.querySelectorAll('.tile'));
var panels=[].slice.call(document.querySelectorAll('.sd'));
if(!tiles.length)return;
var img=document.getElementById('v-img'),frame=document.getElementById('v-frame'),noshot=document.getElementById('v-noshot'),
click=document.getElementById('v-click'),url=document.getElementById('v-url'),cur=-1;
function mark(){var t=tiles[cur];if(!t||!t.dataset.cx||!img.naturalWidth){click.hidden=true;return;}
click.style.left=(t.dataset.cx/img.naturalWidth*100)+'%';click.style.top=(t.dataset.cy/img.naturalHeight*100)+'%';click.hidden=false;}
function show(i){if(i<0||i>=tiles.length)return;cur=i;var t=tiles[i],thumb=t.querySelector('img');
tiles.forEach(function(x,j){x.classList.toggle('on',j===i);});
panels.forEach(function(p,j){p.hidden=j!==i;});
url.textContent=t.dataset.url||'';
if(thumb){frame.hidden=false;noshot.hidden=true;click.hidden=true;if(img.src!==thumb.src)img.src=thumb.src;else mark();}
else{frame.hidden=true;noshot.hidden=false;}
var s=document.getElementById('v-strip');var l=t.offsetLeft-s.clientWidth/2+t.clientWidth/2;s.scrollTo({left:l,behavior:'smooth'});}
img.addEventListener('load',mark);
tiles.forEach(function(t,i){t.addEventListener('click',function(){show(i);});});
document.getElementById('v-prev').onclick=function(){show(cur-1);};
document.getElementById('v-next').onclick=function(){show(cur+1);};
document.addEventListener('keydown',function(e){if(e.metaKey||e.ctrlKey||e.altKey)return;
if(e.key==='ArrowRight'||e.key==='j'){show(cur+1);e.preventDefault();}
if(e.key==='ArrowLeft'||e.key==='k'){show(cur-1);e.preventDefault();}});
[].forEach.call(document.querySelectorAll('[data-goto]'),function(b){b.addEventListener('click',function(){
var i=+b.dataset.goto;if(i<0)return;show(i);document.getElementById('steps').scrollIntoView({behavior:'smooth'});});});
var start=tiles.findIndex(function(t){return t.querySelector('img');});show(start<0?0:start);
})();`;

// ---------- inline CSS ----------

const CSS = `
:root{--accent:#0a70dc;--accent-2:#e9f2fd;--ink:#0d1726;--ink-2:#364153;--muted:#677285;--line:#e5e8ee;--line-2:#eef0f4;--bg:#f6f7fa;--card:#fff;
--good:#0f8a5f;--good-bg:#e8f6ef;--good-line:#bfe6d3;--bad:#d1343a;--bad-bg:#fdeeee;--bad-line:#f6c9cb;--warn:#b86e00;--warn-bg:#fff5e3;--warn-line:#f6dcaa;--mute:#6b7383;--mute-bg:#f1f3f6;--mute-line:#dfe3ea;
--r:16px;--shadow:0 1px 2px rgba(16,24,40,.04),0 4px 16px rgba(16,24,40,.05)}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,"Inter var",ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss01";background-image:radial-gradient(1200px 420px at 50% -120px,rgba(10,112,220,.09),transparent 70%);background-repeat:no-repeat}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.mono{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:.86em;letter-spacing:-.01em}
.num,.tally b,.stat b,.result-word{font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
.wrap{max-width:1200px;margin:0 auto;padding:0 32px}
.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.82);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid var(--line)}
.top-in{display:flex;align-items:center;gap:28px;height:60px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;letter-spacing:-.02em;color:var(--ink)}
.brand:hover{text-decoration:none}.brand em{font-style:normal;color:var(--accent)}
.logo{width:30px;height:30px;flex:none}
.toc{display:flex;gap:4px;margin-left:8px}
.toc a{color:var(--ink-2);font-size:13.5px;font-weight:500;padding:6px 11px;border-radius:8px}
.toc a:hover{background:var(--mute-bg);text-decoration:none}
.runid{margin-left:auto;color:var(--muted);background:var(--card);border:1px solid var(--line);padding:4px 10px;border-radius:8px}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 384px;gap:28px;padding:32px 0 8px;align-items:start}
.card,.result,.verdict,.phone{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.eyebrow-accent{color:var(--accent)}
/* result */
.result{padding:26px 28px 24px;position:relative;overflow:hidden}
.result:before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:var(--tone)}
.result:after{content:"";position:absolute;right:-120px;top:-140px;width:360px;height:360px;border-radius:50%;background:radial-gradient(closest-side,var(--tone-bg),transparent);opacity:.9;pointer-events:none}
.r-good{--tone:var(--good);--tone-bg:var(--good-bg)}.r-bad{--tone:var(--bad);--tone-bg:var(--bad-bg)}.r-warn{--tone:var(--warn);--tone-bg:var(--warn-bg)}
.result-top{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1}
.promises{font-size:13px;color:var(--muted)}
.result-main{display:flex;align-items:center;gap:20px;margin:14px 0 22px;position:relative;z-index:1}
.result-icon{width:68px;height:68px;border-radius:20px;background:var(--tone);color:#fff;display:grid;place-items:center;flex:none;box-shadow:0 8px 24px -8px var(--tone)}
.result-icon svg{width:40px;height:40px}
.result-word{font-size:56px;line-height:1;font-weight:800;letter-spacing:-.035em;color:var(--tone)}
.result-line{font-size:18px;font-weight:500;color:var(--ink-2);margin-top:6px;letter-spacing:-.01em}
.tallies{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;position:relative;z-index:1}
.tally{border:1px solid var(--line);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;background:#fff}
.tally b{font-size:24px;font-weight:700;line-height:1.2;letter-spacing:-.02em}
.tally span{font-size:12.5px;color:var(--muted);font-weight:500}
.t-good b{color:var(--good)}.t-bad b{color:var(--bad)}.t-warn b{color:var(--warn)}.t-mute b{color:var(--mute)}
.note{margin-top:12px;border-radius:12px;padding:10px 14px;font-size:14px;position:relative;z-index:1}
.note b{margin-right:6px}
.n-warn{background:var(--warn-bg);color:#7a4a00;border:1px solid var(--warn-line)}
.n-bad{background:var(--bad-bg);color:#8f1d22;border:1px solid var(--bad-line)}
.n-good{background:var(--good-bg);color:#0a5b3f;border:1px solid var(--good-line)}
.facts{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1.5fr) minmax(0,.8fr) minmax(0,.8fr);gap:14px 18px;margin:20px 0 0;padding-top:18px;border-top:1px solid var(--line-2);position:relative;z-index:1}
.facts div{min-width:0}.facts .wide{grid-column:1/-1}
.facts dt{font-size:12px;color:var(--muted);font-weight:500;margin-bottom:2px}
.facts dd{margin:0;font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.facts .wide dd{white-space:normal;font-weight:500;color:var(--ink-2)}
.hero-main{display:flex;flex-direction:column;gap:16px;min-width:0}
.tally.zero{background:#fafbfc}.tally.zero b{color:#b7bdc8}
.glance{padding:16px 10px 8px}
.glance-head{display:flex;justify-content:space-between;align-items:center;padding:0 12px 8px}
.gl-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;color:var(--ink)}
.gl-row+.gl-row{border-top:1px solid var(--line-2)}
.gl-row:hover{background:#f7f9fc;text-decoration:none}
.gl-icon{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff}
.gl-icon svg{width:16px;height:16px}
.i-good{background:var(--good)}.i-bad{background:var(--bad)}.i-warn{background:var(--warn)}.i-mute{background:#a3aab6}
.gl-claim{flex:1;min-width:0;font-weight:500;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gl-st{font-size:12.5px;font-weight:600;flex:none}
.s-good{color:var(--good)}.s-bad{color:var(--bad)}.s-warn{color:var(--warn)}.s-mute{color:var(--mute)}
.source{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 14px}
.source div{display:flex;flex-direction:column;line-height:1.3;min-width:0}
.source b{font-size:13.5px}.source .mono{color:var(--muted);font-size:12px}
.source-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--mute-bg);color:var(--mute);flex:none}
.source-icon svg{width:22px;height:22px}
.source-meta{background:linear-gradient(180deg,#f3f8ff,#fff);border-color:#d3e4fa}
.source-meta .source-icon{background:var(--accent);color:#fff}
.live{margin-left:auto;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:5px;text-transform:capitalize}
.live:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 18%,transparent)}
/* ad */
.ad-col{display:flex;flex-direction:column;gap:12px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:500;color:var(--ink-2);background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px 12px}
.chip-meta{color:#0b4ea2;background:var(--accent-2);border-color:#cfe2fa}
.chip-meta .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(10,112,220,.15)}
.chip-accent{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600;flex:none}
.phone{overflow:hidden;border-radius:18px}
.ad-head{display:flex;align-items:center;gap:10px;padding:12px 14px 6px}
.ad-head div{display:flex;flex-direction:column;line-height:1.25}
.ad-head b{font-size:14px}.ad-head div span{font-size:12px;color:var(--muted)}
.avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0a70dc,#5aa9ff);color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px;flex:none}
.dots{margin-left:auto;color:var(--muted);letter-spacing:1px;font-size:12px}
.ad-text{margin:4px 14px 12px;font-size:14px;line-height:1.45;white-space:pre-wrap}
.ad-img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:var(--mute-bg)}
.ad-img-empty{display:grid;place-items:center;padding:24px;text-align:center;font-weight:700;font-size:22px;color:#fff;background:linear-gradient(135deg,#0a70dc,#7cc0ff)}
.ad-foot{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#f3f4f7;border-top:1px solid var(--line-2)}
.ad-foot-text{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.ad-domain{font-size:11px;color:var(--muted);letter-spacing:.03em}
.ad-foot b{font-size:14.5px}
.ad-desc{font-size:12.5px;color:var(--muted)}
.cta{margin-left:auto;flex:none;background:#e3e6eb;color:var(--ink);font-weight:600;font-size:13.5px;padding:8px 14px;border-radius:8px}
.dest{display:flex;align-items:center;gap:10px;min-width:0}
.dest-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-2)}
.cards{display:flex;flex-direction:column;gap:8px}
.mini{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:13px}
.mini-n{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.mini em{font-style:normal;color:var(--muted);font-size:12px}
/* sections */
.sec{padding-top:40px}
.sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:16px;flex-wrap:wrap}
.sec-head h2{font-size:22px;letter-spacing:-.02em;margin:0;font-weight:700}
.sec-head p{margin:0;color:var(--muted);font-size:14px}
.empty-card{padding:22px;border:1px dashed var(--mute-line);border-radius:var(--r);color:var(--muted);text-align:center;background:#fff}
/* verdicts */
.verdict{display:grid;grid-template-columns:minmax(0,1fr) 272px;gap:24px;padding:22px 22px 22px 26px;margin-bottom:14px;position:relative;overflow:hidden;break-inside:avoid}
.verdict:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tone)}
.v-good{--tone:var(--good);--tone-bg:var(--good-bg);--tone-line:var(--good-line)}
.v-bad{--tone:var(--bad);--tone-bg:var(--bad-bg);--tone-line:var(--bad-line)}
.v-warn{--tone:var(--warn);--tone-bg:var(--warn-bg);--tone-line:var(--warn-line)}
.v-mute{--tone:var(--mute);--tone-bg:var(--mute-bg);--tone-line:var(--mute-line)}
.v-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;padding:4px 11px 4px 7px;border-radius:999px;border:1px solid}
.badge svg{width:16px;height:16px}
.b-good{color:var(--good);background:var(--good-bg);border-color:var(--good-line)}
.b-bad{color:var(--bad);background:var(--bad-bg);border-color:var(--bad-line)}
.b-warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn-line)}
.b-mute{color:var(--mute);background:var(--mute-bg);border-color:var(--mute-line)}
.v-id{color:var(--muted)}
.tag{font-size:12px;font-weight:500;color:var(--ink-2);background:var(--mute-bg);border-radius:6px;padding:2px 8px}
.tag-soft{background:#fff;border:1px solid var(--line)}
.tag-good{background:var(--good-bg);color:var(--good)}.tag-bad{background:var(--bad-bg);color:var(--bad)}.tag-warn{background:var(--warn-bg);color:var(--warn)}
.claim{font-size:19px;line-height:1.35;letter-spacing:-.015em;margin:12px 0 14px;font-weight:650}
.quotes{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.q{margin:0;border-radius:12px;padding:12px 14px 13px;border:1px solid var(--line);background:#fafbfc}
.q figcaption{font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;display:flex;align-items:center;gap:8px}
.q blockquote{margin:0;font-size:15px;line-height:1.5;font-weight:500;color:var(--ink)}
.q blockquote:before{content:"\\201C"}.q blockquote:after{content:"\\201D"}
.q blockquote.q-none:before,.q blockquote.q-none:after{content:none}
.q-none{color:var(--muted)!important;font-style:italic;font-weight:400!important}
.q-ad{background:var(--accent-2);border-color:#d3e4fa}.q-ad figcaption{color:#0b5bb5}
.q-page{background:var(--tone-bg);border-color:var(--tone-line)}.q-page figcaption{color:var(--tone)}
.q-step{font-weight:600;letter-spacing:0;text-transform:none;background:#fff;border-radius:5px;padding:0 6px;color:var(--ink-2)}
.reason{margin:14px 0 0;color:var(--ink-2);font-size:14.5px}
.v-foot{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin-top:12px}
.checks{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px}
.checks li{display:flex;align-items:center;gap:5px}
.checks-h{font-weight:600;color:var(--ink-2)}
.checks svg{width:16px;height:16px;border-radius:50%;padding:2px}
.checks .ok{color:var(--good)}.checks .ok svg{background:var(--good-bg)}
.checks .no{color:var(--bad)}.checks .no svg{background:var(--bad-bg)}
.downgraded{display:flex;align-items:center;gap:6px;font-size:13px;color:#7a4a00;background:var(--warn-bg);border:1px solid var(--warn-line);padding:4px 10px;border-radius:8px}
.downgraded svg{width:16px;height:16px}
.ev{display:flex;flex-direction:column;gap:8px;border:0;background:none;padding:0;cursor:pointer;align-self:start;font:inherit;text-align:left;color:inherit}
.ev-shot{display:block;aspect-ratio:16/10;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--mute-bg);transition:transform .15s,box-shadow .15s}
.ev:hover .ev-shot{transform:translateY(-1px);box-shadow:0 10px 26px -12px rgba(16,24,40,.35)}
.ev img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
.ev-text{display:block;padding:14px;font-size:13px;color:var(--ink-2)}
.ev-none{cursor:default}.ev-none .ev-shot{display:grid;place-items:center;padding:16px;text-align:center;color:var(--muted);font-size:13px;border-style:dashed}
.ev-label{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:0 2px}
.ev-label b{font-weight:600;color:var(--ink-2)}.ev-label span{color:var(--accent);font-weight:600}
.ev:hover .ev-label span{text-decoration:underline}
.ev-bad .ev-shot{border-color:var(--bad-line);box-shadow:0 0 0 3px var(--bad-bg)}
/* fix + sam */
.pair{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px;padding-top:26px;align-items:start}
.pair-one{grid-template-columns:1fr}
.fix,.sam{padding:22px 24px}
.fix{border-color:#cfe0f6;background:linear-gradient(180deg,#f5f9ff,#fff 140px)}
.fix-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.fix-summary{font-size:19px;letter-spacing:-.015em;line-height:1.35;margin:10px 0 6px;font-weight:650}
.fix p.muted{margin:0 0 14px}
.fix-steps{margin:0 0 16px;padding:0;list-style:none;counter-reset:s}
.fix-steps li{counter-increment:s;position:relative;padding:8px 0 8px 38px;border-top:1px solid var(--line-2);font-size:14.5px}
.fix-steps li:first-child{border-top:0}
.fix-steps li:before{content:counter(s);position:absolute;left:0;top:7px;width:24px;height:24px;border-radius:8px;background:var(--accent);color:#fff;font-weight:700;font-size:12.5px;display:grid;place-items:center}
.newcopy{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff;margin-bottom:14px;display:flex;flex-direction:column;gap:4px}
.newcopy p{margin:0;color:var(--ink-2);font-size:14px}
.retest{display:flex;flex-direction:column;gap:6px;background:#0d1726;color:#c9d4e5;border-radius:12px;padding:12px 14px}
.retest span{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8ea0bb}
.retest code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:13px;color:#fff;word-break:break-all}
.retest code:before{content:"$ ";color:#5aa9ff}
.sam .muted{margin:0 0 14px;font-size:14px}
.sam-frame{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--line);line-height:0}
.sam-frame img{width:100%;display:block}
.box{position:absolute;border:2.5px solid var(--accent);border-radius:6px;background:rgba(10,112,220,.10);box-shadow:0 0 0 9999px rgba(13,23,38,.0)}
.box span{position:absolute;left:-2.5px;top:-24px;line-height:1;background:var(--accent);color:#fff;font-size:12px;font-weight:600;padding:5px 8px;border-radius:6px 6px 6px 0;white-space:nowrap}
/* viewer */
.viewer{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:stretch}
.stage{background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column}
.chrome{display:flex;align-items:center;gap:14px;padding:10px 14px;border-bottom:1px solid var(--line);background:#f7f8fa}
.lights{display:flex;gap:6px}.lights i{width:11px;height:11px;border-radius:50%;background:#dfe2e8}
.lights i:nth-child(1){background:#ff5f57}.lights i:nth-child(2){background:#febc2e}.lights i:nth-child(3){background:#28c840}
.urlbar{flex:1;min-width:0;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px 12px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:26px}
.canvas{position:relative;display:grid;place-items:center;background:#eef1f5;min-height:420px;padding:0;flex:1}
.frame{position:relative;line-height:0;max-width:100%}
.frame img{display:block;max-width:100%;max-height:600px;width:auto;height:auto}
.click{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(10,112,220,.25);border:2.5px solid var(--accent);box-shadow:0 0 0 4px rgba(255,255,255,.75),0 4px 14px rgba(10,112,220,.45);pointer-events:none}
.click:after{content:"";position:absolute;inset:-12px;border-radius:50%;border:2px solid var(--accent);animation:ping 1.6s ease-out infinite}
@keyframes ping{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.4);opacity:0}}
.noshot{color:var(--muted);font-size:15px;padding:40px}
.nav{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.92);font-size:26px;line-height:1;color:var(--ink);cursor:pointer;box-shadow:var(--shadow);display:grid;place-items:center;padding:0 0 3px}
.nav:hover{background:#fff;color:var(--accent)}
.prev{left:12px}.next{right:12px}
.detail{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;box-shadow:var(--shadow);max-height:680px;overflow:auto}
.sd-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sd-n{font-weight:700;font-size:15px}.sd-n em{font-style:normal;color:var(--muted);font-weight:500}
.sd-at{margin-left:auto;font-size:12px;color:var(--muted)}
.sd-sum{font-size:16.5px;font-weight:600;line-height:1.4;letter-spacing:-.01em;margin:12px 0 10px}
.sd-url{word-break:break-all;margin-bottom:10px}
.sd-noshot{font-size:13px;color:var(--muted);font-style:italic;margin:0 0 10px}
.acts{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:6px}
.acts li{font-size:13px;background:var(--mute-bg);border-radius:8px;padding:6px 10px;font-family:ui-monospace,"SF Mono",Menlo,monospace;color:var(--ink-2);word-break:break-word}
.mt{border-top:1px solid var(--line-2);padding-top:10px;margin-top:6px}
.mt summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--accent);list-style:none}
.mt summary::-webkit-details-marker{display:none}
.mt summary:before{content:"\\25B8  "}.mt[open] summary:before{content:"\\25BE  "}
.mt pre{white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.5;background:#f7f8fa;border:1px solid var(--line-2);border-radius:10px;padding:10px 12px;margin:8px 0 0;max-height:260px;overflow:auto}
.strip{display:flex;gap:10px;overflow-x:auto;padding:14px 2px 6px;scroll-snap-type:x proximity}
.tile{flex:none;width:148px;height:112px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:0;overflow:hidden;cursor:pointer;position:relative;font:inherit;text-align:left;scroll-snap-align:center;transition:border-color .15s,box-shadow .15s,transform .15s}
.tile:hover{transform:translateY(-1px);border-color:#c5cedb}
.tile.on{border-color:var(--accent);box-shadow:0 0 0 3px rgba(10,112,220,.18)}
.tile img{display:block;width:100%;height:82px;object-fit:cover;object-position:top;border-bottom:1px solid var(--line-2)}
.tile-sum{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;height:82px;padding:10px 11px 0;font-size:12px;line-height:1.4;color:var(--ink-2);background:#fafbfc;border-bottom:1px solid var(--line-2)}
.tile-meta{display:flex;align-items:center;gap:6px;height:29px;padding:0 10px;font-size:11.5px;color:var(--muted)}
.tile-meta b{color:var(--ink);font-size:12px}
.tile.on .tile-meta b{color:var(--accent)}
.tile-print{display:none}
.ev-dot{margin-left:auto;width:8px;height:8px;border-radius:50%}
.d-good{background:var(--good)}.d-bad{background:var(--bad)}.d-warn{background:var(--warn)}.d-mute{background:var(--mute)}
/* models */
.models{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:18px;align-items:start}
.table-card{overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:12px;font-weight:600;color:var(--muted);padding:11px 18px;background:#fafbfc;border-bottom:1px solid var(--line)}
td{padding:12px 18px;border-top:1px solid var(--line-2)}
tbody tr:first-child td{border-top:0}
.usage{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 16px;display:flex;flex-direction:column}
.stat span{font-size:12.5px;color:var(--muted);font-weight:500}
.stat b{font-size:22px;font-weight:700;letter-spacing:-.02em}
.stat-accent{background:var(--accent-2);border-color:#cfe2fa}.stat-accent b{color:var(--accent)}
.foot{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:28px;padding-bottom:40px;margin-top:40px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.foot span{display:flex;align-items:center;gap:8px}
.foot .logo{width:20px;height:20px}
[hidden]{display:none!important}
@media (max-width:1000px){.hero,.pair,.viewer,.models,.verdict{grid-template-columns:1fr}.toc{display:none}.facts{grid-template-columns:1fr 1fr}.ev{max-width:420px}}
@media (max-width:640px){.quotes,.tallies{grid-template-columns:1fr 1fr}.wrap{padding:0 16px}.result-word{font-size:42px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media print{
@page{margin:14mm}
body{background:#fff;font-size:12.5px}
.top{position:static;backdrop-filter:none;background:#fff}.toc,.nav,.click:after{display:none}
.wrap{max-width:none;padding:0}
.hero{grid-template-columns:1fr 300px}
.card,.result,.verdict,.phone,.stage,.detail,.stat,.tally{box-shadow:none}
.verdict,.fix,.sam,.phone,.result,.models{break-inside:avoid}
.verdict{grid-template-columns:1fr 180px}
.sec{padding-top:24px}.sec-head{break-after:avoid}
.viewer{display:none}
.strip{display:grid;grid-template-columns:repeat(4,1fr);overflow:visible;gap:10px}
.tile{width:auto;height:auto;break-inside:avoid;border-color:var(--line)!important;box-shadow:none!important}
.tile img{height:110px}
.tile-print{display:block;padding:0 10px 10px;font-size:11px;color:var(--ink-2);line-height:1.35}
.mt pre{max-height:none}
.tile-text .tile-print,.ev-label span{display:none}
a{color:inherit}
}
`;
