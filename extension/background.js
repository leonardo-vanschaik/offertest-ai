// The toolbar icon and the in-page "Test offer" button both open the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Call open() at once: Chrome only allows it inside the user's click.
  if (msg?.type === "offertest:open" && sender.tab?.id != null) chrome.sidePanel.open({ tabId: sender.tab.id }).catch((e) => console.warn(e));
});
