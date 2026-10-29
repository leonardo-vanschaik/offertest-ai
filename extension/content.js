// Floating "Test offer" button on Ads Manager. Reads the selection only from the URL
// (act, selected_ad_ids), never from Meta's DOM: its class names change between builds.
(() => {
  if (window.top !== window || document.getElementById("offertest-root")) return;

  const host = document.createElement("div");
  host.id = "offertest-root";
  host.style.cssText = "all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      button {
        display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px 0 14px;
        border: 0; border-radius: 22px; cursor: pointer; color: #fff; background: #0a70dc;
        font: 600 14px/1 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        letter-spacing: -0.01em; white-space: nowrap;
        box-shadow: 0 8px 24px rgba(10, 112, 220, 0.32), 0 2px 6px rgba(0, 0, 0, 0.16);
        transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
      }
      button:hover { background: #0862c4; transform: translateY(-1px); box-shadow: 0 12px 28px rgba(10, 112, 220, 0.38), 0 2px 6px rgba(0, 0, 0, 0.16); }
      button:active { transform: translateY(0); }
      button:focus-visible { outline: 3px solid rgba(10, 112, 220, 0.35); outline-offset: 2px; }
      svg { width: 20px; height: 20px; flex: none; }
    </style>
    <button type="button" title="Test this ad's offer with OfferTest">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M5.6 7.5h12.8a1.6 1.6 0 0 1 1.6 1.5l.7 10a2 2 0 0 1-2 2.1H5.3a2 2 0 0 1-2-2.1l.7-10a1.6 1.6 0 0 1 1.6-1.5z" fill="#fff" fill-opacity=".22" stroke="#fff" stroke-width="1.6"/>
        <path d="M9 14.2l2.2 2.2 4-4.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="t">Test offer</span>
    </button>`;

  const button = root.querySelector("button");
  const label = root.querySelector(".t");

  function selection() {
    const u = new URL(location.href);
    const ids = (u.searchParams.get("selected_ad_ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    return { act: u.searchParams.get("act"), ids };
  }

  let last = "";
  function update() {
    if (location.href === last) return;
    last = location.href;
    const n = selection().ids.length;
    label.textContent = n ? `Test offer · ${n} ${n === 1 ? "ad" : "ads"}` : "Test offer";
  }

  button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "offertest:open", ...selection() }));
  // Ads Manager is a single-page app: the URL changes without a page load.
  setInterval(update, 500);
  addEventListener("popstate", update);
  update();
  (document.body ?? document.documentElement).appendChild(host);
})();
