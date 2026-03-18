// nicodAImus iris - Background service worker
// Currently minimal - will handle API communication in Phase 2

chrome.runtime.onInstalled.addListener(() => {
  console.log("[iris] nicodAImus iris installed");
});
