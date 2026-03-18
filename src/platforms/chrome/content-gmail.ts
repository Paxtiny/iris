// nicodAImus iris - Gmail content script
// Injects the "iris" check button and handles email analysis

import { parseEmailHeaders } from "../../core/headerParser";
import { analyzeDomains } from "../../core/domainAnalyzer";
import { extractLinks } from "../../core/linkExtractor";
import { detectUrgency } from "../../core/urgencyDetector";
import { scoreEmail, type ScoreOptions } from "../../core/scorer";
import { createResultCardElement } from "../../ui/components";
import type { EmailMetadata, ExtractedLink } from "../../core/types";

const LOG_PREFIX = "[iris]";

/**
 * Extract the Gmail thread ID for the currently displayed email.
 * Tries multiple strategies, prioritizing the ACTIVE/DISPLAYED email
 * (not just the first thread ID found in the DOM).
 */
function getThreadId(): string | null {
  // Strategy 1: URL hash (full email view: #inbox/19cfd44438459c06)
  const hash = window.location.hash;
  const hashMatch = hash.match(/\/([a-f0-9]{16,})$/i);
  if (hashMatch?.[1]) {
    console.log(LOG_PREFIX, "Thread ID from URL hash:", hashMatch[1]);
    return hashMatch[1];
  }

  // Strategy 2: Find data-message-id within the VISIBLE email content area
  // In preview pane mode, the displayed email is in a container with the message body.
  // We look for data-message-id on elements that are inside the email display area,
  // not in the email list rows.
  const emailDisplaySelectors = [
    ".adn [data-message-id]",             // Email display container
    ".aeJ [data-message-id]",             // Alternative display container
    ".h7 [data-message-id]",              // Message header area
    "[data-message-id]",                   // Fallback: any message element
  ];

  for (const selector of emailDisplaySelectors) {
    // Get ALL matches and use the LAST one (most recently rendered = currently displayed)
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      const lastEl = elements[elements.length - 1]!;
      const msgId = lastEl.getAttribute("data-message-id");
      if (msgId) {
        const cleanId = msgId.replace(/^#msg-f:/, "");
        console.log(LOG_PREFIX, `Message ID from "${selector}" (${elements.length} matches, using last):`, cleanId);
        return cleanId;
      }
    }
  }

  // Strategy 3: Find thread ID from the currently SELECTED row in the email list
  // Gmail marks the active/selected row with specific classes
  const selectedRowSelectors = [
    "tr.x7",          // Selected row in classic view
    "tr.aqo",         // Active/focused row
    "tr[tabindex='0']", // Row with keyboard focus
    "tr.btb",         // Blue-highlighted selected row
  ];

  for (const selector of selectedRowSelectors) {
    const row = document.querySelector(selector) as HTMLElement | null;
    if (!row) continue;

    // Check for data-thread-id on the row itself
    const threadId = row.getAttribute("data-thread-id")
      ?? row.getAttribute("data-thread-perm-id")
      ?? row.getAttribute("data-legacy-thread-id");
    if (threadId) {
      console.log(LOG_PREFIX, "Thread ID from selected row attribute:", threadId);
      return threadId;
    }

    // Check links within the selected row
    const rowLinks = row.querySelectorAll("a[href]");
    for (const link of rowLinks) {
      const href = link.getAttribute("href") ?? "";
      const idMatch = href.match(/#[^/]+\/([a-f0-9]{16,})$/i);
      if (idMatch?.[1]) {
        console.log(LOG_PREFIX, "Thread ID from selected row link:", idMatch[1]);
        return idMatch[1];
      }
    }
  }

  // Strategy 4: Look for data-thread-perm-id within the email display (not list)
  // Scope to the preview pane / email view area
  const displayContainers = document.querySelectorAll(".adn, .aeJ, [role='main']");
  for (const container of displayContainers) {
    const threadEl = container.querySelector("[data-thread-perm-id], [data-legacy-thread-id]");
    if (threadEl) {
      const id = threadEl.getAttribute("data-thread-perm-id")
        ?? threadEl.getAttribute("data-legacy-thread-id");
      if (id) {
        console.log(LOG_PREFIX, "Thread ID from display container:", id);
        return id;
      }
    }
  }

  console.warn(LOG_PREFIX, "Could not find thread ID. URL hash:", hash);
  return null;
}

/** Try to fetch the raw email source via Gmail's "Show Original" view.
 *  Unlike view=att (which redirects to googleusercontent.com and hits CORS),
 *  view=om stays on mail.google.com - same-origin, no CORS issues.
 *  Returns null if it fails - caller should fall back to DOM parsing. */
async function tryFetchEml(threadId: string): Promise<string | null> {
  // view=om returns the "Show Original" page with raw email content
  // It stays on mail.google.com (same-origin) unlike view=att
  const url = `/mail/u/0/?view=om&permmsgid=${threadId}`;
  console.log(LOG_PREFIX, "Fetching email source via view=om:", url);

  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      console.log(LOG_PREFIX, "view=om fetch failed:", response.status);
      return null;
    }

    const html = await response.text();

    // view=om returns an HTML page with the raw email in a <pre> or <div> element
    // Extract the raw email text from the HTML wrapper
    const rawEmail = extractRawEmailFromShowOriginal(html);
    if (rawEmail && rawEmail.length > 100) {
      console.log(LOG_PREFIX, "Got raw email via view=om, length:", rawEmail.length);
      return rawEmail;
    }

    // If the HTML doesn't contain recognizable email content, it might be the raw text itself
    if (html.includes("From:") && html.includes("Date:") && html.length > 200) {
      console.log(LOG_PREFIX, "view=om returned raw text directly, length:", html.length);
      return html;
    }

    console.log(LOG_PREFIX, "view=om response didn't contain email data, length:", html.length);
    return null;
  } catch (err) {
    console.log(LOG_PREFIX, "view=om fetch error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Extract raw email text from Gmail's "Show Original" HTML page */
function extractRawEmailFromShowOriginal(html: string): string | null {
  // Gmail's "Show Original" wraps the raw email in a <pre> or specific div
  // Try to extract the content between common wrapper elements

  // Method 1: Look for content between <pre> tags
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch?.[1]) {
    // Decode HTML entities
    return decodeHtmlEntities(preMatch[1]);
  }

  // Method 2: Look for the raw email after the "Download Original" section
  // Gmail's view=om page has a header section, then the raw email
  const divMatch = html.match(/<div[^>]*class="[^"]*original_message[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (divMatch?.[1]) {
    return decodeHtmlEntities(divMatch[1]);
  }

  // Method 3: If the response looks like raw email headers (not HTML page)
  if (!html.startsWith("<!") && !html.startsWith("<html") && html.includes("\nFrom:")) {
    return html;
  }

  return null;
}

/** Decode common HTML entities in extracted email source */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Find the container element for the currently displayed email.
 *  In preview pane mode, multiple emails exist in the DOM - we need the right one. */
function getDisplayedEmailContainer(): HTMLElement | null {
  // Find the last data-message-id element (most recently rendered = currently displayed)
  const msgElements = document.querySelectorAll(
    ".adn [data-message-id], .aeJ [data-message-id], .h7 [data-message-id], [data-message-id]"
  );
  if (msgElements.length === 0) return null;
  const lastMsg = msgElements[msgElements.length - 1]!;

  // Walk up to find the email thread/message container
  // Gmail wraps each message in nested divs - find a reasonable ancestor
  let container = lastMsg.parentElement;
  for (let i = 0; i < 10 && container; i++) {
    // Look for common Gmail email wrapper classes
    if (container.classList.contains("adn") ||
        container.classList.contains("aeJ") ||
        container.getAttribute("role") === "main" ||
        container.classList.contains("nH")) {
      return container;
    }
    container = container.parentElement;
  }

  // Fallback: use the message element's parent
  return (lastMsg.closest(".adn, .aeJ, [role='main']") ?? lastMsg.parentElement) as HTMLElement | null;
}

/** Extract sender email from Gmail's rendered DOM, scoped to the displayed email */
function extractSenderFromDom(): { from: string; fromDomain: string } | null {
  const container = getDisplayedEmailContainer() ?? document;

  // Strategy 1: .gD[email] is Gmail's specific class for the SENDER element
  // This is the most reliable selector - .gD is only used for the "From" line
  const senderSpans = container.querySelectorAll(".gD[email]");
  if (senderSpans.length > 0) {
    // Take the LAST match (most recently rendered = currently displayed email)
    const span = senderSpans[senderSpans.length - 1]!;
    const email = span.getAttribute("email") ?? "";
    if (email.includes("@")) {
      const domain = email.split("@").pop()!.toLowerCase();
      console.log(LOG_PREFIX, "Sender from DOM (.gD):", email, "domain:", domain,
        `(match ${senderSpans.length}/${senderSpans.length})`);
      return { from: email, fromDomain: domain };
    }
  }

  // Strategy 2: Look for sender text in the email header area
  // Gmail shows "Name <email@domain.com>" near the displayed email
  // The .go class wraps the expanded sender details (shown after clicking "to me")
  const headerAreas = container.querySelectorAll(".go, .gE");
  for (let i = headerAreas.length - 1; i >= 0; i--) {
    const text = headerAreas[i]!.textContent ?? "";
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) {
      const email = emailMatch[0];
      const domain = email.split("@").pop()!.toLowerCase();
      console.log(LOG_PREFIX, "Sender from DOM header text:", email);
      return { from: email, fromDomain: domain };
    }
  }

  // Strategy 3: Find the sender from the "From:" line shown in the email header
  // Look for data-hovercard-id on sender avatar/name elements (not recipient)
  const hoverCards = container.querySelectorAll("[data-hovercard-id]");
  for (const el of hoverCards) {
    const id = el.getAttribute("data-hovercard-id") ?? "";
    if (id.includes("@") && !id.includes("gmail.com")) {
      // Skip the user's own email (likely the recipient)
      const domain = id.split("@").pop()!.toLowerCase();
      console.log(LOG_PREFIX, "Sender from hovercard:", id);
      return { from: id, fromDomain: domain };
    }
  }

  return null;
}

/** Extract links from the visible email body in Gmail's DOM */
function extractLinksFromDom(): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  // Scope to the displayed email container
  const scope = getDisplayedEmailContainer() ?? document;
  // Gmail email body is typically in .a3s or .ii class
  const bodyContainers = scope.querySelectorAll(".a3s, .ii, [data-message-id] + div");

  for (const container of bodyContainers) {
    const anchors = container.querySelectorAll("a[href]");
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("mailto:") || href.startsWith("#")) continue;

      try {
        const url = new URL(href, "https://mail.google.com");
        // Gmail wraps links through google.com/url?q= - extract the real URL
        let realDomain = url.hostname.toLowerCase();
        if (realDomain === "www.google.com" && url.pathname === "/url") {
          const q = url.searchParams.get("q");
          if (q) {
            try {
              realDomain = new URL(q).hostname.toLowerCase();
            } catch { /* keep google.com */ }
          }
        }

        if (!seen.has(realDomain)) {
          seen.add(realDomain);
          links.push({
            href,
            domain: realDomain,
            displayText: (anchor as HTMLElement).textContent?.trim() ?? "",
          });
        }
      } catch { /* skip invalid URLs */ }
    }
  }

  console.log(LOG_PREFIX, "Links from DOM:", links.length, links.map(l => l.domain));
  return links;
}

/** Extract the visible email body text from Gmail's DOM */
function extractBodyTextFromDom(): string {
  const scope = getDisplayedEmailContainer() ?? document;
  const bodyContainers = scope.querySelectorAll(".a3s, .ii");
  const parts: string[] = [];
  for (const container of bodyContainers) {
    const text = (container as HTMLElement).innerText;
    if (text.trim()) parts.push(text);
  }
  // Also include the subject
  const subjectEl = scope.querySelector(".hP, h2.hP") ?? document.querySelector(".hP, h2.hP");
  if (subjectEl) {
    parts.unshift((subjectEl as HTMLElement).innerText);
  }
  return parts.join("\n");
}

/** Run the full analysis pipeline - tries .eml first, falls back to DOM parsing */
async function analyzeEmail(threadId: string) {
  // Try .eml fetch first (gives us full headers including auth)
  const emlContent = await tryFetchEml(threadId);

  if (emlContent && emlContent.length > 100) {
    console.log(LOG_PREFIX, "Using .eml-based analysis (full headers available)");
    const metadata = parseEmailHeaders(emlContent);
    console.log(LOG_PREFIX, "Parsed metadata:", {
      from: metadata.from,
      fromDomain: metadata.fromDomain,
      dkim: metadata.dkim,
      spf: metadata.spf,
      dmarc: metadata.dmarc,
    });
    const links = extractLinks(emlContent);
    console.log(LOG_PREFIX, "Extracted links:", links.length);
    const linkDomains = links.map((l) => l.domain);
    const domainAnalysis = analyzeDomains(metadata, linkDomains);
    const urgencyAnalysis = detectUrgency(emlContent);
    return scoreEmail(metadata, domainAnalysis, urgencyAnalysis);
  }

  // Fallback: DOM-based analysis (no auth headers, but links/urgency/domains work)
  console.log(LOG_PREFIX, "Using DOM-based analysis (auth headers not available)");
  const sender = extractSenderFromDom();
  if (!sender) {
    throw new Error("Could not identify the sender. Try opening the email in full view.");
  }

  const metadata: EmailMetadata = {
    from: sender.from,
    fromDomain: sender.fromDomain,
    replyTo: null,
    replyToDomain: null,
    returnPath: null,
    returnPathDomain: null,
    messageId: null,
    subject: (getDisplayedEmailContainer() ?? document).querySelector(".hP, h2.hP")?.textContent
      ?? document.querySelector(".hP, h2.hP")?.textContent ?? "",
    dkim: "none",
    dkimDomain: null,
    spf: "none",
    dmarc: "none",
    receivedDomains: [],
  };

  const links = extractLinksFromDom();
  const linkDomains = links.map((l) => l.domain);
  const domainAnalysis = analyzeDomains(metadata, linkDomains);

  const bodyText = extractBodyTextFromDom();
  const urgencyAnalysis = detectUrgency(bodyText);

  console.log(LOG_PREFIX, "DOM analysis - sender:", sender.fromDomain,
    "links:", linkDomains.length, "urgency:", urgencyAnalysis.hasUrgency);

  const scoreOptions: ScoreOptions = { skipAuth: true };
  return scoreEmail(metadata, domainAnalysis, urgencyAnalysis, scoreOptions);
}

/** Find the Gmail toolbar and inject the iris button */
function injectButton(): void {
  // Avoid duplicate injection
  if (document.getElementById("iris-check-button")) return;

  // Try multiple toolbar selectors (Gmail changes these)
  const selectors = [
    '[role="toolbar"][gh="mtb"]',        // Main toolbar in email view
    '[role="toolbar"][gh="tm"]',         // Thread toolbar
    '.iH > div > [role="toolbar"]',      // Alternative structure
    'div.nH [role="toolbar"]',           // Broader match
  ];

  let toolbar: HTMLElement | null = null;
  for (const selector of selectors) {
    toolbar = document.querySelector(selector) as HTMLElement | null;
    if (toolbar) {
      console.log(LOG_PREFIX, "Found toolbar with selector:", selector);
      break;
    }
  }

  if (!toolbar) {
    console.log(LOG_PREFIX, "No toolbar found, will retry on navigation");
    return;
  }

  const button = document.createElement("div");
  button.id = "iris-check-button";
  button.className = "iris-toolbar-button";
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", "Check email with nicodAImus iris");
  button.setAttribute("data-tooltip", "Check with iris");
  button.textContent = "iris";

  button.addEventListener("click", handleCheck);

  toolbar.appendChild(button);
  console.log(LOG_PREFIX, "Button injected into toolbar");
}

/** Handle the check button click */
async function handleCheck(): Promise<void> {
  const button = document.getElementById("iris-check-button");

  // Remove any previous result
  const existing = document.getElementById("iris-result-card");
  if (existing) existing.remove();

  if (button) {
    button.textContent = "...";
    button.classList.add("iris-loading");
  }

  try {
    const threadId = getThreadId();
    if (!threadId) {
      showError("Could not identify the current email. Try opening it in full view.");
      return;
    }

    const result = await analyzeEmail(threadId);

    // Build result card as DOM element (no innerHTML, CSP-safe)
    const cardElement = createResultCardElement(result);

    // Try to insert result card above the email body
    const containerSelectors = [
      ".adn.ads",                          // Email view container
      '[role="main"] .nH .nH .nH',        // Nested container
      '[role="list"]',                      // Conversation view
      '[role="main"]',                      // Fallback
    ];

    let container: HTMLElement | null = null;
    for (const selector of containerSelectors) {
      container = document.querySelector(selector) as HTMLElement | null;
      if (container) break;
    }

    if (container) {
      const wrapper = document.createElement("div");
      wrapper.id = "iris-result-card";
      wrapper.appendChild(cardElement);
      container.insertBefore(wrapper, container.firstChild);
      console.log(LOG_PREFIX, "Result card inserted");
    } else {
      console.warn(LOG_PREFIX, "No container found for result card");
    }
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
    console.error(LOG_PREFIX, "Analysis error:", err);
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

  const wrapper = document.createElement("div");
  wrapper.id = "iris-result-card";

  const card = document.createElement("div");
  card.className = "iris-card iris-card-error";

  const p = document.createElement("p");
  p.textContent = message;

  card.appendChild(p);
  wrapper.appendChild(card);
  container.insertBefore(wrapper, container.firstChild);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (
    message: { action: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { html: string | null }) => void
  ) => {
    if (message.action === "iris-check") {
      handleCheck().then(() => {
        const resultCard = document.getElementById("iris-result-card");
        sendResponse({ html: resultCard?.innerHTML ?? null });
      });
      return true; // async response
    }
  }
);

// Observe Gmail navigation (SPA - URL changes without page reload)
let lastHash = window.location.hash;
const observer = new MutationObserver(() => {
  const currentHash = window.location.hash;
  if (currentHash !== lastHash) {
    lastHash = currentHash;
    console.log(LOG_PREFIX, "Navigation detected:", currentHash);
    // Small delay to let Gmail render the new view
    setTimeout(injectButton, 500);
    setTimeout(injectButton, 1500); // retry in case Gmail is slow
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial injection with retries
console.log(LOG_PREFIX, "Content script loaded on", window.location.href);
setTimeout(injectButton, 1000);
setTimeout(injectButton, 3000);
setTimeout(injectButton, 5000);
