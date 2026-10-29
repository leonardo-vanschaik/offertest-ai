// OfferTest side panel: reads the Ads Manager selection from the active tab's URL,
// starts tests on the local server (`offertest serve`), and shows live progress and verdicts.
const SERVER = "http://127.0.0.1:7777";
const $ = (id) => document.getElementById(id);

const state = {
  online: false,
  health: null,
  act: null,
  picked: [], // selected in Ads Manager
  manual: [], // pasted by the user
  tests: [], // [{ id, adId }], newest first
};
let restored = false;
const cards = new Map(); // test id -> { el, data, sig, shotBusy }

// ---------- helpers ----------

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path, init) {
  const res = await fetch(SERVER + path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status });
  return json;
}

const ICON = {
  check: '<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  q: '<svg viewBox="0 0 12 12" fill="none"><path d="M4.4 4.4a1.7 1.7 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.1v.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="9.3" r=".9" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  ext: '<svg viewBox="0 0 16 16" fill="none"><path d="M9 3h4v4M13 3L7.5 8.5M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="2.6" height="10" rx="1" fill="currentColor"/><rect x="9.4" y="3" width="2.6" height="10" rx="1" fill="currentColor"/></svg>',
  bulb: '<svg viewBox="0 0 16 16" fill="none"><path d="M6 12.5h4M6.5 14.5h3M8 1.8a4.4 4.4 0 0 0-2.6 8c.4.3.6.8.6 1.3v.4h4v-.4c0-.5.2-1 .6-1.3A4.4 4.4 0 0 0 8 1.8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const STATUS = {
  supported: { label: "Holds", icon: ICON.check },
  contradicted: { label: "Broken", icon: ICON.cross },
  unresolved: { label: "Not confirmed", icon: ICON.q },
  outside_scope: { label: "Out of scope", icon: ICON.q },
};

// ---------- server status ----------

async function checkHealth() {
  try {
    state.health = await api("/health");
    state.online = true;
  } catch {
    state.online = false;
    state.health = null;
  }
  const s = $("status");
  s.className = `status ${state.online ? "is-online" : "is-offline"}`;
  s.querySelector(".label").textContent = state.online ? "Connected" : "Offline";
  $("offline").hidden = state.online;

  const missing = [];
  if (state.online && !state.health.hasModelKey) missing.push("<b>META_API_KEY</b> (Meta Model API) to run the agent");
  if (state.online && !state.health.hasAdsToken) missing.push("<b>META_ACCESS_TOKEN</b> (ads_read) to read ads from Ads Manager");
  $("keys").hidden = !missing.length;
  if (missing.length)
    $("keys").innerHTML = `Missing keys on the server:<ul>${missing.map((m) => `<li>${m}</li>`).join("")}</ul><div style="margin-top:6px">Run <code>npx offertest init</code>, then restart <code>offertest serve</code>.</div>`;
  renderSelection();
  if (state.online && !restored) {
    restored = true;
    await restore();
  }
}

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText("npx offertest serve").catch(() => {});
  const b = $("copy");
  b.textContent = "Copied";
  b.classList.add("done");
  setTimeout(() => {
    b.textContent = "Copy";
    b.classList.remove("done");
  }, 1600);
});

// ---------- selection ----------

function parseIds(s) {
  return String(s ?? "")
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isAdsManager(u) {
  return u.hostname === "adsmanager.facebook.com" || (u.hostname === "business.facebook.com" && u.pathname.startsWith("/adsmanager"));
}

async function readSelection() {
  // Dev override for testing the panel as a tab: sidepanel.html?act=123&ads=1,2
  const q = new URLSearchParams(location.search);
  let act = null;
  let ids = [];
  if (q.has("ads") || q.has("act")) {
    act = q.get("act");
    ids = parseIds(q.get("ads"));
  } else {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    if (tab?.url) {
      const u = new URL(tab.url);
      if (isAdsManager(u)) {
        act = u.searchParams.get("act");
        ids = parseIds(u.searchParams.get("selected_ad_ids"));
      }
    }
  }
  state.act = act;
  state.picked = ids.filter((x) => /^\d+$/.test(x));
  renderSelection();
}

chrome.tabs.onActivated.addListener(readSelection);
chrome.tabs.onUpdated.addListener((_id, info) => info.url && readSelection());
chrome.windows?.onFocusChanged.addListener(readSelection);

function adIds() {
  return [...new Set([...state.picked, ...state.manual])];
}

function renderSelection() {
  const acc = $("account");
  acc.hidden = !state.act;
  acc.textContent = state.act ? `Account ${state.act.replace(/^act_/, "")}` : "";
  const chips = [
    ...state.picked.map((id) => `<span class="chip picked" title="Selected in Ads Manager">${esc(id)}<span class="src">selected</span></span>`),
    ...state.manual
      .filter((id) => !state.picked.includes(id))
      .map((id) => `<span class="chip">${esc(id)}<button type="button" data-remove="${esc(id)}" aria-label="Remove">${ICON.close}</button></span>`),
  ];
  $("chips").innerHTML = chips.join("");
  $("empty").hidden = chips.length > 0;
  const n = adIds().length;
  const run = $("run");
  run.disabled = !state.online || !n;
  run.textContent = n > 1 ? `Run test on ${n} ads` : "Run test";
}

$("chips").addEventListener("click", (e) => {
  const id = e.target.closest("[data-remove]")?.dataset.remove;
  if (!id) return;
  state.manual = state.manual.filter((x) => x !== id);
  renderSelection();
});

$("add").addEventListener("submit", (e) => {
  e.preventDefault();
  const ids = parseIds($("adInput").value);
  const bad = ids.filter((x) => !/^\d{5,25}$/.test(x));
  $("addError").hidden = !bad.length;
  if (bad.length) {
    $("addError").textContent = `"${bad[0]}" is not an ad ID. Ad IDs are numbers, e.g. 120210000000000000.`;
    return;
  }
  state.manual = [...new Set([...state.manual, ...ids])];
  $("adInput").value = "";
  renderSelection();
});

$("run").addEventListener("click", async () => {
  const run = $("run");
  run.disabled = true;
  run.textContent = "Starting…";
  // New tests go on top, in the order of the selection.
  const anchor = $("tests").firstChild;
  const started = [];
  for (const adId of adIds()) {
    try {
      const { id } = await api("/tests", { method: "POST", body: JSON.stringify({ adId }) });
      started.push({ id, adId });
      addCard({ id, adId, status: "running", phase: "Starting", steps: [] }, anchor);
    } catch (err) {
      addCard({ id: `local-${Date.now()}-${adId}`, adId, status: "error", phase: "", steps: [], error: err.message }, anchor);
    }
  }
  state.tests = [...started, ...state.tests];
  state.manual = [];
  saveTests();
  renderSelection();
});

// ---------- tests ----------

function saveTests() {
  chrome.storage?.session?.set({ tests: state.tests }).catch(() => {});
}

// before: insert above this element; null appends at the end.
function addCard(data, before = null) {
  const el = document.createElement("article");
  el.className = "test";
  el.innerHTML = `<div class="head"></div>
    <div class="phase-slot"></div>
    <div class="live" hidden>
      <div class="live-bar"><span class="dots"><i></i><i></i><i></i></span><span class="live-url">Opening the funnel…</span><span class="live-tag">LIVE</span></div>
      <div class="live-shot"><img alt="Latest screenshot from the agent's browser" hidden /><div class="live-wait">Waiting for the first screenshot</div></div>
    </div>
    <div class="body"></div>`;
  const card = { el, data, sig: "", shotBusy: false };
  cards.set(data.id, card);
  const list = $("tests");
  list.insertBefore(el, before);
  el.addEventListener("click", (e) => onCardClick(card, e));
  render(card);
}

function render(card) {
  const t = card.data;
  const sig = JSON.stringify([t.status, t.phase, t.steps.length, t.headline, !!t.result, card.confirm, card.paused, card.pauseError]);
  if (sig === card.sig) return;
  card.sig = sig;
  const r = t.result;
  const running = t.status === "running";

  card.el.querySelector(".head").innerHTML = `<div class="test-h">
      <div><div class="ad-name">${esc(t.headline || (t.adId ? "Ad " + t.adId : "Manual ad"))}</div>
      <div class="ad-id">${t.headline && t.adId ? `Ad ID ${esc(t.adId)}` : t.adId ? "Not read from Meta yet" : "Manual ad"}${r?.ad?.status ? ` · ${esc(r.ad.status.toLowerCase().replace(/_/g, " "))}` : ""}</div></div>
      <button class="x" type="button" data-act="dismiss" aria-label="Dismiss">${ICON.close}</button>
    </div>`;

  card.el.querySelector(".live").hidden = !running;
  const body = card.el.querySelector(".body");
  if (running) {
    const steps = t.steps.slice(-6);
    card.el.querySelector(".phase-slot").innerHTML = `<div class="phase"><span class="spinner"></span><span>${esc(t.phase)}</span></div>`;
    body.innerHTML = `
      ${t.steps.length ? `<ol class="steps">${t.steps.length > 6 ? `<li class="more">${t.steps.length - 6} earlier ${t.steps.length === 7 ? "step" : "steps"}</li>` : ""}${steps.map((s) => `<li><span class="n">${s.n}</span><span>${esc(s.summary)}</span></li>`).join("")}</ol>` : '<div style="height:16px"></div>'}`;
    const lastUrl = [...t.steps].reverse().find((s) => s.url && /^https?:/.test(s.url))?.url;
    if (lastUrl) card.el.querySelector(".live-url").textContent = lastUrl.replace(/^https?:\/\//, "");
    return;
  }
  card.el.querySelector(".phase-slot").innerHTML = "";
  body.innerHTML = r && !r.error ? resultHtml(card) : errorHtml(t);
}

function verdictCounts(r) {
  const c = { supported: 0, contradicted: 0, unresolved: 0 };
  for (const v of r.verdicts) c[v.status === "outside_scope" ? "unresolved" : v.status]++;
  return c;
}

function resultHtml(card) {
  const t = card.data;
  const r = t.result;
  const overall = r.overall ?? "unresolved";
  const c = verdictCounts(r);
  const total = r.verdicts.length;
  const headline =
    overall === "pass"
      ? `All ${total} ${total === 1 ? "promise holds" : "promises hold"}`
      : overall === "fail"
        ? `${c.contradicted} of ${total} ${total === 1 ? "promise" : "promises"} broken`
        : r.blocked
          ? "The site blocked the agent"
          : `${c.unresolved} of ${total} ${total === 1 ? "promise" : "promises"} not confirmed`;

  const promises = r.verdicts
    .map((v) => {
      const s = STATUS[v.status] ?? STATUS.unresolved;
      return `<li class="promise ${esc(v.status)}">
        <div class="p-h"><span class="p-ico">${s.icon}</span><span class="claim">${esc(v.claim)}</span><span class="p-tag">${s.label}</span></div>
        <div class="quotes">
          <div class="q"><div class="ql">The ad says</div><blockquote>“${esc(v.adQuote)}”</blockquote></div>
          <div class="q page"><div class="ql">The funnel shows</div>${v.pageQuote ? `<blockquote>“${esc(v.pageQuote)}”</blockquote>` : '<blockquote class="none">Nothing found on the pages the agent saw</blockquote>'}</div>
        </div>
        ${v.reason ? `<p class="reason">${esc(v.reason)}</p>` : ""}
      </li>`;
    })
    .join("");

  const fix = r.fix
    ? `<div class="fix"><div class="fix-h">${ICON.bulb}Suggested fix</div><p>${esc(r.fix.summary)}</p>${r.fix.steps?.length ? `<ol>${r.fix.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}</div>`
    : "";

  const canPause = overall === "fail" && r.ad?.source === "meta" && t.adId;
  let pause = "";
  if (canPause && card.paused) pause = `<div class="paused">${ICON.pause} Ad paused in Ads Manager</div>`;
  else if (canPause && card.confirm)
    pause = `<div class="confirm"><span>Pause ad <b>${esc(t.adId)}</b> in Ads Manager? It stops spending until you turn it back on.</span>
      <div><button type="button" class="secondary" data-act="cancel">Cancel</button><button type="button" class="danger solid" data-act="pause-yes">Pause ad</button></div></div>`;
  else if (canPause) pause = `<button type="button" class="danger" data-act="pause">${ICON.pause}Pause ad</button>`;
  const pauseErr = card.pauseError ? `<div class="err" style="margin:0;flex-basis:100%">Could not pause: ${esc(card.pauseError)}</div>` : "";

  return `
    <div class="verdict ${overall}"><div class="big">${overall.toUpperCase()}</div><div class="meta"><b>${esc(headline)}</b><span>${esc(r.boundary)}</span></div></div>
    ${total ? `<div class="section-label">Promises checked</div><ul class="promises">${promises}</ul>` : ""}
    ${fix}
    <div class="actions">
      ${t.hasReport ? `<button type="button" class="secondary" data-act="report">${ICON.ext}Open full report</button>` : ""}
      ${pause}${pauseErr}
    </div>
    <div class="cost">${t.steps.length} steps · $${(r.usage?.usd ?? 0).toFixed(2)} model cost</div>`;
}

function errorHtml(t) {
  const msg = t.error || t.result?.error || "The test stopped.";
  const hint = /META_API_KEY|META_ACCESS_TOKEN/.test(msg)
    ? "<br><br>Run <code>npx offertest init</code> to save your keys, then restart <code>offertest serve</code>."
    : "";
  return `<div class="verdict error"><div class="big">ERROR</div><div class="meta"><b>The test could not finish</b><span>No verdict for this ad</span></div></div>
    <div class="err">${esc(msg)}${hint}</div>
    <div class="actions">${t.hasReport ? `<button type="button" class="secondary" data-act="report">${ICON.ext}Open full report</button>` : ""}</div>`;
}

async function onCardClick(card, e) {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  const t = card.data;
  if (act === "dismiss") {
    card.el.remove();
    cards.delete(t.id);
    state.tests = state.tests.filter((x) => x.id !== t.id);
    saveTests();
  } else if (act === "report") {
    chrome.tabs.create({ url: `${SERVER}/tests/${t.id}/report` });
  } else if (act === "pause") {
    card.confirm = true;
    card.pauseError = null;
    render(card);
  } else if (act === "cancel") {
    card.confirm = false;
    render(card);
  } else if (act === "pause-yes") {
    e.target.disabled = true;
    e.target.textContent = "Pausing…";
    try {
      await api(`/ads/${encodeURIComponent(t.adId)}/pause`, { method: "POST", body: "{}" });
      card.paused = true;
    } catch (err) {
      card.pauseError = err.message;
    }
    card.confirm = false;
    render(card);
  }
}

// Poll running tests and refresh the live screenshot every 1.5 s.
async function poll() {
  for (const card of cards.values()) {
    if (card.data.status !== "running" || card.data.id.startsWith("local-")) continue;
    try {
      card.data = await api(`/tests/${card.data.id}`);
      render(card);
      if (card.data.hasShot && card.data.status === "running") refreshShot(card);
    } catch (err) {
      if (err.status === 404) {
        card.data = { ...card.data, status: "error", error: "The OfferTest server restarted and lost this test. Run it again." };
        render(card);
      }
    }
  }
}

function refreshShot(card) {
  if (card.shotBusy) return;
  card.shotBusy = true;
  const next = new Image();
  next.onload = () => {
    const img = card.el.querySelector(".live-shot img");
    img.src = next.src;
    img.hidden = false;
    card.el.querySelector(".live-wait").hidden = true;
    card.shotBusy = false;
  };
  next.onerror = () => (card.shotBusy = false);
  next.src = `${SERVER}/tests/${card.data.id}/shots/latest?t=${Date.now()}`;
}

// Restore tests from this browser session (the panel reloads when it is closed and opened).
async function restore() {
  const saved = (await chrome.storage?.session?.get("tests").catch(() => null))?.tests ?? [];
  state.tests = saved;
  for (const { id } of saved) {
    try {
      addCard(await api(`/tests/${id}`));
    } catch {
      state.tests = state.tests.filter((x) => x.id !== id);
    }
  }
  if (!saved.length) return;
  for (const c of cards.values()) if (!c.data.adId) c.data.adId = saved.find((s) => s.id === c.data.id)?.adId;
  saveTests();
}

(async () => {
  await readSelection();
  await checkHealth();
  setInterval(checkHealth, 3000);
  setInterval(poll, 1500);
})();
