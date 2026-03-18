// nicodAImus iris - Gmail content script
// Injects the "iris" check button and handles email analysis

import { parseEmailHeaders } from "../../core/headerParser";
import { analyzeDomains } from "../../core/domainAnalyzer";
import { extractLinks } from "../../core/linkExtractor";
import { detectUrgency } from "../../core/urgencyDetector";
import { scoreEmail } from "../../core/scorer";
import { renderResultCard } from "../../ui/components";

/** Extract the Gmail thread ID from the current URL hash */
function getThreadId(): string | null {
  const hash = window.location.hash;
  // Gmail URL format: #inbox/threadId or #label/name/threadId
  const match = hash.match(/\/([a-f0-9]{16,})$/i);
  return match?.[1] ?? null;
}

/** Fetch the raw .eml content for a given thread ID */
async function fetchEml(threadId: string): Promise<string> {
  const url = `/mail/u/0?view=att&th=${threadId}&attid=0&disp=comp&safe=1&zw`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to fetch email: ${response.status}`);
  }
  return response.text();
}

/** Run the full analysis pipeline on raw .eml content */
function analyzeEmail(emlContent: string) {
  const metadata = parseEmailHeaders(emlContent);
  const links = extractLinks(emlContent);
  const linkDomains = links.map((l) => l.domain);
  const domainAnalysis = analyzeDomains(metadata, linkDomains);
  const urgencyAnalysis = detectUrgency(emlContent);
  const result = scoreEmail(metadata, domainAnalysis, urgencyAnalysis);
  return result;
}

/** Find the Gmail toolbar and inject the iris button */
function injectButton(): void {
  // Avoid duplicate injection
  if (document.getElementById("iris-check-button")) return;

  // Gmail toolbar uses role="toolbar" in the email view
  const toolbar = document.querySelector(
    '[role="toolbar"][gh="mtb"]'
  ) as HTMLElement | null;

  if (!toolbar) return;

  const button = document.createElement("div");
  button.id = "iris-check-button";
  button.className = "iris-toolbar-button";
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", "Check email with nicodAImus iris");
  button.setAttribute("data-tooltip", "Check with iris");
  button.textContent = "iris";

  button.addEventListener("click", handleCheck);

  toolbar.appendChild(button);
}

/** Handle the check button click */
async function handleCheck(): Promise<void> {
  const button = document.getElementById("iris-check-button");
  if (!button) return;

  // Remove any previous result
  const existing = document.getElementById("iris-result-card");
  if (existing) existing.remove();

  button.textContent = "...";
  button.classList.add("iris-loading");

  try {
    const threadId = getThreadId();
    if (!threadId) {
      showError("Could not identify the current email.");
      return;
    }

    const emlContent = await fetchEml(threadId);
    const result = analyzeEmail(emlContent);
    const cardHtml = renderResultCard(result);

    // Insert result card above the email body
    const emailBody = document.querySelector(
      '[role="main"] .nH .nH .nH'
    ) as HTMLElement | null;
    const container =
      emailBody ?? (document.querySelector('[role="main"]') as HTMLElement);

    if (container) {
      const card = document.createElement("div");
      card.id = "iris-result-card";
      card.innerHTML = cardHtml;
      container.insertBefore(card, container.firstChild);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    showError(`Analysis failed: ${message}`);
  } finally {
    if (button) {
      button.textContent = "iris";
      button.classList.remove("iris-loading");
    }
  }
}

function showError(message: string): void {
  const existing = document.getElementById("iris-result-card");
  if (existing) existing.remove();

  const container = document.querySelector('[role="main"]') as HTMLElement;
  if (!container) return;

  const card = document.createElement("div");
  card.id = "iris-result-card";
  card.innerHTML = `<div class="iris-card iris-card-error"><p>${message}</p></div>`;
  container.insertBefore(card, container.firstChild);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "iris-check") {
    handleCheck().then(() => {
      const resultCard = document.getElementById("iris-result-card");
      sendResponse({ html: resultCard?.innerHTML ?? null });
    });
    return true; // async response
  }
});

// Observe Gmail navigation (SPA - URL changes without page reload)
let lastHash = window.location.hash;
const observer = new MutationObserver(() => {
  if (window.location.hash !== lastHash) {
    lastHash = window.location.hash;
    // Small delay to let Gmail render the new view
    setTimeout(injectButton, 500);
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial injection
setTimeout(injectButton, 1000);
