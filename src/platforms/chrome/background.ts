// nicodAImus iris - Background service worker
// Handles .eml fetch (content scripts hit CORS on Gmail's redirect to googleusercontent.com)
// Will also handle API communication in Phase 2

const LOG_PREFIX = "[iris:bg]";

chrome.runtime.onInstalled.addListener(() => {
  console.log(LOG_PREFIX, "nicodAImus iris installed");
});

/** Track the open iris panel window so we reuse it instead of opening duplicates. */
let panelWindowId: number | null = null;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // If the panel window is already open, focus it and re-run analysis on the new tab.
  if (panelWindowId !== null) {
    try {
      await chrome.windows.update(panelWindowId, { focused: true });
      const [panelTab] = await chrome.tabs.query({ windowId: panelWindowId });
      if (panelTab?.id) {
        await chrome.tabs.sendMessage(panelTab.id, {
          action: "iris-panel-target",
          tabId: tab.id,
          windowId: tab.windowId,
        }).catch(() => { /* panel may not have loaded yet */ });
      }
      return;
    } catch {
      panelWindowId = null; // window was closed
    }
  }

  const url = chrome.runtime.getURL(`popup.html?tabId=${tab.id}&windowId=${tab.windowId ?? ""}`);

  // Position the panel in the top-right corner of the current browser window,
  // approximating where a normal popup would appear under the toolbar icon.
  const panelWidth = 360;
  const panelHeight = 620;
  const createOptions: Parameters<typeof chrome.windows.create>[0] = {
    url,
    type: "popup",
    width: panelWidth,
    height: panelHeight,
    focused: true,
  };
  if (tab.windowId !== undefined) {
    try {
      const browserWin = await chrome.windows.get(tab.windowId);
      createOptions.left = Math.max(0, (browserWin.left ?? 0) + (browserWin.width ?? 1200) - panelWidth - 10);
      createOptions.top = (browserWin.top ?? 0) + 70; // approx below the toolbar/tabs
    } catch { /* fall back to browser default placement */ }
  }

  const win = await chrome.windows.create(createOptions);
  panelWindowId = win?.id ?? null;
  console.log(LOG_PREFIX, "Opened iris panel window", panelWindowId);
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === panelWindowId) {
    panelWindowId = null;
  }
});

// When the user switches tabs in their email window, notify the panel so it
// can prompt them to re-scan without auto-running analysis uninvited.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (panelWindowId === null) return;
  if (activeInfo.windowId === panelWindowId) return; // ignore tabs inside the panel itself

  const [panelTab] = await chrome.tabs.query({ windowId: panelWindowId });
  if (panelTab?.id) {
    chrome.tabs.sendMessage(panelTab.id, {
      action: "iris-tab-changed",
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
    }).catch(() => { /* panel may not be ready */ });
  }
});

// Listen for fetch-eml requests from content script
chrome.runtime.onMessage.addListener(
  (
    message: { action: string; threadId?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { eml?: string; error?: string }) => void
  ) => {
    if (message.action === "fetch-eml" && message.threadId) {
      const url = `https://mail.google.com/mail/u/0?view=att&th=${message.threadId}&attid=0&disp=comp&safe=1&zw`;
      console.log(LOG_PREFIX, "Fetching .eml for thread:", message.threadId);

      fetch(url, { credentials: "include" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.text();
        })
        .then((eml) => {
          console.log(LOG_PREFIX, "Fetched .eml, length:", eml.length);
          sendResponse({ eml });
        })
        .catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(LOG_PREFIX, "Fetch error:", errorMsg);
          sendResponse({ error: errorMsg });
        });

      return true; // async response
    }
  }
);
