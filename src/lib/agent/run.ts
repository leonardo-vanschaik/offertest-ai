import { randomUUID } from "node:crypto";
import { applyFix, getConfig, getOrder } from "@/lib/store";
import { appendLog, getRun, newRunId, pushStep, saveRun } from "@/lib/runs/store";
import type { Approval, ApprovalKind, NewRunInput, Run } from "@/lib/types";
import { extractAssertions } from "./assertions";
import { Driver } from "./driver";
import { proposeFix } from "./fix";
import { judge } from "./judge";
import { overallOf, type Evidence } from "./quotes";
import { samBoxes } from "./sam";
import { shop } from "./shop";

export type RunOptions = {
  // undefined: a human decides in the dashboard. true/false: decided automatically (eval, scripted demo).
  autoApprove?: { payment?: boolean; fix?: boolean; safety?: boolean };
};

const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000;

export async function createRun(input: NewRunInput): Promise<Run> {
  const run: Run = {
    id: newRunId(),
    createdAt: new Date().toISOString(),
    parentRunId: input.parentRunId,
    mode: input.mode ?? "agent",
    status: "queued",
    phase: "Queued",
    ad: input.ad,
    landingUrl: input.landingUrl,
    allowPayment: input.allowPayment,
    assertions: [],
    steps: [],
    approvals: [],
    verdicts: [],
    boundary: "Not tested yet",
    usage: { inputTokens: 0, outputTokens: 0, images: 0, usd: 0 },
  };
  await saveRun(run);
  await appendLog(run.id, { type: "run_created", input: { ...input, ad: { ...input.ad, imageUrl: input.ad.imageUrl ? "(image)" : undefined } } });
  return run;
}

// Used by the eval harness and scripts: runs to completion (fix step only if autoApprove.fix is true).
export async function executeRun(input: NewRunInput, opts: RunOptions = {}): Promise<Run> {
  const run = await createRun(input);
  await processRun(run, opts);
  return run;
}

// Used by the API: returns at once, the run continues in the background.
export async function startRun(input: NewRunInput, opts: RunOptions = {}): Promise<Run> {
  const run = await createRun(input);
  void processRun(run, opts).catch(() => {});
  return run;
}

async function waitForDecision(run: Run, approval: Approval): Promise<Approval> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const disk = await getRun(run.id);
    const a = disk?.approvals.find((x) => x.id === approval.id);
    if (a && a.status !== "pending") {
      Object.assign(approval, a);
      return approval;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  approval.status = "declined";
  approval.decidedAt = new Date().toISOString();
  return approval;
}

export async function processRun(run: Run, opts: RunOptions = {}): Promise<void> {
  const persist = () => saveRun(run);
  const setPhase = async (status: Run["status"], phase: string) => {
    run.status = status;
    run.phase = phase;
    await persist();
    await appendLog(run.id, { type: "phase", status, phase });
  };

  const askApproval = async (kind: ApprovalKind, title: string, detail: string): Promise<Approval> => {
    const approval: Approval = { id: randomUUID().slice(0, 8), kind, status: "pending", title, detail, createdAt: new Date().toISOString() };
    run.approvals.push(approval);
    pushStep(run, { kind: "approval", summary: `Approval requested: ${title}` });
    await appendLog(run.id, { type: "approval_requested", approvalId: approval.id, kind, title, detail });
    const auto = kind === "payment" ? opts.autoApprove?.payment : kind === "fix" ? opts.autoApprove?.fix : opts.autoApprove?.safety;
    const prev = { status: run.status, phase: run.phase };
    if (auto !== undefined) {
      approval.status = auto ? "approved" : "declined";
      approval.decidedAt = new Date().toISOString();
      await appendLog(run.id, { type: "approval_decided", approvalId: approval.id, kind, decision: approval.status, by: "auto" });
    } else {
      await setPhase("awaiting_approval", `Waiting for your approval: ${title}`);
      await waitForDecision(run, approval);
    }
    pushStep(run, { kind: "approval", summary: `${approval.status === "approved" ? "Approved" : "Declined"}: ${title}` });
    await setPhase(prev.status, prev.phase);
    return approval;
  };

  const driver = new Driver();
  try {
    run.scenario = (await getConfig()).scenario;
    await appendLog(run.id, { type: "store_scenario", scenario: run.scenario, note: "for the operator; never shown to the agent" });

    await setPhase("extracting", "Turning the ad into testable promises (Muse Spark)");
    run.assertions = await extractAssertions(run);
    await appendLog(run.id, { type: "assertions", assertions: run.assertions });
    await persist();

    let evidence: Evidence[] = [];
    let report = "";
    let stoppedAtPayment = false;
    let paid = false;
    await driver.start(run.landingUrl);

    if (run.mode === "one_call") {
      await setPhase("judging", "One model call on the landing page (baseline)");
      const jpg = await driver.screenshot();
      const step = pushStep(run, { kind: "action", summary: "Read the landing page only", url: driver.url() });
      const { saveShot } = await import("@/lib/runs/store");
      step.screenshot = await saveShot(run.id, step.n, jpg);
      evidence = [{ step: step.n, url: driver.url(), text: await driver.text() }];
      report = "(Baseline: one look at the landing page, no shopping.)";
    } else {
      await setPhase("shopping", "Shopping the store like a customer (Muse Wonder · computer use)");
      const r = await shop(run, driver, { persist, askApproval });
      evidence = r.evidence;
      report = r.report;
      stoppedAtPayment = r.stoppedAtPayment;
      paid = r.paid;
    }
    const finalUrl = driver.url();
    await driver.close();

    await setPhase("judging", "Judging each promise against verbatim evidence (Muse Wonder + quote gate)");
    const productShot = run.steps.find((s) => s.screenshot && /\/store\/products\//.test(s.url ?? ""));
    const [verdicts, sam] = await Promise.all([
      judge(run, evidence, report),
      productShot && run.mode === "agent" ? samFor(run, productShot.screenshot!).catch(async (e) => {
        await appendLog(run.id, { type: "sam_error", error: String(e) });
        return undefined;
      }) : Promise.resolve(undefined),
    ]);
    run.verdicts = verdicts;
    if (sam) run.sam = sam;
    run.overall = overallOf(verdicts);
    await appendLog(run.id, { type: "verdicts", verdicts, overall: run.overall });

    const orderId = finalUrl.match(/\/store\/order\/(AT-\d+)/)?.[1];
    if (orderId) {
      const order = await getOrder(orderId);
      run.order = { id: orderId, totalCents: order?.priced.totalCents ?? 0, confirmedInAdmin: !!order };
      await appendLog(run.id, { type: "order_check", orderId, foundInAdmin: !!order });
    }
    run.boundary =
      run.mode === "one_call"
        ? "One look at the landing page, no shopping"
        : run.order?.confirmedInAdmin
          ? "Full test-mode purchase on the owned store (no real money)"
          : paid || stoppedAtPayment || !run.allowPayment
            ? "Tested up to payment, not paid"
            : "Tested up to the cart and checkout";
    await persist();

    if (run.overall === "fail" && run.mode === "agent" && opts.autoApprove?.fix !== false) {
      await setPhase("proposing_fix", "Proposing one fix for the owner to approve (Muse Wonder)");
      const proposal = await proposeFix(run, await getConfig());
      run.fix = { ...proposal, status: "proposed", approvalId: "" };
      await appendLog(run.id, { type: "fix_proposed", fix: run.fix });
      await persist();
      const approval = await askApproval("fix", proposal.summary, proposal.rationale);
      run.fix.approvalId = approval.id;
      if (approval.status === "approved") {
        run.fix.status = "approved";
        if (proposal.storeFix) {
          await applyFix(proposal.storeFix);
          await appendLog(run.id, { type: "fix_applied", storeFix: proposal.storeFix });
        }
        run.fix.status = "applied";
        const retest = await createRun({
          ad: proposal.adCopy ? { ...run.ad, ...proposal.adCopy } : run.ad,
          landingUrl: run.landingUrl,
          allowPayment: run.allowPayment,
          parentRunId: run.id,
        });
        run.fix.retestRunId = retest.id;
        await appendLog(run.id, { type: "retest_started", retestRunId: retest.id });
        await persist();
        const child = processRun(retest, opts);
        if (opts.autoApprove) await child;
        else void child.catch(() => {});
      } else {
        run.fix.status = "declined";
      }
    }

    run.finishedAt = new Date().toISOString();
    await setPhase("done", run.overall === "pass" ? "Passed: the ad's promise holds" : run.overall === "fail" ? "Failed: the store breaks the ad's promise" : "Unresolved: not enough evidence");
  } catch (err) {
    await driver.close();
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    await appendLog(run.id, { type: "error", error: run.error });
    await setPhase("error", "Error");
  }
}

async function samFor(run: Run, shotUrl: string) {
  const fs = await import("node:fs/promises");
  const { shotPath } = await import("@/lib/runs/store");
  const file = shotUrl.split("/").pop()!;
  const jpg = await fs.readFile(shotPath(run.id, file));
  const product = run.assertions.find((a) => a.conditions.product)?.conditions.product ?? "product";
  const noun = product.trim().split(/\s+/).pop()!.toLowerCase();
  const boxes = await samBoxes(run, jpg, [noun, "add to cart button"]);
  await appendLog(run.id, { type: "sam_boxes", boxes });
  return { screenshot: shotUrl, boxes };
}
