#!/usr/bin/env node
import { a as pauseAd, c as CONFIG_DIR, i as listAds, l as CONFIG_ENV, n as getAd, o as VERSION, s as runTest, t as writeReport, u as loadEnv } from "./html-BKzdMDyr.mjs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import path from "node:path";
import http from "node:http";

//#region src/server.ts
const OUT_DIR = "offertest-runs";
const ALLOWED_ORIGINS = ["https://adsmanager.facebook.com", "https://business.facebook.com"];
const tests = /* @__PURE__ */ new Map();
function serve(port = 7777) {
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
function allowedOrigin(origin) {
	return !!origin && (origin.startsWith("chrome-extension://") || ALLOWED_ORIGINS.includes(origin));
}
function cors(req, res) {
	const origin = req.headers.origin;
	if (allowedOrigin(origin)) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Vary", "Origin");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		res.setHeader("Access-Control-Allow-Private-Network", "true");
	}
}
function send(req, res, code, body) {
	if (res.headersSent) return void res.end();
	cors(req, res);
	res.writeHead(code, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store"
	});
	res.end(JSON.stringify(body));
}
function sendFile(req, res, file, type) {
	if (!fs.existsSync(file)) return send(req, res, 404, { error: "Not found" });
	cors(req, res);
	res.writeHead(200, {
		"Content-Type": type,
		"Cache-Control": "no-store"
	});
	fs.createReadStream(file).pipe(res);
}
async function readJson(req) {
	let raw = "";
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > 1e6) throw new Error("Body too large");
	}
	return raw ? JSON.parse(raw) : {};
}
async function handle(req, res) {
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const parts = url.pathname.split("/").filter(Boolean);
	const method = req.method ?? "GET";
	if (method === "OPTIONS") {
		cors(req, res);
		res.writeHead(204);
		res.end();
		return;
	}
	if (req.headers.origin && !allowedOrigin(req.headers.origin)) return send(req, res, 403, { error: "Origin not allowed" });
	if (method === "POST" && !String(req.headers["content-type"] ?? "").includes("application/json")) return send(req, res, 415, { error: "Send Content-Type: application/json" });
	if (method === "GET" && url.pathname === "/health") return send(req, res, 200, {
		ok: true,
		version: VERSION,
		hasModelKey: !!process.env.META_API_KEY,
		hasAdsToken: !!process.env.META_ACCESS_TOKEN
	});
	if (method === "POST" && url.pathname === "/tests") {
		const body = await readJson(req);
		const adId = typeof body.adId === "string" ? body.adId.trim() : void 0;
		const ad = body.ad && typeof body.ad === "object" ? manualAd(body.ad) : void 0;
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
			const rel = parts[3] === "latest" ? t.shot : /^\d+\.jpg$/.test(parts[3]) ? `shots/${parts[3]}` : void 0;
			if (!rel || !t.dir) return send(req, res, 404, { error: "No screenshot yet" });
			return sendFile(req, res, path.join(t.dir, rel), "image/jpeg");
		}
	}
	if (method === "POST" && parts[0] === "ads" && parts[1] && parts[2] === "pause" && parts.length === 3) {
		await pauseAd(parts[1]);
		console.log(`Paused ad ${parts[1]}`);
		return send(req, res, 200, {
			ok: true,
			adId: parts[1],
			status: "PAUSED"
		});
	}
	send(req, res, 404, { error: "Not found" });
}
function manualAd(a) {
	if (!a.destination || typeof a.headline !== "string") return void 0;
	return {
		...a,
		source: a.source ?? "manual",
		headline: a.headline,
		text: a.text ?? "",
		cta: a.cta ?? "Shop now",
		destination: a.destination
	};
}
function start(adId, manual) {
	const id = randomUUID().slice(0, 8);
	const t = {
		id,
		adId,
		headline: manual?.headline,
		status: "running",
		phase: "Starting",
		steps: [],
		startedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	tests.set(id, t);
	console.log(`[${id}] test ${adId ? `ad ${adId}` : `"${manual.headline}"`}`);
	(async () => {
		try {
			let ad = manual;
			if (!ad) {
				t.phase = "Reading the ad from Meta Ads Manager";
				ad = await getAd(adId);
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
					t.steps.push({
						n: s.n,
						kind: s.kind,
						summary: s.summary,
						url: s.url
					});
					if (s.screenshot) t.shot = s.screenshot;
				}
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
		t.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
		console.log(`[${id}] ${t.status}${t.result?.overall ? ` ${t.result.overall.toUpperCase()}` : ""}${t.error ? `: ${t.error}` : ""}`);
	})();
	return id;
}
function view(t) {
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
				return {
					...v,
					claim: a?.claim ?? v.assertionId,
					kind: a?.kind
				};
			}),
			fix: r.fix,
			confirmation: r.confirmation,
			usage: r.usage,
			ad: {
				...r.ad,
				imageUrl: r.ad.imageUrl?.startsWith("data:") ? void 0 : r.ad.imageUrl
			}
		}
	};
}

//#endregion
//#region src/cli.ts
const c = {
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	blue: (s) => `\x1b[34m${s}\x1b[0m`
};
const EXIT = {
	pass: 0,
	fail: 1,
	unresolved: 2,
	error: 3,
	usage: 4
};
const HELP = `${c.bold("offertest")} ${VERSION}: an AI agent follows your Meta ad's funnel like a customer and checks the offer holds.

${c.bold("Usage")}
  offertest check --ad <ad id>                 test one ad from Meta Ads Manager
  offertest check --account <act_123>          test every ad about to launch (paused / in review)
  offertest check --url <landing url> --headline "..." --text "..." [--image ad.png]
  offertest ads [--account <act_123>] [--live] list ads and where they send people
  offertest serve [--port 7777]                local server for the Ads Manager Chrome extension
  offertest init                               save your Meta keys to ~/.offertest/.env
  offertest install-browser                    download Chromium if you have no Chrome

${c.bold("Check options")}
  --cta <text>          ad button text (default "Shop now")
  --live                with --account: test live (ACTIVE) ads instead of ads about to launch
  --pay                 allow a test-mode payment (asks before paying; test stores only)
  --no-submit           do not submit forms (sign-up, lead, booking)
  --pause-failing       pause a failing ad in Ads Manager (asks first)
  --mobile              phone viewport and Facebook in-app browser user agent
  --headful             show the browser
  --max-turns <n>       agent turns per funnel (default 25)
  --max-usd <n>         stop a run above this model cost
  --out <dir>           run folders go here (default ./offertest-runs)
  --json                print result.json paths and verdicts as JSON
  --yes                 answer yes to approval prompts (payment, safety checks, pause)

${c.bold("Exit codes")}  0 pass · 1 fail · 2 unresolved or blocked · 3 error · 4 usage
${c.bold("Env")}  META_API_KEY (Meta Model API) · META_ACCESS_TOKEN (Marketing API, ads_read) · META_AD_ACCOUNT_ID`;
async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	const { values } = parseArgs({
		args: rest,
		allowPositionals: true,
		options: {
			ad: {
				type: "string",
				multiple: true
			},
			account: { type: "string" },
			live: { type: "boolean" },
			url: { type: "string" },
			headline: { type: "string" },
			text: {
				type: "string",
				default: ""
			},
			cta: {
				type: "string",
				default: "Shop now"
			},
			image: { type: "string" },
			pay: { type: "boolean" },
			"no-submit": { type: "boolean" },
			"pause-failing": { type: "boolean" },
			mobile: { type: "boolean" },
			headful: { type: "boolean" },
			"max-turns": { type: "string" },
			"max-usd": { type: "string" },
			out: {
				type: "string",
				default: "offertest-runs"
			},
			json: { type: "boolean" },
			yes: { type: "boolean" },
			port: { type: "string" },
			help: {
				type: "boolean",
				short: "h"
			}
		}
	});
	if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || values.help) return void console.log(HELP);
	if (cmd === "--version" || cmd === "version") return void console.log(VERSION);
	if (cmd === "init") return await init();
	if (cmd === "install-browser") return installBrowser();
	if (cmd === "ads") return await ads(values.account, values.live);
	if (cmd === "serve") return await serve(values.port ? Number(values.port) : void 0);
	if (cmd !== "check") {
		console.error(`Unknown command "${cmd}".\n\n${HELP}`);
		process.exit(EXIT.usage);
	}
	loadEnv();
	if (!process.env.META_API_KEY) {
		console.error(c.red("META_API_KEY is not set. Run `offertest init`, or add it to .env (get a key at https://dev.meta.ai)."));
		process.exit(EXIT.error);
	}
	const tty = process.stdin.isTTY && !values.json;
	const ask = async (q) => {
		if (values.yes) return true;
		if (!tty) return false;
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		const a = await rl.question(`${c.yellow("?")} ${q} ${c.dim("[y/N]")} `);
		rl.close();
		return /^y(es)?$/i.test(a.trim());
	};
	let targets;
	if (values.ad?.length) targets = await Promise.all(values.ad.map(getAd));
	else if (values.account || !values.url && process.env.META_AD_ACCOUNT_ID) targets = await listAds(values.account, values.live ? ["ACTIVE"] : void 0);
	else if (values.url && values.headline) targets = [{
		source: "manual",
		headline: values.headline,
		text: values.text ?? "",
		cta: values.cta ?? "Shop now",
		imageUrl: values.image,
		destination: {
			type: "website",
			url: values.url
		}
	}];
	else {
		console.error(`Give --ad <id>, --account <act_id>, or --url with --headline.\n\n${HELP}`);
		process.exit(EXIT.usage);
	}
	if (!targets.length) {
		console.log("No ads matched.");
		return;
	}
	const opts = {
		outDir: values.out,
		pay: values.pay,
		submit: !values["no-submit"],
		headful: values.headful,
		mobile: values.mobile,
		maxTurns: values["max-turns"] ? Number(values["max-turns"]) : void 0,
		maxUsd: values["max-usd"] ? Number(values["max-usd"]) : void 0,
		approve: async (req) => ask(`${req.title} ${c.dim(req.detail)}`),
		onPhase: (p) => !values.json && console.log(c.blue("●"), p),
		onStep: (s) => !values.json && console.log(c.dim(`  ${String(s.n).padStart(2)} ${s.summary}`))
	};
	const results = [];
	for (const ad of targets) {
		let current = ad;
		let retestOf;
		for (;;) {
			if (!values.json) console.log(`\n${c.bold("OfferTest")} ${current.source === "meta" ? `ad ${current.id} ` : ""}"${current.headline}" -> ${dest(current)}`);
			const { result, dir } = await runTest(current, {
				...opts,
				retestOf
			});
			const report = writeReport(result, dir);
			results.push({
				result,
				report
			});
			if (!values.json) printResult(result, report);
			if (result.overall === "fail" && current.source === "meta" && values["pause-failing"] && current.status === "ACTIVE") {
				if (await ask(`Pause ad ${current.id} in Ads Manager until the offer is fixed?`)) {
					await pauseAd(current.id);
					console.log(c.yellow(`  Paused ad ${current.id}.`));
				}
			}
			if (result.overall !== "fail" || !tty || values.yes) break;
			if (!await ask("Apply the fix, then re-test in a fresh session?")) break;
			retestOf = result.id;
			if (result.fix?.adCopy && await ask("Re-test with the proposed ad copy?")) current = {
				...current,
				...result.fix.adCopy
			};
		}
	}
	if (values.json) console.log(JSON.stringify(results.map(({ result, report }) => ({
		id: result.id,
		ad: result.ad.id ?? result.ad.headline,
		overall: result.overall ?? "error",
		boundary: result.boundary,
		report,
		verdicts: result.verdicts,
		fix: result.fix,
		error: result.error
	})), null, 2));
	const worst = Math.max(...results.map(({ result }) => result.error ? EXIT.error : EXIT[result.overall ?? "unresolved"]));
	process.exit(worst);
}
function dest(ad) {
	const d = ad.destination;
	return d.type === "website" || d.type === "app" ? d.url : d.type === "lead_form" ? `Instant Form ${d.formId}` : d.type === "messaging" ? `${d.channel} chat` : d.type;
}
function printResult(r, report) {
	const badge = r.error ? c.red("ERROR") : r.overall === "pass" ? c.green("PASS") : r.overall === "fail" ? c.red("FAIL") : c.yellow("UNRESOLVED");
	console.log(`\n${c.bold(badge)}  ${r.boundary}  ${c.dim(`$${r.usage.usd.toFixed(2)}`)}`);
	if (r.error) console.log(c.red(`  ${r.error}`));
	for (const v of r.verdicts) {
		const a = r.assertions.find((x) => x.id === v.assertionId);
		const mark = v.status === "supported" ? c.green("✓") : v.status === "contradicted" ? c.red("✗") : c.yellow("?");
		console.log(`  ${mark} ${a?.claim ?? v.assertionId}`);
		console.log(c.dim(`      ad: "${v.adQuote}"${v.pageQuote ? `   funnel: "${v.pageQuote}"` : ""}`));
	}
	if (r.fix) console.log(`\n  ${c.bold("Fix:")} ${r.fix.summary}${r.fix.steps.map((s) => `\n    - ${s}`).join("")}`);
	console.log(`\n  Report: ${report}`);
}
async function ads(account, live) {
	const list = await listAds(account, live ? ["ACTIVE"] : void 0);
	if (!list.length) return void console.log("No ads matched.");
	for (const a of list) console.log(`${a.id}  ${c.dim((a.status ?? "").padEnd(14))} ${a.headline.slice(0, 50).padEnd(50)}  -> ${dest(a)}`);
}
async function init() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	console.log(`Saves keys to ${CONFIG_ENV}. Press Enter to skip one.\n`);
	const key = await rl.question("Meta Model API key (dev.meta.ai): ");
	const token = await rl.question("Meta access token with ads_read (optional, for Ads Manager): ");
	const account = await rl.question("Default ad account id, e.g. act_123 (optional): ");
	rl.close();
	const lines = [
		key && `META_API_KEY=${key.trim()}`,
		token && `META_ACCESS_TOKEN=${token.trim()}`,
		account && `META_AD_ACCOUNT_ID=${account.trim()}`
	].filter(Boolean);
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_ENV, lines.join("\n") + "\n", { mode: 384 });
	console.log(c.green(`\nSaved ${lines.length} value(s). Try: offertest ads`));
}
function installBrowser() {
	const cli = createRequire(import.meta.url).resolve("playwright-core/cli.js");
	const r = spawnSync(process.execPath, [
		cli,
		"install",
		"chromium"
	], { stdio: "inherit" });
	process.exit(r.status ?? 1);
}
main().catch((err) => {
	console.error(c.red(err instanceof Error ? err.message : String(err)));
	process.exit(EXIT.error);
});

//#endregion
export {  };