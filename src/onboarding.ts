import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { CONFIG_DIR, CONFIG_ENV, loadEnv } from "./meta/client.ts";

// Setup wizard (`offertest init`) and health check (`offertest doctor`).
// Every step tests what the user pasted right away and says exactly what to do when it fails.

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
};
const ok = (s: string) => console.log(`  ${c.green("✓")} ${s}`);
const bad = (s: string) => console.log(`  ${c.red("✗")} ${s}`);
const warn = (s: string) => console.log(`  ${c.yellow("!")} ${s}`);
const info = (s: string) => console.log(`    ${c.dim(s)}`);

const LINKS = {
  metaApiKeys: "https://dev.meta.ai",
  createApp: "https://developers.facebook.com/apps/creation/",
  myApps: "https://developers.facebook.com/apps/",
  explorer: "https://developers.facebook.com/tools/explorer/",
  tokenDebugger: "https://developers.facebook.com/tools/debug/accesstoken/",
  adsManager: "https://adsmanager.facebook.com/adsmanager/manage/ads",
};
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v24.0"}`;
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = path.join(PKG_ROOT, "skills", "offertest");

function openUrl(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {}
}

function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(CONFIG_ENV)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(CONFIG_ENV, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
}

function saveEnv(values: Record<string, string | undefined>) {
  const merged = { ...readEnvFile(), ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)) };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_ENV, Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  for (const [k, v] of Object.entries(merged)) process.env[k] = v;
}

// ---------- checks (shared by init and doctor) ----------

export type KeyCheck = { ok: boolean; inconclusive?: boolean; detail: string };

export async function checkModelKey(key: string): Promise<KeyCheck> {
  const base = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const rejected = { ok: false, detail: "Meta rejected this key. Copy it again from dev.meta.ai." };
  const unsure = (status: number) => ({
    ok: false,
    inconclusive: true,
    detail: status === 429 ? "Meta is rate-limiting right now (429). Try again in a minute." : `Meta's API answered ${status}. It may be down; try again shortly.`,
  });
  try {
    const res = await fetch(`${base}/models`, { headers });
    if (res.status === 401 || res.status === 403) return rejected;
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string }[] };
      const ids = json.data?.map((m) => m.id) ?? [];
      const wonder = ids.some((id) => id.startsWith("muse-wonder"));
      return { ok: true, detail: ids.length ? `${ids.length} models${wonder ? ", including Muse Wonder" : " (Muse Wonder not listed: the agent may not run)"}` : "key accepted" };
    }
    if (res.status !== 404) return unsure(res.status);
    // No model list on this endpoint: prove the key with the smallest possible call.
    const probe = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: process.env.OFFERTEST_SPARK_MODEL ?? "muse-spark-1.3", messages: [{ role: "user", content: "ok" }], max_tokens: 1 }),
    });
    if (probe.status === 401 || probe.status === 403) return rejected;
    if (probe.ok) return { ok: true, detail: "key works (test call to Muse Spark)" };
    return unsure(probe.status);
  } catch (e) {
    return { ok: false, inconclusive: true, detail: `Could not reach ${base}: ${(e as Error).message}` };
  }
}

type TokenInfo = { valid: boolean; appId?: string; expiresAt?: number; scopes: string[]; scopesKnown: boolean; userName?: string; error?: string };

export async function checkAdsToken(token: string): Promise<TokenInfo> {
  try {
    const me = (await (await fetch(`${GRAPH()}/me?fields=id,name&access_token=${encodeURIComponent(token)}`)).json()) as { name?: string; error?: { message: string } };
    if (me.error) return { valid: false, scopes: [], scopesKnown: false, error: me.error.message };
    const dbg = (await (
      await fetch(`${GRAPH()}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`)
    ).json()) as { data?: { app_id?: string; expires_at?: number; scopes?: string[] }; error?: { message: string } };
    if (dbg.error || !dbg.data) return { valid: true, userName: me.name, scopes: [], scopesKnown: false };
    // expires_at 0 means the token never expires (system user tokens).
    return { valid: true, userName: me.name, appId: dbg.data.app_id, expiresAt: dbg.data.expires_at || undefined, scopes: dbg.data.scopes ?? [], scopesKnown: true };
  } catch (e) {
    return { valid: false, scopes: [], scopesKnown: false, error: (e as Error).message };
  }
}

async function adAccounts(token: string): Promise<{ id: string; name: string; status: number; currency: string }[]> {
  const res = (await (await fetch(`${GRAPH()}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${encodeURIComponent(token)}`)).json()) as {
    data?: { id: string; name: string; account_status: number; currency: string }[];
  };
  return (res.data ?? []).map((a) => ({ id: a.id, name: a.name, status: a.account_status, currency: a.currency }));
}

async function extendToken(token: string, appId: string, appSecret: string): Promise<{ token?: string; error?: string }> {
  const url = `${GRAPH()}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(token)}`;
  const res = (await (await fetch(url)).json()) as { access_token?: string; error?: { message: string } };
  return res.access_token ? { token: res.access_token } : { error: res.error?.message ?? "no token returned" };
}

async function browserReady(): Promise<string | null> {
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      const b = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
      await b.close();
      return channel === "chrome" ? "Google Chrome" : channel === "msedge" ? "Microsoft Edge" : "Playwright Chromium";
    } catch {}
  }
  return null;
}

function installChromium(): boolean {
  const cli = createRequire(import.meta.url).resolve("playwright-core/cli.js");
  return spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" }).status === 0;
}

function hasCommand(cmd: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

type SkillTarget = { name: string; detect: () => boolean; installed: () => boolean; install: () => void };
const SKILL_TARGETS: SkillTarget[] = [
  {
    name: "Muse Code",
    detect: () => hasCommand("muse"),
    installed: () => fs.existsSync(path.join(os.homedir(), ".agents", "skills", "offertest", "SKILL.md")),
    install: () => {
      const r = spawnSync("muse", ["skills", "install", SKILL_DIR, "--scope", "user", "--force"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("muse skills install failed");
    },
  },
  {
    name: "Claude Code",
    detect: () => fs.existsSync(path.join(os.homedir(), ".claude")),
    installed: () => fs.existsSync(path.join(os.homedir(), ".claude", "skills", "offertest", "SKILL.md")),
    install: () => fs.cpSync(SKILL_DIR, path.join(os.homedir(), ".claude", "skills", "offertest"), { recursive: true }),
  },
  {
    name: "Codex",
    detect: () => fs.existsSync(path.join(os.homedir(), ".codex")),
    installed: () => fs.existsSync(path.join(os.homedir(), ".agents", "skills", "offertest", "SKILL.md")),
    install: () => fs.cpSync(SKILL_DIR, path.join(os.homedir(), ".agents", "skills", "offertest"), { recursive: true }),
  },
];

const fmtDate = (sec?: number) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : "never");

// ---------- offertest init ----------

export async function init() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(`${c.yellow("?")} ${q} `)).trim();
  const yes = async (q: string, def = true) => {
    const a = (await ask(`${q} ${c.dim(def ? "[Y/n]" : "[y/N]")}`)).toLowerCase();
    return a ? a.startsWith("y") : def;
  };
  const expiresSoon = (t: TokenInfo) => !!t.expiresAt && t.expiresAt * 1000 - Date.now() < 3 * 86400_000;
  const offerExtend = async (tok: string, t: TokenInfo): Promise<string | undefined> => {
    warn(`This token expires soon (${fmtDate(t.expiresAt)}). OfferTest can extend it to 60 days.`);
    info(`Find the App Secret at ${LINKS.myApps} > your app > App settings > Basic > App secret > Show.`);
    const secret = await ask("Paste the App Secret to extend the token (Enter to skip):");
    if (!secret || !t.appId) return undefined;
    const ext = await extendToken(tok, t.appId, secret);
    if (!ext.token) {
      bad(`Could not extend: ${ext.error}`);
      return undefined;
    }
    ok(`Extended. The token now lasts until ${fmtDate((await checkAdsToken(ext.token)).expiresAt)}.`);
    return ext.token;
  };
  loadEnv();
  const saved = readEnvFile();

  console.log(`\n${c.bold("OfferTest setup")}  ${c.dim(`(saves to ${CONFIG_ENV})`)}\n`);
  console.log(`${c.bold("Step 1 of 4: Meta Model API key")}  ${c.dim("runs the AI: Muse Wonder, Muse Spark, SAM 3.1")}`);
  let key: string | undefined = saved.META_API_KEY ?? process.env.META_API_KEY;
  if (key) {
    const r = await checkModelKey(key);
    if (r.ok) {
      ok(`A working key is saved: ${r.detail}`);
      if (!(await yes("Keep it?"))) key = undefined;
    } else if (r.inconclusive) {
      warn(`Could not check the saved key: ${r.detail}`);
      if (!(await yes("Keep the saved key for now?"))) key = undefined;
    } else {
      bad(`The saved key no longer works: ${r.detail}`);
      key = undefined;
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

  console.log(`\n${c.bold("Step 2 of 4: Connect Meta Ads Manager")}  ${c.dim("optional: lets OfferTest read your ads and pause broken ones")}`);
  let token: string | undefined = saved.META_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
  if (token) {
    const t = await checkAdsToken(token);
    if (!t.valid) {
      warn(`The saved token no longer works: ${t.error}`);
      token = undefined;
    } else {
      ok(`Connected as ${t.userName}. Token expires: ${fmtDate(t.expiresAt)}.`);
      const noRead = t.scopesKnown && !t.scopes.includes("ads_read") && !t.scopes.includes("ads_management");
      if (noRead) warn("The saved token cannot read ads (no ads_read). Get a new one below.");
      if (noRead || !(await yes("Keep this token?"))) token = undefined;
      else if (expiresSoon(t)) {
        const ext = await offerExtend(token, t);
        if (ext) {
          token = ext;
          saveEnv({ META_ACCESS_TOKEN: token });
        }
      }
    }
  }
  if (!token && (await yes("Connect Ads Manager now? (about 3 minutes)"))) {
    console.log(`
    ${c.bold("A. Create a Meta app")} (once)
      1. Open ${LINKS.createApp}
      2. Choose "Other", then app type "Business". Name it "OfferTest". Create it.
      3. On the app dashboard, find "Marketing API" and click "Set up".
         No App Review or business verification is needed to read your own ad account.

    ${c.bold("B. Get a token")}
      1. Open ${LINKS.explorer}
      2. In "Meta App", pick your OfferTest app.
      3. Under "Permissions", add ${c.bold("ads_read")}, ${c.bold("ads_management")} (to pause broken ads),
         and ${c.bold("pages_manage_ads")} (to read Instant Forms for lead ads).
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
        if (!t.scopes.includes("pages_manage_ads")) info("For lead ads (Instant Forms), also add pages_manage_ads so OfferTest can read the form.");
      }
      token = pasted;
      // Explorer tokens last about an hour. Swap for a 60-day token with the app's ID and secret.
      if (expiresSoon(t)) token = (await offerExtend(pasted, t)) ?? pasted;
      saveEnv({ META_ACCESS_TOKEN: token });
    }
  }

  if (token) {
    const accounts = await adAccounts(token);
    if (!accounts.length) warn("This token sees no ad accounts. Use the Facebook profile that has access to your ad account.");
    else {
      console.log("");
      accounts.forEach((a, i) => console.log(`    ${c.bold(String(i + 1))}. ${a.name}  ${c.dim(`${a.id} · ${a.currency}${a.status === 1 ? "" : " · not active"}`)}`));
      const current = process.env.META_AD_ACCOUNT_ID;
      const pick = await ask(`Default ad account (1-${accounts.length})${current ? `, Enter keeps ${current}` : ""}:`);
      const chosen = accounts[Number(pick) - 1] ?? (accounts.length === 1 && !current ? accounts[0] : undefined);
      if (chosen) {
        saveEnv({ META_AD_ACCOUNT_ID: chosen.id });
        ok(`Default ad account: ${chosen.name} (${chosen.id})`);
      }
    }
  }

  console.log(`\n${c.bold("Step 3 of 4: Browser")}  ${c.dim("the agent shops in a real browser")}`);
  const browser = await browserReady();
  if (browser) ok(`Using ${browser}.`);
  else if (await yes("No browser found. Download Chromium now? (about 150 MB)")) {
    if (installChromium()) ok("Chromium installed.");
    else bad("The download failed. Install Google Chrome, or run `npx offertest install-browser` later.");
  }

  console.log(`\n${c.bold("Step 4 of 4: Use it from your coding agent")}  ${c.dim("optional")}`);
  const found = SKILL_TARGETS.filter((t) => t.detect());
  if (!found.length) info("No Muse Code, Claude Code, or Codex found. You can install the skill later: see docs/SETUP.md.");
  for (const t of found) {
    if (t.installed()) {
      ok(`${t.name}: skill already installed.`);
      continue;
    }
    if (await yes(`Install the OfferTest skill into ${t.name}?`)) {
      try {
        t.install();
        ok(`${t.name}: installed. Ask it: "Check the ads I'm about to launch."`);
      } catch (e) {
        bad(`${t.name}: ${(e as Error).message}`);
      }
    }
  }
  rl.close();

  console.log(`\n${c.green(c.bold("Done."))} Try one of these:`);
  if (process.env.META_ACCESS_TOKEN) console.log(`  offertest ads                     ${c.dim("see your ads and where they send people")}`);
  if (process.env.META_ACCESS_TOKEN) console.log(`  offertest check                   ${c.dim("test every ad that is about to launch")}`);
  console.log(`  offertest check --url <page> --headline "..." --text "..."`);
  console.log(`  offertest doctor                  ${c.dim("check the setup at any time")}\n`);
}

// ---------- offertest doctor ----------

export async function doctor(): Promise<number> {
  loadEnv();
  let problems = 0;
  const fail = (s: string, fix: string) => {
    problems++;
    bad(s);
    info(`Fix: ${fix}`);
  };
  console.log(`\n${c.bold("OfferTest doctor")}\n`);

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 22) ok(`Node ${process.versions.node}`);
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
      const days = t.expiresAt ? Math.round((t.expiresAt * 1000 - Date.now()) / 86400_000) : null;
      ok(`Ads Manager: connected as ${t.userName}${days === null ? ", token never expires" : `, token expires in ${days} day(s)`}`);
      if (days !== null && days < 7) warn("The token expires soon. Run `offertest init` to extend it.");
      if (!t.scopesKnown) warn("Could not read the token's permissions (debug_token failed).");
      else {
        if (!t.scopes.includes("ads_read") && !t.scopes.includes("ads_management")) fail("The token lacks ads_read", `add ads_read in ${LINKS.explorer} and generate a new token`);
        if (!t.scopes.includes("ads_management")) info("No ads_management: OfferTest cannot pause ads (reading works).");
        if (!t.scopes.includes("pages_manage_ads")) info("No pages_manage_ads: lead ad forms cannot be read (other ads work).");
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

  console.log(problems ? `\n${c.red(`${problems} problem(s).`)} Fix them, then run \`offertest doctor\` again.\n` : `\n${c.green("All good.")}\n`);
  return problems ? 1 : 0;
}

export { LINKS };
