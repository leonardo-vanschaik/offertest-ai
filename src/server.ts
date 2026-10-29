import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runTest, VERSION } from "./core/run.ts";
import { loadEnv } from "./meta/client.ts";
import { getAd, pauseAd } from "./meta/ads.ts";
import { writeReport } from "./report/html.ts";
import type { Ad, RunResult } from "./types.ts";

// Local bridge for the "OfferTest for Ads Manager" Chrome extension. Binds to 127.0.0.1 only.
// Payments are never allowed here and safety checks are declined automatically.

const OUT_DIR = "offertest-runs";
// The extension's ID is fixed by the "key" in extension/manifest.json. Only it may call the server,
// so another extension or web page cannot start tests or pause ads with the owner's Meta token.
const EXTENSION_ORIGIN = `chrome-extension://${process.env.OFFERTEST_EXTENSION_ID ?? "hfjeehndnoioofnabimflagfndlmddme"}`;

type TestState = {
  id: string;
  adId?: string;
  headline?: string;
  status: "running" | "done" | "error";
  phase: string;
  steps: { n: number; kind: string; summary: string; url?: string }[];
  startedAt: string;
  finishedAt?: string;
  dir?: string;
  shot?: string; // latest screenshot, relative to dir: "shots/003.jpg"
  report?: string; // absolute path to report.html
  result?: RunResult;
  error?: string;
};

const tests = new Map<string, TestState>();

export function serve(port = 7777): Promise<void> {
  loadEnv();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => send(req, res, 500, { error: err instanceof Error ? err.message : String(err) }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.log(`OfferTest server on http://127.0.0.1:${port} (Ctrl+C to stop)`);
      resolve();
    });
  });
}

function allowedOrigin(origin?: string): boolean {
  return origin === EXTENSION_ORIGIN;
}

function cors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin;
  if (allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin!);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function send(req: http.IncomingMessage, res: http.ServerResponse, code: number, body: unknown) {
  if (res.headersSent) return void res.end();
  cors(req, res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, type: string) {
  if (!fs.existsSync(file)) return send(req, res, 404, { error: "Not found" });
  cors(req, res);
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    cors(req, res);
    res.writeHead(204);
    return void res.end();
  }
  // Other web pages must not start tests or pause ads: refuse foreign origins, and require JSON
  // on POST so a cross-site form cannot send a "simple" request.
  if (req.headers.origin && !allowedOrigin(req.headers.origin)) return send(req, res, 403, { error: "Origin not allowed" });
  // Requests that act (start a test, pause an ad) must come from the OfferTest extension.
  if (method === "POST" && !allowedOrigin(req.headers.origin)) return send(req, res, 403, { error: "Only the OfferTest extension may do this" });
  if (method === "POST" && !String(req.headers["content-type"] ?? "").includes("application/json"))
    return send(req, res, 415, { error: "Send Content-Type: application/json" });

  if (method === "GET" && url.pathname === "/health")
    return send(req, res, 200, { ok: true, version: VERSION, hasModelKey: !!process.env.META_API_KEY, hasAdsToken: !!process.env.META_ACCESS_TOKEN });

  if (method === "POST" && url.pathname === "/tests") {
    const body = await readJson(req);
    const adId = typeof body.adId === "string" ? body.adId.trim() : undefined;
    const ad = body.ad && typeof body.ad === "object" ? manualAd(body.ad as Partial<Ad>) : undefined;
    if (!adId && !ad) return send(req, res, 400, { error: "Send { adId } or { ad }" });
    return send(req, res, 200, { id: start(adId, ad) });
  }

  if (parts[0] === "tests" && parts[1] && method === "GET") {
    const t = tests.get(parts[1]);
    if (!t) return send(req, res, 404, { error: "Unknown test" });
    if (parts.length === 2) return send(req, res, 200, view(t));
    if (parts[2] === "report" && parts.length === 3) {
      if (!t.report) return send(req, res, 404, { error: "Report not ready" });
      return sendFile(req, res, t.report, "text/html; charset=utf-8");
    }
    if (parts[2] === "shots" && parts[3] && parts.length === 4) {
      // "latest" (live view) or a file name like 003.jpg; never a path.
      const rel = parts[3] === "latest" ? t.shot : /^\d+\.jpg$/.test(parts[3]) ? `shots/${parts[3]}` : undefined;
      if (!rel || !t.dir) return send(req, res, 404, { error: "No screenshot yet" });
      return sendFile(req, res, path.join(t.dir, rel), "image/jpeg");
    }
  }

  if (method === "POST" && parts[0] === "ads" && parts[1] && parts[2] === "pause" && parts.length === 3) {
    await pauseAd(parts[1]);
    console.log(`Paused ad ${parts[1]}`);
    return send(req, res, 200, { ok: true, adId: parts[1], status: "PAUSED" });
  }

  send(req, res, 404, { error: "Not found" });
}

function manualAd(a: Partial<Ad>): Ad | undefined {
  if (!a.destination || typeof a.headline !== "string") return undefined;
  return { ...a, source: a.source ?? "manual", headline: a.headline, text: a.text ?? "", cta: a.cta ?? "Shop now", destination: a.destination };
}

function start(adId: string | undefined, manual: Ad | undefined): string {
  const id = randomUUID().slice(0, 8);
  const t: TestState = { id, adId, headline: manual?.headline, status: "running", phase: "Starting", steps: [], startedAt: new Date().toISOString() };
  tests.set(id, t);
  console.log(`[${id}] test ${adId ? `ad ${adId}` : `"${manual!.headline}"`}`);

  (async () => {
    try {
      let ad = manual;
      if (!ad) {
        t.phase = "Reading the ad from Meta Ads Manager";
        ad = await getAd(adId!);
      }
      t.headline = ad.headline;
      const { result, dir } = await runTest(ad, {
        outDir: OUT_DIR,
        pay: false,
        approve: async () => false,
        onPhase: (p) => {
          t.phase = p;
          console.log(`[${id}] ${p}`);
        },
        onStep: (s, r) => {
          t.dir = path.resolve(OUT_DIR, r.id);
          t.steps.push({ n: s.n, kind: s.kind, summary: s.summary, url: s.url });
          if (s.screenshot) t.shot = s.screenshot;
        },
      });
      t.dir = dir;
      t.result = result;
      try {
        t.report = writeReport(result, dir);
      } catch (err) {
        console.error(`[${id}] report failed: ${err instanceof Error ? err.message : err}`);
      }
      t.error = result.error;
      t.status = result.error ? "error" : "done";
      t.phase = result.error ? "Stopped with an error" : "Done";
    } catch (err) {
      t.error = err instanceof Error ? err.message : String(err);
      t.status = "error";
      t.phase = "Stopped with an error";
    }
    t.finishedAt = new Date().toISOString();
    console.log(`[${id}] ${t.status}${t.result?.overall ? ` ${t.result.overall.toUpperCase()}` : ""}${t.error ? `: ${t.error}` : ""}`);
  })();
  return id;
}

// What the side panel needs: progress while running, the verdicts with quotes when done.
function view(t: TestState) {
  const r = t.result;
  return {
    id: t.id,
    adId: t.adId ?? r?.ad.id,
    headline: t.headline,
    status: t.status,
    phase: t.phase,
    steps: t.steps,
    hasShot: !!t.shot,
    hasReport: !!t.report,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    error: t.error,
    result: r && {
      runId: r.id,
      overall: r.overall,
      boundary: r.boundary,
      blocked: r.blocked,
      error: r.error,
      verdicts: r.verdicts.map((v) => {
        const a = r.assertions.find((x) => x.id === v.assertionId);
        return { ...v, claim: a?.claim ?? v.assertionId, kind: a?.kind };
      }),
      fix: r.fix,
      confirmation: r.confirmation,
      usage: r.usage,
      ad: { ...r.ad, imageUrl: r.ad.imageUrl?.startsWith("data:") ? undefined : r.ad.imageUrl },
    },
  };
}
