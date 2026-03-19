// nicodAImus iris - Popup / panel script
// When opened as a persistent window (via background.ts), tabId and windowId
// are passed as URL query params so the correct tab is always targeted.

/** Escape a string for safe use in HTML attribute values and text content. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  const checkBtn = document.getElementById("iris-check-btn");
  const resultDiv = document.getElementById("iris-popup-result");
  const metaDiv = document.getElementById("iris-email-meta");
  const bannerDiv = document.getElementById("iris-tab-banner");
  const hintDiv = document.querySelector(".iris-popup-hint");
  const brandLink = document.querySelector<HTMLAnchorElement>(".iris-brand");

  if (!checkBtn || !resultDiv) return;

  // target="_blank" can silently fail in extension panel windows; use chrome.tabs.create instead.
  if (brandLink) {
    brandLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: brandLink.href });
    });
  }

  // Read from URL params set by background.ts when opening the panel window.
  const params = new URLSearchParams(window.location.search);
  let targetTabId: number | null = params.get("tabId") ? parseInt(params.get("tabId")!, 10) : null;
  // mutable - updated when user switches tabs or clicks iris on a different tab/window
  let targetWindowId: number | null = params.get("windowId") ? parseInt(params.get("windowId")!, 10) : null;

  /** Always resolve the currently active tab in the email window before scanning.
   *  This means "Scan" always checks whatever email the user is looking at now,
   *  even if they switched tabs since the panel was opened. */
  async function resolveActiveTab(): Promise<void> {
    if (targetWindowId === null) return;
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: targetWindowId });
      if (tabs[0]?.id) {
        targetTabId = tabs[0].id;
      }
    } catch { /* keep existing targetTabId */ }
  }

  async function runCheck(): Promise<void> {
    await resolveActiveTab();

    checkBtn!.textContent = "Scanning...";
    checkBtn!.setAttribute("disabled", "true");
    if (bannerDiv) bannerDiv.style.display = "none";

    try {
      if (!targetTabId) {
        if (metaDiv) metaDiv.style.display = "none";
        resultDiv!.innerHTML =
          '<p class="iris-error">Please click the iris icon while viewing Gmail or Proton Mail.</p>';
        resultDiv!.style.display = "block";
        checkBtn!.textContent = "Scan";
        checkBtn!.removeAttribute("disabled");
        return;
      }

      const response = await chrome.tabs.sendMessage(targetTabId, { action: "iris-check" });

      if (response?.html) {
        resultDiv!.innerHTML = response.html;
        resultDiv!.style.display = "block";
        if (hintDiv) (hintDiv as HTMLElement).style.display = "none";

        // Show which email was analyzed with labeled fields.
        if (metaDiv) {
          const subject = response.subject?.trim();
          const from = response.from?.trim();
          if (subject || from) {
            let html = "";
            if (subject) {
              html += `<span class="iris-meta-label">Subject</span>`
                    + `<span class="iris-meta-value" title="${esc(subject)}">${esc(subject)}</span>`;
            }
            if (from) {
              html += `<span class="iris-meta-label">From</span>`
                    + `<span class="iris-meta-value" title="${esc(from)}">${esc(from)}</span>`;
            }
            metaDiv.innerHTML = html;
            metaDiv.style.display = "grid";
          } else {
            metaDiv.style.display = "none";
          }
        }

        // Re-attach verify button handler - event listeners don't survive innerHTML.
        const verifyBtn = resultDiv!.querySelector<HTMLButtonElement>(".iris-btn-verify");
        if (verifyBtn && targetTabId) {
          const tabId = targetTabId;
          verifyBtn.addEventListener("click", async () => {
            verifyBtn.disabled = true;
            verifyBtn.textContent = "Fetching headers...";
            try {
              const verifyRes = await chrome.tabs.sendMessage(tabId, { action: "iris-verify-auth" });
              if (verifyRes?.html) {
                resultDiv!.innerHTML = verifyRes.html;
              } else {
                verifyBtn.disabled = false;
                verifyBtn.textContent = "Could not fetch headers - tap to retry";
              }
            } catch {
              verifyBtn.disabled = false;
              verifyBtn.textContent = "Error - tap to retry";
            }
          });
        }
      } else {
        resultDiv!.innerHTML =
          '<p class="iris-error">Could not analyze this email. Make sure you have an email open.</p>';
        resultDiv!.style.display = "block";
      }
    } catch {
      resultDiv!.innerHTML =
        '<p class="iris-error">Could not connect to the mail tab. Try refreshing the page.</p>';
      resultDiv!.style.display = "block";
    }

    checkBtn!.textContent = "Scan Again";
    checkBtn!.removeAttribute("disabled");
  }

  checkBtn.addEventListener("click", runCheck);

  // Background notifies us when the user switches tabs or clicks iris on a new tab/window.
  chrome.runtime.onMessage.addListener((message: { action: string; tabId?: number; windowId?: number }) => {
    if (message.action === "iris-panel-target" && message.tabId) {
      targetTabId = message.tabId;
      if (message.windowId) targetWindowId = message.windowId;
      runCheck();
    }
    if (message.action === "iris-tab-changed" && message.tabId) {
      targetTabId = message.tabId;
      // Update the window context so resolveActiveTab() queries the right window.
      if (message.windowId) targetWindowId = message.windowId;
      if (bannerDiv) {
        bannerDiv.textContent = "Tab switched - click Scan to check the current email.";
        bannerDiv.style.display = "block";
        bannerDiv.onclick = () => runCheck();
      }
    }
  });

  // Auto-run analysis when opened with a target tab.
  if (targetTabId) {
    runCheck();
  }
});
