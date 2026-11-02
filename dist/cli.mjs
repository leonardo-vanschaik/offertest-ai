#!/usr/bin/env node
import { c as runTest, d as agentCheckout, f as CONFIG_DIR, i as listAdIds, l as acpCheckout, m as loadEnv, n as getAd, o as pauseAd, p as CONFIG_ENV, s as VERSION, t as writeReport, u as itemFromUrl } from "./html.mjs";
import { createRequire } from "node:module";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import http from "node:http";
import { fileURLToPath } from "node:url";

//#region src/server.ts
const OUT_DIR = "offertest-runs";
const EXTENSION_ORIGIN = `chrome-extension://${process.env.OFFERTEST_EXTENSION_ID ?? "hfjeehndnoioofnabimflagfndlmddme"}`;
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
	return origin === EXTENSION_ORIGIN;
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
	if (method === "POST" && !allowedOrigin(req.headers.origin)) return send(req, res, 403, { error: "Only the OfferTest extension may do this" });
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
//#region src/onboarding.ts
const c$1 = {
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	blue: (s) => `\x1b[34m${s}\x1b[0m`
};
const ok = (s) => console.log(`  ${c$1.green("✓")} ${s}`);
const bad = (s) => console.log(`  ${c$1.red("✗")} ${s}`);
const warn = (s) => console.log(`  ${c$1.yellow("!")} ${s}`);
const info = (s) => console.log(`    ${c$1.dim(s)}`);
const PAGE_SCOPES = [
	"pages_show_list",
	"pages_read_engagement",
	"pages_manage_ads"
];
const LINKS = {
	metaApiKeys: "https://dev.meta.ai",
	createApp: "https://developers.facebook.com/apps/creation/",
	myApps: "https://developers.facebook.com/apps/",
	explorer: "https://developers.facebook.com/tools/explorer/",
	tokenDebugger: "https://developers.facebook.com/tools/debug/accesstoken/",
	adsManager: "https://adsmanager.facebook.com/adsmanager/manage/ads"
};
const GRAPH = () => `${process.env.META_GRAPH_URL ?? "https://graph.facebook.com"}/${process.env.META_GRAPH_VERSION ?? "v24.0"}`;
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = path.join(PKG_ROOT, "skills", "offertest");
function openUrl(url) {
	const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? [
		"/c",
		"start",
		"",
		url
	] : [url];
	try {
		spawn(cmd, args, {
			stdio: "ignore",
			detached: true
		}).unref();
	} catch {}
}
function readEnvFile() {
	if (!fs.existsSync(CONFIG_ENV)) return {};
	return Object.fromEntries(fs.readFileSync(CONFIG_ENV, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter((m) => !!m).map((m) => [m[1], m[2]]));
}
function saveEnv(values) {
	const merged = {
		...readEnvFile(),
		...Object.fromEntries(Object.entries(values).filter(([, v]) => v))
	};
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_ENV, Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 384 });
	for (const [k, v] of Object.entries(merged)) process.env[k] = v;
}
async function checkModelKey(key) {
	const base = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
	const headers = {
		authorization: `Bearer ${key}`,
		"content-type": "application/json"
	};
	const rejected = {
		ok: false,
		detail: "Meta rejected this key. Copy it again from dev.meta.ai."
	};
	const unsure = (status) => ({
		ok: false,
		inconclusive: true,
		detail: status === 429 ? "Meta is rate-limiting right now (429). Try again in a minute." : `Meta's API answered ${status}. It may be down; try again shortly.`
	});
	try {
		const res = await fetch(`${base}/models`, { headers });
		if (res.status === 401 || res.status === 403) return rejected;
		if (res.ok) {
			const ids = (await res.json().catch(() => ({}))).data?.map((m) => m.id) ?? [];
			const wonder = ids.some((id) => id.startsWith("muse-wonder"));
			return {
				ok: true,
				detail: ids.length ? `${ids.length} models${wonder ? ", including Muse Wonder" : " (Muse Wonder not listed: the agent may not run)"}` : "key accepted"
			};
		}
		if (res.status !== 404) return unsure(res.status);
		const probe = await fetch(`${base}/chat/completions`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				model: process.env.OFFERTEST_SPARK_MODEL ?? "muse-spark-1.3",
				messages: [{
					role: "user",
					content: "ok"
				}],
				max_tokens: 1
			})
		});
		if (probe.status === 401 || probe.status === 403) return rejected;
		if (probe.ok) return {
			ok: true,
			detail: "key works (test call to Muse Spark)"
		};
		return unsure(probe.status);
	} catch (e) {
		return {
			ok: false,
			inconclusive: true,
			detail: `Could not reach ${base}: ${e.message}`
		};
	}
}
async function checkAdsToken(token) {
	try {
		const me = await (await fetch(`${GRAPH()}/me?fields=id,name&access_token=${encodeURIComponent(token)}`)).json();
		if (me.error) return {
			valid: false,
			scopes: [],
			scopesKnown: false,
			error: me.error.message
		};
		const dbg = await (await fetch(`${GRAPH()}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`)).json();
		if (dbg.error || !dbg.data) return {
			valid: true,
			userName: me.name,
			scopes: [],
			scopesKnown: false
		};
		return {
			valid: true,
			userName: me.name,
			appId: dbg.data.app_id,
			expiresAt: dbg.data.expires_at || void 0,
			scopes: dbg.data.scopes ?? [],
			scopesKnown: true
		};
	} catch (e) {
		return {
			valid: false,
			scopes: [],
			scopesKnown: false,
			error: e.message
		};
	}
}
async function adAccounts(token) {
	return ((await (await fetch(`${GRAPH()}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${encodeURIComponent(token)}`)).json()).data ?? []).map((a) => ({
		id: a.id,
		name: a.name,
		status: a.account_status,
		currency: a.currency
	}));
}
async function extendToken(token, appId, appSecret) {
	const url = `${GRAPH()}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(token)}`;
	const res = await (await fetch(url)).json();
	return res.access_token ? { token: res.access_token } : { error: res.error?.message ?? "no token returned" };
}
async function browserReady() {
	for (const channel of [
		"chrome",
		"msedge",
		void 0
	]) try {
		await (await chromium.launch({
			headless: true,
			...channel ? { channel } : {}
		})).close();
		return channel === "chrome" ? "Google Chrome" : channel === "msedge" ? "Microsoft Edge" : "Playwright Chromium";
	} catch {}
	return null;
}
function installChromium() {
	const cli = createRequire(import.meta.url).resolve("playwright-core/cli.js");
	return spawnSync(process.execPath, [
		cli,
		"install",
		"chromium"
	], { stdio: "inherit" }).status === 0;
}
function hasCommand(cmd) {
	try {
		execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
const SKILL_TARGETS = [
	{
		name: "Muse Code",
		detect: () => hasCommand("muse"),
		installed: () => fs.existsSync(path.join(os.homedir(), ".agents", "skills", "offertest", "SKILL.md")),
		install: () => {
			if (spawnSync("muse", [
				"skills",
				"install",
				SKILL_DIR,
				"--scope",
				"user",
				"--force"
			], { stdio: "inherit" }).status !== 0) throw new Error("muse skills install failed");
		}
	},
	{
		name: "Claude Code",
		detect: () => fs.existsSync(path.join(os.homedir(), ".claude")),
		installed: () => fs.existsSync(path.join(os.homedir(), ".claude", "skills", "offertest", "SKILL.md")),
		install: () => fs.cpSync(SKILL_DIR, path.join(os.homedir(), ".claude", "skills", "offertest"), { recursive: true })
	},
	{
		name: "Codex",
		detect: () => fs.existsSync(path.join(os.homedir(), ".codex")),
		installed: () => fs.existsSync(path.join(os.homedir(), ".agents", "skills", "offertest", "SKILL.md")),
		install: () => fs.cpSync(SKILL_DIR, path.join(os.homedir(), ".agents", "skills", "offertest"), { recursive: true })
	}
];
const fmtDate = (sec) => sec ? (/* @__PURE__ */ new Date(sec * 1e3)).toISOString().slice(0, 10) : "never";
async function init() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	const ask = async (q) => (await rl.question(`${c$1.yellow("?")} ${q} `)).trim();
	const yes = async (q, def = true) => {
		const a = (await ask(`${q} ${c$1.dim(def ? "[Y/n]" : "[y/N]")}`)).toLowerCase();
		return a ? a.startsWith("y") : def;
	};
	const expiresSoon = (t) => !!t.expiresAt && t.expiresAt * 1e3 - Date.now() < 3 * 864e5;
	const offerExtend = async (tok, t) => {
		warn(`This token expires soon (${fmtDate(t.expiresAt)}). OfferTest can extend it to 60 days.`);
		info(`Find the App Secret at ${LINKS.myApps} > your app > App settings > Basic > App secret > Show.`);
		const secret = await ask("Paste the App Secret to extend the token (Enter to skip):");
		if (!secret || !t.appId) return void 0;
		const ext = await extendToken(tok, t.appId, secret);
		if (!ext.token) {
			bad(`Could not extend: ${ext.error}`);
			return;
		}
		ok(`Extended. The token now lasts until ${fmtDate((await checkAdsToken(ext.token)).expiresAt)}.`);
		return ext.token;
	};
	loadEnv();
	const saved = readEnvFile();
	console.log(`\n${c$1.bold("OfferTest setup")}  ${c$1.dim(`(saves to ${CONFIG_ENV})`)}\n`);
	console.log(`${c$1.bold("Step 1 of 4: Meta Model API key")}  ${c$1.dim("runs the AI: Muse Wonder, Muse Spark, SAM 3.1")}`);
	let key = saved.META_API_KEY ?? process.env.META_API_KEY;
	if (key) {
		const r = await checkModelKey(key);
		if (r.ok) {
			ok(`A working key is saved: ${r.detail}`);
			if (!await yes("Keep it?")) key = void 0;
		} else if (r.inconclusive) {
			warn(`Could not check the saved key: ${r.detail}`);
			if (!await yes("Keep the saved key for now?")) key = void 0;
		} else {
			bad(`The saved key no longer works: ${r.detail}`);
			key = void 0;
		}
	}
	while (!key) {
		info(`1. Open ${LINKS.metaApiKeys} and sign in.`);
		info("2. Create an API key. Hackathon participants: claim the $150 credits there too.");
		info("3. Copy the key and paste it here.");
		if (await yes("Open dev.meta.ai in your browser now?")) openUrl(LINKS.metaApiKeys);
		const pasted = await ask("Paste your Meta Model API key:");
		if (!pasted) break;
		const r = await checkModelKey(pasted);
		if (r.ok) {
			ok(`Key works: ${r.detail}`);
			key = pasted;
			saveEnv({ META_API_KEY: key });
		} else if (r.inconclusive) {
			warn(r.detail);
			if (await yes("Save this key anyway and check it later with `offertest doctor`?", false)) {
				key = pasted;
				saveEnv({ META_API_KEY: key });
			}
		} else bad(r.detail);
	}
	if (!key) warn("No model key yet. Run `offertest init` again when you have it.");
	console.log(`\n${c$1.bold("Step 2 of 4: Connect Meta Ads Manager")}  ${c$1.dim("optional: lets OfferTest read your ads and pause broken ones")}`);
	let token = saved.META_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
	if (token) {
		const t = await checkAdsToken(token);
		if (!t.valid) {
			warn(`The saved token no longer works: ${t.error}`);
			token = void 0;
		} else {
			ok(`Connected as ${t.userName}. Token expires: ${fmtDate(t.expiresAt)}.`);
			const noRead = t.scopesKnown && !t.scopes.includes("ads_read") && !t.scopes.includes("ads_management");
			if (noRead) warn("The saved token cannot read ads (no ads_read). Get a new one below.");
			if (!noRead && t.scopesKnown && !PAGE_SCOPES.every((p) => t.scopes.includes(p))) info(`To read lead ad forms, the token also needs ${PAGE_SCOPES.join(", ")}. Answer n to get a new token with them.`);
			if (noRead || !await yes("Keep this token?")) token = void 0;
			else if (expiresSoon(t)) {
				const ext = await offerExtend(token, t);
				if (ext) {
					token = ext;
					saveEnv({ META_ACCESS_TOKEN: token });
				}
			}
		}
	}
	if (!token && await yes("Connect Ads Manager now? (about 3 minutes)")) {
		console.log(`
    ${c$1.bold("A. Create a Meta app")} (once)
      1. Open ${LINKS.createApp}
      2. Choose "Other", then app type "Business". Name it "OfferTest". Create it.
      3. On the app dashboard, find "Marketing API" and click "Set up".
         No App Review or business verification is needed to read your own ad account.

    ${c$1.bold("B. Get a token")}
      1. Open ${LINKS.explorer}
      2. In "Meta App", pick your OfferTest app.
      3. Under "Permissions", add ${c$1.bold("ads_read")}, ${c$1.bold("ads_management")} (to pause broken ads),
         and for lead ads (Instant Forms): ${c$1.bold("pages_show_list")}, ${c$1.bold("pages_read_engagement")}, ${c$1.bold("pages_manage_ads")}.
      4. Click "Generate Access Token", approve, and copy the token.
`);
		if (await yes("Open the app page and the Graph API Explorer now?")) {
			openUrl(LINKS.createApp);
			setTimeout(() => openUrl(LINKS.explorer), 800);
		}
		while (!token) {
			const pasted = await ask("Paste the access token (Enter to skip):");
			if (!pasted) break;
			const t = await checkAdsToken(pasted);
			if (!t.valid) {
				bad(`Meta rejected this token: ${t.error}`);
				continue;
			}
			ok(`Connected as ${t.userName}.`);
			if (!t.scopesKnown) warn("Could not read this token's permissions. If ads fail to load, make sure it has ads_read.");
			else {
				if (!t.scopes.includes("ads_read") && !t.scopes.includes("ads_management")) {
					bad("This token has no ads_read permission. Add it in the Explorer, generate a new token, and paste that one.");
					continue;
				}
				if (!t.scopes.includes("ads_management")) info("Without ads_management, OfferTest can read ads but cannot pause them. That is fine.");
				if (!PAGE_SCOPES.every((p) => t.scopes.includes(p))) info(`For lead ads (Instant Forms), also add ${PAGE_SCOPES.join(", ")} so OfferTest can read the form.`);
			}
			token = pasted;
			if (expiresSoon(t)) token = await offerExtend(pasted, t) ?? pasted;
			saveEnv({ META_ACCESS_TOKEN: token });
		}
	}
	if (token) {
		const accounts = await adAccounts(token);
		if (!accounts.length) warn("This token sees no ad accounts. Use the Facebook profile that has access to your ad account.");
		else {
			console.log("");
			accounts.forEach((a, i) => console.log(`    ${c$1.bold(String(i + 1))}. ${a.name}  ${c$1.dim(`${a.id} · ${a.currency}${a.status === 1 ? "" : " · not active"}`)}`));
			const current = process.env.META_AD_ACCOUNT_ID;
			const pick = await ask(`Default ad account (1-${accounts.length})${current ? `, Enter keeps ${current}` : ""}:`);
			const chosen = accounts[Number(pick) - 1] ?? (accounts.length === 1 && !current ? accounts[0] : void 0);
			if (chosen) {
				saveEnv({ META_AD_ACCOUNT_ID: chosen.id });
				ok(`Default ad account: ${chosen.name} (${chosen.id})`);
			}
		}
	}
	console.log(`\n${c$1.bold("Step 3 of 4: Browser")}  ${c$1.dim("the agent shops in a real browser")}`);
	const browser = await browserReady();
	if (browser) ok(`Using ${browser}.`);
	else if (await yes("No browser found. Download Chromium now? (about 150 MB)")) if (installChromium()) ok("Chromium installed.");
	else bad("The download failed. Install Google Chrome, or run `npx offertest install-browser` later.");
	console.log(`\n${c$1.bold("Step 4 of 4: Use it from your coding agent")}  ${c$1.dim("optional")}`);
	const found = SKILL_TARGETS.filter((t) => t.detect());
	if (!found.length) info("No Muse Code, Claude Code, or Codex found. You can install the skill later: see docs/SETUP.md.");
	for (const t of found) {
		if (t.installed()) {
			ok(`${t.name}: skill already installed.`);
			continue;
		}
		if (await yes(`Install the OfferTest skill into ${t.name}?`)) try {
			t.install();
			ok(`${t.name}: installed. Ask it: "Check the ads I'm about to launch."`);
		} catch (e) {
			bad(`${t.name}: ${e.message}`);
		}
	}
	rl.close();
	console.log(`\n${c$1.green(c$1.bold("Done."))} Try one of these:`);
	if (process.env.META_ACCESS_TOKEN) console.log(`  offertest ads                     ${c$1.dim("see your ads and where they send people")}`);
	if (process.env.META_ACCESS_TOKEN) console.log(`  offertest check                   ${c$1.dim("test every ad that is about to launch")}`);
	console.log(`  offertest check --url <page> --headline "..." --text "..."`);
	console.log(`  offertest doctor                  ${c$1.dim("check the setup at any time")}\n`);
}
async function doctor() {
	loadEnv();
	let problems = 0;
	const fail = (s, fix) => {
		problems++;
		bad(s);
		info(`Fix: ${fix}`);
	};
	console.log(`\n${c$1.bold("OfferTest doctor")}\n`);
	if (Number(process.versions.node.split(".")[0]) >= 22) ok(`Node ${process.versions.node}`);
	else fail(`Node ${process.versions.node} is too old`, "install Node 22 or newer from https://nodejs.org");
	const key = process.env.META_API_KEY;
	if (!key) fail("No Meta Model API key", "run `offertest init` (step 1)");
	else {
		const r = await checkModelKey(key);
		if (r.ok && /not listed/.test(r.detail)) fail(`Meta Model API key works, but ${r.detail}`, "check that your Meta account has access to muse-wonder-1.0 on dev.meta.ai");
		else if (r.ok) ok(`Meta Model API key: ${r.detail}`);
		else if (r.inconclusive) fail(`Meta Model API key not checked: ${r.detail}`, "run `offertest doctor` again in a minute");
		else fail(`Meta Model API key: ${r.detail}`, "run `offertest init` and paste a new key");
	}
	const token = process.env.META_ACCESS_TOKEN;
	if (!token) warn("Ads Manager not connected (optional). To test ads by id or account: `offertest init` (step 2).");
	else {
		const t = await checkAdsToken(token);
		if (!t.valid) fail(`Ads Manager token: ${t.error}`, "run `offertest init` (step 2) to get a new token");
		else {
			const days = t.expiresAt ? Math.round((t.expiresAt * 1e3 - Date.now()) / 864e5) : null;
			ok(`Ads Manager: connected as ${t.userName}${days === null ? ", token never expires" : `, token expires in ${days} day(s)`}`);
			if (days !== null && days < 7) warn("The token expires soon. Run `offertest init` to extend it.");
			if (!t.scopesKnown) warn("Could not read the token's permissions (debug_token failed).");
			else {
				if (!t.scopes.includes("ads_read") && !t.scopes.includes("ads_management")) fail("The token lacks ads_read", `add ads_read in ${LINKS.explorer} and generate a new token`);
				if (!t.scopes.includes("ads_management")) info("No ads_management: OfferTest cannot pause ads (reading works).");
				const missing = PAGE_SCOPES.filter((p) => !t.scopes.includes(p));
				if (missing.length) info(`No ${missing.join(", ")}: lead ad forms may not be readable (other ads work).`);
			}
			const acct = process.env.META_AD_ACCOUNT_ID;
			const accounts = await adAccounts(token);
			if (acct && !accounts.some((a) => a.id === acct || a.id === `act_${acct}`)) fail(`This token cannot see ad account ${acct}`, "run `offertest init` and pick an account from the list");
			else if (acct) ok(`Default ad account: ${accounts.find((a) => a.id === acct || a.id === `act_${acct}`)?.name} (${acct})`);
			else warn(`No default ad account. Pass --account act_<id> or pick one in \`offertest init\`. Accounts this token sees: ${accounts.length}`);
		}
	}
	const browser = await browserReady();
	if (browser) ok(`Browser: ${browser}`);
	else fail("No browser found", "install Google Chrome, or run `npx offertest install-browser`");
	const skills = SKILL_TARGETS.filter((t) => t.detect());
	for (const t of skills) (t.installed() ? ok : warn)(`${t.name}: skill ${t.installed() ? "installed" : "not installed (optional): run `offertest init` (step 4)"}`);
	console.log(problems ? `\n${c$1.red(`${problems} problem(s).`)} Fix them, then run \`offertest doctor\` again.\n` : `\n${c$1.green("All good.")}\n`);
	return problems ? 1 : 0;
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
  offertest agent-checkout --url <product url> [--code SAVE20]
                                               test a code in the store's AI-agent checkout (no keys, free)
  offertest acp --acp-url <endpoint> --item <id> [--code SAVE20]
                                               buy through your store's ACP agent checkout in test mode
  offertest ads [--account <act_123>] [--live] list ads and where they send people
  offertest serve [--port 7777]                local server for the Ads Manager Chrome extension
  offertest init                               guided setup: Meta API key, Ads Manager, browser, agent skill
  offertest doctor                             check the setup and print the fix for anything wrong
  offertest install-browser                    download Chromium if you have no Chrome

${c.bold("Check options")}
  --cta <text>          ad button text (default "Shop now")
  --live                with --account: test live (ACTIVE) ads instead of ads about to launch
  --pay                 allow a test-mode payment (asks before paying; test stores only)
  --no-submit           do not submit forms (sign-up, lead, booking)
  --no-agent-checkout   skip the agent checkout (UCP) check of the offer
  --acp-url <url>       also test your store's ACP checkout; with --pay it buys in test mode after you approve
                        (key in --acp-key or OFFERTEST_ACP_KEY)
  --no-buy              with acp or --acp-url: never finish the ACP purchase
  --item <id>           ACP item id (default: the last part of the landing page path)
  --pause-failing       pause a failing ad in Ads Manager (asks first)
  --mobile              phone viewport and Facebook in-app browser user agent
  --headless            hide the browser (default when not in a terminal)
  --headful             show the browser even when not in a terminal
  --limit <n>           with --account: test at most n ads (default 5)
  --max-turns <n>       agent turns per funnel (default 25)
  --max-usd <n>         stop a run above this model cost
  --out <dir>           run folders go here (default ./offertest-runs)
  --json                print result.json paths and verdicts as JSON
  --yes                 answer yes to approval prompts (payment, pause)

${c.bold("Exit codes")}  0 pass · 1 fail · 2 unresolved or blocked · 3 error · 4 usage
${c.bold("Env")}  META_API_KEY (Meta Model API) · META_ACCESS_TOKEN (Marketing API, ads_read) · META_AD_ACCOUNT_ID
     OFFERTEST_ACP_URL · OFFERTEST_ACP_KEY (your store's ACP checkout) · STRIPE_TEST_KEY (sk_test_, for ACP test payments)`;
async function agentCheckoutCmd(url, codes) {
	if (!url) {
		console.error(`Give --url <product page>.\n\n${HELP}`);
		process.exit(EXIT.usage);
	}
	codes = codes.map((x) => x.toUpperCase());
	const r = await agentCheckout(url, codes, new URL(url).pathname.split("/").pop()?.replace(/[-_]/g, " ") ?? "");
	if ("skipped" in r) {
		console.log(c.yellow(r.skipped));
		process.exit(EXIT.unresolved);
	}
	console.log(r.text);
	if (!codes.length) process.exit(EXIT.pass);
	if (/no discount result/.test(r.text)) {
		console.log(c.yellow("\nThe store did not say whether the code works for agents."));
		process.exit(EXIT.unresolved);
	}
	const failed = codes.filter((code) => !r.text.includes(`Discount applied: ${code}`));
	console.log(failed.length ? c.red(`\nDoes not work in agent checkout: ${failed.join(", ")}`) : c.green("\nThe code works in agent checkout."));
	process.exit(failed.length ? EXIT.fail : EXIT.pass);
}
function acpOptions(v) {
	const endpoint = v["acp-url"] ?? process.env.OFFERTEST_ACP_URL;
	if (!endpoint) return void 0;
	const key = v["acp-key"] ?? process.env.OFFERTEST_ACP_KEY;
	if (!key) {
		console.error(`Give your store's ACP API key: --acp-key <key> or OFFERTEST_ACP_KEY.`);
		process.exit(EXIT.usage);
	}
	return {
		endpoint,
		key,
		item: v.item,
		stripeTestKey: process.env.STRIPE_TEST_KEY,
		buy: !v["no-buy"]
	};
}
async function acpCmd(v, codes) {
	loadEnv();
	const o = acpOptions(v);
	const item = v.item ?? (v.url ? itemFromUrl(v.url) : void 0);
	if (!o || !item) {
		console.error(`Give --acp-url <your store's ACP endpoint> and --item <id> (or --url <product page>).\n\n${HELP}`);
		process.exit(EXIT.usage);
	}
	codes = codes.map((x) => x.toUpperCase());
	const r = await acpCheckout({
		...o,
		item,
		codes,
		buy: !v["no-buy"]
	});
	if ("skipped" in r) {
		console.log(c.yellow(r.skipped));
		process.exit(EXIT.unresolved);
	}
	console.log(r.text);
	const failed = codes.filter((code) => !r.text.includes(`Discount applied: ${code}`));
	if (failed.length) console.log(c.red(`\nDoes not work in ACP checkout: ${failed.join(", ")}`));
	else if (codes.length) console.log(c.green("\nThe code works in ACP checkout."));
	const bought = /Test purchase: completed/.test(r.text);
	if (!v["no-buy"]) console.log(bought ? c.green("The test purchase went through.") : c.yellow(r.text.split("\n").pop()));
	process.exit(failed.length ? EXIT.fail : bought || v["no-buy"] ? EXIT.pass : EXIT.unresolved);
}
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
			"no-agent-checkout": { type: "boolean" },
			code: {
				type: "string",
				multiple: true
			},
			"acp-url": { type: "string" },
			"acp-key": { type: "string" },
			item: { type: "string" },
			"no-buy": { type: "boolean" },
			"pause-failing": { type: "boolean" },
			mobile: { type: "boolean" },
			headful: { type: "boolean" },
			headless: { type: "boolean" },
			limit: { type: "string" },
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
	if (cmd === "init" || cmd === "setup") return await init();
	if (cmd === "doctor") process.exit(await doctor());
	if (cmd === "install-browser") return installBrowser();
	if (cmd === "ads") return await ads(values.account, values.live);
	if (cmd === "agent-checkout") return await agentCheckoutCmd(values.url, values.code ?? []);
	if (cmd === "acp") return await acpCmd(values, values.code ?? []);
	if (cmd === "serve") return await serve(values.port ? Number(values.port) : void 0);
	if (cmd !== "check") {
		console.error(`Unknown command "${cmd}".\n\n${HELP}`);
		process.exit(EXIT.usage);
	}
	loadEnv();
	if (!process.env.META_API_KEY) {
		console.error(c.red("OfferTest is not set up yet: no Meta Model API key."));
		console.error(`Run ${c.bold("npx offertest init")}: a 3-minute guided setup that opens the right pages and tests each key.`);
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
	else if (values.account || !values.url && process.env.META_AD_ACCOUNT_ID) {
		const ids = await listAdIds(values.account, values.live ? ["ACTIVE"] : void 0);
		const limit = Number(values.limit ?? 5);
		if (ids.length > limit && !values.json) console.log(c.dim(`${ids.length} ads match; testing the first ${limit}. Use --limit to change.`));
		const pick = ids.slice(0, limit);
		if (pick.length > 1 && tty && !values.yes) {
			for (const a of pick) console.log(c.dim(`  ${a.id}  ${(a.status ?? "").padEnd(16)} ${a.name ?? ""}`));
			if (!await ask(`Test these ${pick.length} ads? About $${(pick.length * .2).toFixed(2)}-$${pick.length}.00 in model usage and ${pick.length * 2}-${pick.length * 5} minutes.`)) return;
		}
		targets = [];
		for (const a of pick) targets.push(await getAd(a.id));
	} else if (values.url && values.headline) targets = [{
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
		console.log(values.account && !values.live ? "No paused or in-review ads found. Use --live for active ads." : "No ads matched.");
		return;
	}
	const opts = {
		outDir: values.out,
		pay: values.pay,
		submit: !values["no-submit"],
		agentCheckout: !values["no-agent-checkout"],
		acp: acpOptions(values),
		headful: values.headful ?? (!values.headless && !values.json && !!process.stdout.isTTY),
		retryHeadful: !values.headless && !!process.stdout.isTTY,
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
	const codes = results.map(({ result }) => result.error ? EXIT.error : EXIT[result.overall ?? "unresolved"]);
	process.exit([
		EXIT.error,
		EXIT.fail,
		EXIT.unresolved
	].find((c$2) => codes.includes(c$2)) ?? EXIT.pass);
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
		console.log(c.dim(`      ad: "${v.adQuote}"${v.pageQuote ? `   funnel: "${v.pageQuote.replace(/\s+/g, " ")}"` : ""}`));
	}
	if (r.fix) console.log(`\n  ${c.bold("Fix:")} ${r.fix.summary}${r.fix.steps.map((s) => `\n    - ${s}`).join("")}`);
	console.log(`\n  Report: ${report}`);
}
async function ads(account, live) {
	const ids = await listAdIds(account, live ? ["ACTIVE"] : void 0);
	if (!ids.length) return void console.log(`No ${live ? "live" : "paused or in-review"} ads found.${live ? "" : " Use --live for active ads."}`);
	for (const s of ids.slice(0, 25)) {
		const a = await getAd(s.id);
		console.log(`${a.id}  ${c.dim((a.status ?? "").padEnd(16))} ${a.headline.slice(0, 46).padEnd(46)}  -> ${dest(a)}`);
	}
	if (ids.length > 25) console.log(c.dim(`...and ${ids.length - 25} more.`));
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