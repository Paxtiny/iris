// nicodAImus iris - Background service worker
// Handles .eml fetch (content scripts hit CORS on Gmail's redirect to googleusercontent.com)
// Will also handle API communication in Phase 2

const LOG_PREFIX = "[iris:bg]";

chrome.runtime.onInstalled.addListener(() => {
  console.log(LOG_PREFIX, "nicodAImus iris installed");
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
