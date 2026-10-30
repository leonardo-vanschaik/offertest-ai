import { randomUUID } from "node:crypto";
import { MODELS } from "../meta/client.ts";
import type { Ad, Destination, LeadForm, RunOptions, RunResult } from "../types.ts";
import { extractAssertions } from "./assertions.ts";
import { Driver } from "./driver.ts";
import { proposeFix } from "./fix.ts";
import { runFunnel, shortUrl, type FunnelResult } from "./funnel.ts";
import { judge } from "./judge.ts";
import { RunLog } from "./log.ts";
import { overallOf, type Evidence } from "./quotes.ts";
import { samBoxes } from "./sam.ts";
import { acpCheckout, itemFromUrl } from "./acp.ts";
import { agentCheckout, codesFrom } from "./ucp.ts";

export const VERSION = "0.1.0";

const CONFIRMED = /thank you|thanks for|order (is )?confirmed|order #|order number|you'?re (all set|booked|in|registered)|booking confirmed|check your (email|inbox)|we'?ll be in touch|subscription (is )?active|welcome aboard/i;

export function newRunId(): string {
  return `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}-${randomUUID().slice(0, 6)}`;
}

// Tests one ad end to end: promises -> funnel(s) -> verdicts -> fix. Writes <outDir>/<id>/.
export async function runTest(ad: Ad, opts: RunOptions): Promise<{ result: RunResult; dir: string }> {
  const r: RunResult = {
    schemaVersion: 1,
    tool: { name: "offertest", version: VERSION },
    id: newRunId(),
    createdAt: new Date().toISOString(),
    retestOf: opts.retestOf,
    ad,
    assertions: [],
    steps: [],
    verdicts: [],
    boundary: "Not tested",
    models: { "computer use, judge, fix": MODELS.wonder, "ad to promises": MODELS.spark, "product boxes": MODELS.sam },
    usage: { inputTokens: 0, outputTokens: 0, images: 0, usd: 0 },
  };
  const log = new RunLog(r, opts.outDir);
  const phase = async (p: string) => {
    opts.onPhase?.(p);
    await log.event({ type: "phase", phase: p });
  };

  try {
    await log.event({ type: "run_started", ad: { ...ad, imageUrl: ad.imageUrl?.startsWith("data:") ? "(inline image)" : ad.imageUrl }, pay: !!opts.pay });
    if (ad.source === "meta")
      await log.step({ kind: "source", summary: `Pulled ad ${ad.id} "${ad.name ?? ad.headline}" from Meta Ads Manager (${ad.status ?? "status unknown"})` });

    await phase("Reading the ad's promises (Muse Spark)");
    const { assertions, subject, imageText } = await extractAssertions(r);
    r.assertions = assertions;
    if (imageText.trim()) r.ad.imageText = imageText.trim();
    await log.event({ type: "assertions", assertions });
    log.save();

    await phase("Following the funnel like a customer (Muse Wonder · computer use)");
    const evidence: Evidence[] = [];
    const funnels: FunnelResult[] = [];
    let lastUrl = "";

    const follow = async (url: string, cardIndex?: number, headful = opts.headful): Promise<void> => {
      const driver = new Driver();
      try {
        await driver.start(url, { headful, mobile: opts.mobile, allowPayment: opts.pay });
        const f = opts.baseline ? await landingOnly(driver, log) : await runFunnel(r, driver, log, opts, url, cardIndex);
        if (shouldRetryVisible(f, !!headful, opts)) {
          // Bot walls often stop headless browsers only: try once more in a visible browser.
          await log.step({ kind: "note", summary: `Blocked (${f.blocked}): retrying once in a visible browser` });
          await driver.close();
          try {
            return await follow(url, cardIndex, true);
          } catch (e) {
            await log.step({ kind: "note", summary: `Visible browser retry failed: ${(e as Error).message.split("\n")[0]}` });
          }
        }
        funnels.push(f);
        evidence.push(...f.evidence);
        lastUrl = driver.url();
        if (driver.blockedRequests.length) await log.event({ type: "order_submit_blocked", urls: driver.blockedRequests });
        r.confirmation = confirmationOf(f, opts) ?? r.confirmation;
      } finally {
        await driver.close();
      }
    };

    const acpTried = new Set<string>(); // one ACP purchase per item, even across carousel cards
    for (const target of destinations(ad)) {
      const d = target.destination;
      if (d.type === "website" || d.type === "app") await follow(d.url, target.card);
      if (d.type === "website" && opts.agentCheckout !== false && !opts.baseline) {
        // The same offer through the store's agent checkout, where AI shopping agents buy.
        const codes = codesFrom(r.assertions.map((a) => a.conditions));
        const ac = await agentCheckout(d.url, codes, subject || ad.headline);
        if ("skipped" in ac) await log.step({ kind: "note", summary: ac.skipped });
        else {
          const step = await log.step({ kind: "source", summary: "Built a cart in the store's agent checkout (UCP) with the ad's codes", url: ac.url }, undefined, ac.text);
          evidence.push({ step: step.n, url: ac.url, text: ac.text });
        }
        // The store's ACP checkout, when you gave its endpoint and key: a full agent purchase in test mode.
        const item = opts.acp && (opts.acp.item ?? itemFromUrl(d.url));
        if (opts.acp && item && !acpTried.has(item)) {
          acpTried.add(item);
          // Like the browser: a purchase needs --pay and your approval; without them it stops before paying.
          const buy = !!opts.pay && opts.acp.buy !== false;
          const p = await acpCheckout({
            ...opts.acp,
            item,
            codes,
            buy,
            hold: opts.acp.buy === false ? "--no-buy" : "add --pay to finish a test purchase",
            approve: (total) =>
              opts.approve?.({ kind: "payment", title: `Buy through the store's ACP checkout for ${total} (test mode, no real money)?`, detail: opts.acp!.endpoint }) ?? Promise.resolve(false),
          });
          if ("skipped" in p) await log.step({ kind: "note", summary: p.skipped });
          else {
            const step = await log.step({ kind: "source", summary: "Bought through the store's ACP agent checkout with the ad's codes (test mode)", url: p.url }, undefined, p.text);
            evidence.push({ step: step.n, url: p.url, text: p.text });
          }
        }
      }
      else if (d.type === "lead_form") {
        const text = leadFormText(d.formId, d.form);
        const step = await log.step({ kind: "source", summary: `Read Instant Form ${d.form?.name ?? d.formId} from Meta`, url: `meta://leadgen_form/${d.formId}` }, undefined, text);
        evidence.push({ step: step.n, url: step.url!, text });
        // The customer's next stop after the form: the thank-you button's website.
        if (d.form?.thankYou?.url) await follow(d.form.thankYou.url, target.card);
      } else if (d.type === "messaging") {
        const text = `${d.channel} welcome message:\n${d.welcomeMessage ?? "(no welcome message set)"}`;
        const step = await log.step({ kind: "source", summary: `Read the ${d.channel} welcome message from Meta`, url: `meta://${d.channel}` }, undefined, text);
        evidence.push({ step: step.n, url: step.url!, text });
      } else {
        await log.step({ kind: "note", summary: `Destination "${d.type}" cannot be followed by a browser` });
      }
    }

    await phase("Judging each promise against word-for-word evidence (Muse Wonder + quote check)");
    const firstShot = r.steps.find((s) => s.screenshot);
    const [verdicts, sam] = await Promise.all([
      judge(r, evidence),
      firstShot
        ? samFor(r, log, firstShot.screenshot!, subject, opts.mobile).catch(async (e) => {
            await log.event({ type: "sam_error", error: String(e) });
            return undefined;
          })
        : Promise.resolve(undefined),
    ]);
    r.verdicts = verdicts;
    if (sam) r.sam = sam;
    r.overall = overallOf(verdicts);
    await log.event({ type: "verdicts", verdicts, overall: r.overall });

    const paid = funnels.some((f) => f.paid);
    if (funnels.length && funnels.every((f) => f.blocked)) r.blocked = funnels[0].blocked;
    r.boundary = r.blocked
      ? `Blocked: ${r.blocked}`
      : paid && r.confirmation
        ? "Full test-mode purchase, confirmation page reached"
        : r.confirmation
          ? "Funnel completed to the confirmation page (no payment)"
          : funnels.some((f) => f.stoppedAtPayment)
            ? "Followed to the payment step, not paid"
            : funnels.length
              ? `Followed the funnel to ${shortUrl(lastUrl)}`
              : "Read from Meta only (no website)";

    if (r.overall === "fail") {
      await phase("Proposing one fix (Muse Wonder)");
      r.fix = await proposeFix(r);
      await log.event({ type: "fix_proposed", fix: r.fix });
    }
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    await log.event({ type: "error", error: r.error });
  }
  r.finishedAt = new Date().toISOString();
  log.save();
  await log.event({ type: "run_finished", overall: r.overall, usd: r.usage.usd });
  return { result: r, dir: log.dir };
}

// Baseline for the eval: what a single model call sees (the landing page), no clicking.
// Bot walls often stop headless browsers only. A password page stays a password page.
export function shouldRetryVisible(f: FunnelResult, headful: boolean, opts: Pick<RunOptions, "retryHeadful" | "baseline">): boolean {
  return !!f.blocked && !headful && !!opts.retryHeadful && !opts.baseline && !/password/i.test(f.blocked);
}

// A confirmation page says so near the top. Footers ("thank you for visiting") do not count, a URL
// alone ("/checkout/confirm") is not proof, and a funnel stopped at payment did not submit.
export function confirmationOf(f: FunnelResult, opts: Pick<RunOptions, "submit">): RunResult["confirmation"] {
  const last = f.evidence[f.evidence.length - 1];
  if (!last || f.evidence.length < 2 || f.stoppedAtPayment || !(f.paid || opts.submit !== false)) return undefined;
  const top = last.text.split("\n").filter(Boolean).slice(0, 25).join("\n");
  if (!CONFIRMED.test(top)) return undefined;
  return { url: last.url, text: last.text.split("\n").find((l) => CONFIRMED.test(l))?.trim() ?? "" };
}

async function landingOnly(driver: Driver, log: RunLog): Promise<FunnelResult> {
  const text = await driver.text();
  const step = await log.step({ kind: "action", summary: "Read the landing page only (baseline)", url: driver.url() }, await driver.screenshot(), text);
  return { evidence: [{ step: step.n, url: driver.url(), text }], notes: "", stoppedAtPayment: false, paid: false, stepLimitHit: false };
}

// The main destination plus each carousel card that links somewhere else (max 3 funnels).
function destinations(ad: Ad): { destination: Destination; card?: number }[] {
  const out: { destination: Destination; card?: number }[] = [{ destination: ad.destination }];
  const seen = new Set([key(ad.destination)]);
  (ad.cards ?? []).forEach((c, i) => {
    const k = key(c.destination);
    if (!seen.has(k) && out.length < 3) {
      seen.add(k);
      out.push({ destination: c.destination, card: i });
    }
  });
  return out;
}

function key(d: Destination): string {
  return d.type === "website" || d.type === "app" ? `${d.type}:${d.url.split("?")[0]}` : d.type === "lead_form" ? `form:${d.formId}` : d.type;
}

export function leadFormText(formId: string, form?: LeadForm): string {
  if (!form) return `Instant Form ${formId} (details not readable)`;
  if (form.readError)
    return `Instant Form ${formId}: Meta did not return the form (${form.readError})${
      /permission|page access token|\(#(10|200)\)/i.test(form.readError)
        ? " Reading lead forms needs Page permissions: get a new token with pages_show_list, pages_read_engagement, and pages_manage_ads (offertest init, step 2, answer n to keep the old token)."
        : ""
    }`;
  return [
    `Instant Form: ${form.name ?? formId}`,
    form.intro ? `Intro: ${form.intro}` : "",
    `Questions: ${form.questions.map((q) => q.label || q.key).join(", ") || "(none)"}`,
    form.thankYou
      ? `Thank-you screen: ${[form.thankYou.title, form.thankYou.body].filter(Boolean).join(" / ")}${form.thankYou.buttonText ? ` [button: ${form.thankYou.buttonText} -> ${form.thankYou.url ?? "no link"}]` : ""}`
      : "Thank-you screen: (none)",
    form.privacyUrl ? `Privacy policy: ${form.privacyUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function samFor(r: RunResult, log: RunLog, shot: string, subject: string, mobile?: boolean) {
  const size = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const boxes = await samBoxes(r, log.read(shot), size, [subject || "product", "button"]);
  await log.event({ type: "sam_boxes", boxes });
  return { screenshot: shot, boxes };
}
