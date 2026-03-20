// nicodAImus iris - Gmail content script
// Injects the "iris" check button and handles email analysis

import { parseEmailHeaders, parseAttachments } from "../../core/headerParser";
import { analyzeDomains } from "../../core/domainAnalyzer";
import { extractLinks } from "../../core/linkExtractor";
import { detectUrgency } from "../../core/urgencyDetector";
import { analyzeAttachments } from "../../core/attachmentAnalyzer";
import { analyzeContent } from "../../core/contentAnalyzer";
import { scoreEmail, type ScoreOptions } from "../../core/scorer";
import { createResultCardElement } from "../../ui/components";
import type { EmailMetadata, ExtractedLink } from "../../core/types";

const LOG_PREFIX = "[iris]";

/**
 * Check if a data-message-id element belongs to the logged-in user (sent message).
 * Gmail uses "msg-f:" for fetched/received and "msg-a:" for authored/sent messages.
 */
function isOwnMessage(msgElement: Element): boolean {
  const msgId = msgElement.getAttribute("data-message-id") ?? "";
  // Gmail internal convention: msg-a: = authored (sent), msg-f: = fetched (received)
  if (msgId.startsWith("#msg-a:")) {
    console.log(LOG_PREFIX, "Skipping own (authored) message:", msgId);
    return true;
  }
  return false;
}

/** Identified email ID with its source, so we can construct the right URL */
interface EmailId {
  /** The raw ID value */
  id: string;
  /** Where we got it from - determines URL parameter format */
  source: "url-hash" | "data-message-id" | "row-attribute" | "row-link" | "display-container";
  /** True if only the user's own sent messages were visible */
  ownMessageOnly?: boolean;
}

/**
 * Extract the Gmail thread/message ID for the currently displayed email.
 * Tries multiple strategies, prioritizing the ACTIVE/DISPLAYED email.
 */
function getEmailId(): EmailId | null {
  // Strategy 1: URL hash (full email view: #inbox/19cfd44438459c06)
  const hash = window.location.hash;
  const hashMatch = hash.match(/\/([a-f0-9]{16,})$/i);
  if (hashMatch?.[1]) {
    console.log(LOG_PREFIX, "Thread ID from URL hash:", hashMatch[1]);
    return { id: hashMatch[1], source: "url-hash" };
  }

  // Strategy 2: Find data-message-id within the VISIBLE email content area
  const emailDisplaySelectors = [
    ".adn [data-message-id]",
    ".aeJ [data-message-id]",
    ".h7 [data-message-id]",
    "[data-message-id]",
  ];

  for (const selector of emailDisplaySelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Pick the last VISIBLE, NON-SELF element.
      // Skip the user's own sent messages (msg-a:) - analyze incoming mail only.
      let targetEl: Element | null = null;
      let fallbackEl: Element | null = null;
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          fallbackEl = el;
          if (!isOwnMessage(el)) {
            targetEl = el;
          }
        }
      }
      // If only own messages visible, flag it - user already replied, no need to scan
      const ownOnly = targetEl === null && fallbackEl !== null;
      targetEl ??= fallbackEl ?? elements[elements.length - 1]!;
      const msgId = targetEl.getAttribute("data-message-id");
      if (msgId) {
        console.log(LOG_PREFIX, `Message ID from "${selector}" (${elements.length} total${ownOnly ? ", own message only" : ""}):`, msgId);
        return { id: msgId, source: "data-message-id", ownMessageOnly: ownOnly };
      }
    }
  }

  // Strategy 3: Find thread ID from the currently SELECTED row in the email list
  const selectedRowSelectors = [
    "tr.x7", "tr.aqo", "tr[tabindex='0']", "tr.btb",
  ];

  for (const selector of selectedRowSelectors) {
    const row = document.querySelector(selector) as HTMLElement | null;
    if (!row) continue;

    const threadId = row.getAttribute("data-thread-id")
      ?? row.getAttribute("data-thread-perm-id")
      ?? row.getAttribute("data-legacy-thread-id");
    if (threadId) {
      console.log(LOG_PREFIX, "Thread ID from selected row attribute:", threadId);
      return { id: threadId, source: "row-attribute" };
    }

    const rowLinks = row.querySelectorAll("a[href]");
    for (const link of rowLinks) {
      const href = link.getAttribute("href") ?? "";
      const idMatch = href.match(/#[^/]+\/([a-f0-9]{16,})$/i);
      if (idMatch?.[1]) {
        console.log(LOG_PREFIX, "Thread ID from selected row link:", idMatch[1]);
        return { id: idMatch[1], source: "row-link" };
      }
    }
  }

  // Strategy 4: Look for data-thread-perm-id within the email display
  const displayContainers = document.querySelectorAll(".adn, .aeJ, [role='main']");
  for (const container of displayContainers) {
    const threadEl = container.querySelector("[data-thread-perm-id], [data-legacy-thread-id]");
    if (threadEl) {
      const id = threadEl.getAttribute("data-thread-perm-id")
        ?? threadEl.getAttribute("data-legacy-thread-id");
      if (id) {
        console.log(LOG_PREFIX, "Thread ID from display container:", id);
        return { id: id, source: "display-container" };
      }
    }
  }

  console.warn(LOG_PREFIX, "Could not find email ID. URL hash:", hash);
  return null;
}

/** Cached ik value - doesn't change within a Gmail session */
let cachedIk: string | null = null;

/** Extract Gmail's session key (ik parameter) from the page.
 *  Gmail embeds this in GLOBALS or in existing AJAX URLs on the page. */
function getGmailIk(): string | null {
  if (cachedIk) return cachedIk;
  // Method 1: Look for ik= in any script or link on the page
  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    // Gmail stores it in GLOBALS array or as a variable
    const ikMatch = text.match(/\bik\s*[=:]\s*["']([a-f0-9]{10,})["']/i)
      ?? text.match(/GLOBALS\[9\]\s*=\s*["']([a-f0-9]+)["']/i);
    if (ikMatch?.[1]) {
      console.log(LOG_PREFIX, "Gmail ik from script:", ikMatch[1]);
      cachedIk = ikMatch[1];
      return cachedIk;
    }
  }

  // Method 2: Look for ik= in existing links/forms on the page
  const links = document.querySelectorAll("a[href*='ik='], form[action*='ik=']");
  for (const el of links) {
    const url = el.getAttribute("href") ?? el.getAttribute("action") ?? "";
    const match = url.match(/[?&]ik=([a-f0-9]+)/i);
    if (match?.[1]) {
      console.log(LOG_PREFIX, "Gmail ik from link:", match[1]);
      cachedIk = match[1];
      return cachedIk;
    }
  }

  // Method 3: Check the page URL itself
  const urlMatch = window.location.href.match(/[?&]ik=([a-f0-9]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];

  return null;
}

/** Try to extract a hex thread ID from the selected email row or URL.
 *  In preview pane mode, the URL hash doesn't contain the thread ID,
 *  but the selected row's link href does. */
function getThreadHexId(): string | null {
  // Check URL hash first
  const hashMatch = window.location.hash.match(/\/([a-f0-9]{16,})$/i);
  if (hashMatch?.[1]) return hashMatch[1];

  // In preview pane, find the selected/active row and extract thread ID from its link
  const selectedRows = document.querySelectorAll("tr.x7, tr.aqo, tr[tabindex='0'], tr.btb, tr.zA.yO");
  for (const row of selectedRows) {
    const links = row.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      const idMatch = href.match(/#[^/]+\/([a-f0-9]{16,})$/i);
      if (idMatch?.[1]) {
        console.log(LOG_PREFIX, "Thread hex ID from selected row:", idMatch[1]);
        return idMatch[1];
      }
    }
    // Also check data attributes
    const threadId = row.getAttribute("data-thread-id") ?? row.getAttribute("data-legacy-thread-id");
    if (threadId && /^[a-f0-9]{16,}$/i.test(threadId)) {
      return threadId;
    }
  }

  return null;
}

/** Try to fetch the raw email source via Gmail's "Show Original" view.
 *  Unlike view=att (which redirects to googleusercontent.com and hits CORS),
 *  view=om stays on mail.google.com - same-origin, no CORS issues.
 *  Returns null if it fails - caller should fall back to DOM parsing. */
async function tryFetchEml(emailId: EmailId): Promise<string | null> {
  // Build candidate URLs based on ID source
  const urls: string[] = [];

  const threadHexId = getThreadHexId();
  const ik = getGmailIk();
  const ikParam = ik ? `&ik=${ik}` : "";
  console.log(LOG_PREFIX, "Gmail ik:", ik ?? "not found", "threadHexId:", threadHexId ?? "not found");

  if (emailId.source === "url-hash" || emailId.source === "row-link") {
    urls.push(`/mail/u/0/?view=om${ikParam}&th=${emailId.id}`);
  } else if (emailId.source === "data-message-id") {
    const permMsgId = emailId.id.replace(/^#/, "");
    if (threadHexId) {
      urls.push(`/mail/u/0/?view=om${ikParam}&th=${threadHexId}&permmsgid=${permMsgId}`);
      urls.push(`/mail/u/0/?view=om${ikParam}&th=${threadHexId}`);
    }
    urls.push(`/mail/u/0/?view=om${ikParam}&permmsgid=${permMsgId}`);
    const numericMatch = emailId.id.match(/(\d{10,})/);
    if (numericMatch) {
      const hexId = BigInt(numericMatch[1]!).toString(16);
      urls.push(`/mail/u/0/?view=om${ikParam}&th=${hexId}`);
    }
  } else {
    urls.push(`/mail/u/0/?view=om${ikParam}&th=${emailId.id}`);
    if (threadHexId && threadHexId !== emailId.id) {
      urls.push(`/mail/u/0/?view=om${ikParam}&th=${threadHexId}`);
    }
    urls.push(`/mail/u/0/?view=om${ikParam}&permmsgid=${emailId.id}`);
  }

  for (const url of urls) {
    console.log(LOG_PREFIX, "Trying view=om URL:", url);
    try {
      // Gmail requires X-Same-Domain header for internal AJAX requests
      const response = await fetch(url, {
        credentials: "include",
        headers: { "X-Same-Domain": "1" },
      });
      if (!response.ok) {
        console.log(LOG_PREFIX, "view=om fetch failed:", response.status, url);
        continue;
      }

      const html = await response.text();

      // Extract the raw email from the HTML wrapper
      const rawEmail = extractRawEmailFromShowOriginal(html);
      if (rawEmail && rawEmail.length > 100) {
        console.log(LOG_PREFIX, "Got raw email via view=om, length:", rawEmail.length);
        return rawEmail;
      }

      // Maybe the response is raw text directly
      if (html.includes("From:") && html.includes("Date:") && html.length > 200) {
        console.log(LOG_PREFIX, "view=om returned raw text directly, length:", html.length);
        return html;
      }

      console.log(LOG_PREFIX, "view=om response didn't contain email data, length:", html.length);
    } catch (err) {
      console.log(LOG_PREFIX, "view=om fetch error:", err instanceof Error ? err.message : String(err));
    }
  }

  return null;
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
  // Find the VISIBLE data-message-id element (Gmail keeps old emails in DOM but hides them)
  const msgElements = document.querySelectorAll(
    ".adn [data-message-id], .aeJ [data-message-id], .h7 [data-message-id], [data-message-id]"
  );
  if (msgElements.length === 0) return null;
  // Prefer the last visible NON-SELF message (skip user's own replies in threads)
  let lastMsg: Element | null = null;
  let fallbackMsg: Element | null = null;
  for (const el of msgElements) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      fallbackMsg = el;
      if (!isOwnMessage(el)) {
        lastMsg = el;
      }
    }
  }
  lastMsg ??= fallbackMsg;
  lastMsg ??= msgElements[msgElements.length - 1]!;

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

/** Extract sender email and display name from Gmail's rendered DOM, scoped to the displayed email */
function extractSenderFromDom(): { from: string; fromDomain: string; displayName: string | null } | null {
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
      // Display name is the visible text content of the .gD span (the name shown to the user)
      const displayName = (span as HTMLElement).textContent?.trim() || null;
      console.log(LOG_PREFIX, "Sender from DOM (.gD):", email, "domain:", domain,
        "displayName:", displayName, `(match ${senderSpans.length}/${senderSpans.length})`);
      return { from: email, fromDomain: domain, displayName };
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
      return { from: email, fromDomain: domain, displayName: null };
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
      return { from: id, fromDomain: domain, displayName: null };
    }
  }

  return null;
}

/** Extract reply-to email from Gmail's expanded header, if visible.
 *  Gmail shows "reply-to:" in the .go detail table when it differs from the sender.
 *  Only visible when the user has clicked to expand the header (or Gmail auto-expands it). */
function extractReplyToFromDom(): string | null {
  const container = getDisplayedEmailContainer() ?? document;

  // Strategy 1: Gmail's expanded header detail table (.go) contains "reply-to:" rows
  // The .ajy class labels the header name, the next cell has the value
  for (const cell of container.querySelectorAll<HTMLElement>(".ajy, td")) {
    const label = cell.textContent?.trim().toLowerCase() ?? "";
    if (label === "reply-to:" || label === "reply to:") {
      const valueCell = cell.nextElementSibling as HTMLElement | null;
      if (valueCell) {
        // Try email attribute first, then text content
        const emailEl = valueCell.querySelector<HTMLElement>("[email]");
        const email = emailEl?.getAttribute("email") ?? valueCell.textContent?.trim() ?? "";
        const match = email.match(/[\w.+-]+@[\w.-]+\.\w{2,}/i);
        if (match) {
          console.log(LOG_PREFIX, "Reply-to from DOM:", match[0]);
          return match[0].toLowerCase();
        }
      }
    }
  }

  // Strategy 2: Scan .go containers for "reply-to:" text with email
  for (const go of container.querySelectorAll<HTMLElement>(".go, .gE")) {
    const text = go.textContent ?? "";
    const replyMatch = text.match(/reply[- ]?to:\s*([\w.+-]+@[\w.-]+\.\w{2,})/i);
    if (replyMatch) {
      console.log(LOG_PREFIX, "Reply-to from header text:", replyMatch[1]);
      return replyMatch[1]!.toLowerCase();
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

/** Extract the raw HTML from the email body in Gmail's DOM (for form detection) */
function extractBodyHtmlFromDom(): string | null {
  const scope = getDisplayedEmailContainer() ?? document;
  const bodyContainers = scope.querySelectorAll(".a3s, .ii");
  const parts: string[] = [];
  for (const container of bodyContainers) {
    const html = (container as HTMLElement).innerHTML;
    if (html.trim()) parts.push(html);
  }
  return parts.length > 0 ? parts.join("\n") : null;
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

/** Extract attachment filenames from Gmail's rendered DOM.
 *  Used as fallback when the raw EML is not available.
 *  Gmail renders attachment chips with aria-label="filename (size)" on download buttons,
 *  and stores filenames in [data-tooltip] and as visible text in .aV3 / .vI spans. */
function extractAttachmentsFromDom(): import("../../core/types").AttachmentInfo[] {
  const attachments: import("../../core/types").AttachmentInfo[] = [];
  const seen = new Set<string>();

  const scope = getDisplayedEmailContainer() ?? document;

  // Strategy 1: [download] attribute on anchor elements (most reliable - set by Gmail to filename)
  for (const el of scope.querySelectorAll<HTMLAnchorElement>("a[download]")) {
    const filename = el.getAttribute("download")?.trim();
    if (filename && filename.includes(".") && !seen.has(filename)) {
      seen.add(filename);
      attachments.push({ filename });
    }
  }

  // Strategy 2: aria-label on attachment action buttons ("Download filename.ext")
  for (const el of scope.querySelectorAll<HTMLElement>("[aria-label]")) {
    const label = el.getAttribute("aria-label") ?? "";
    // Gmail format: "Download attachment_name.ext" or just "filename.ext"
    const match = label.match(/(?:Download\s+)?(.+\.[a-zA-Z0-9]{1,10})(?:\s+\([\d.]+\s*[KMG]B\))?$/i);
    if (match?.[1]) {
      const filename = match[1].trim();
      if (!seen.has(filename)) {
        seen.add(filename);
        attachments.push({ filename });
      }
    }
  }

  return attachments;
}

/** Run the full analysis pipeline - tries .eml first, falls back to DOM parsing */
async function analyzeEmail(emailId: EmailId) {
  // Try .eml fetch first (gives us full headers including auth)
  const emlContent = await tryFetchEml(emailId);

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
    const rawAttachments = parseAttachments(emlContent);
    const attachmentAnalysis = analyzeAttachments(rawAttachments);
    if (rawAttachments.length > 0) {
      console.log(LOG_PREFIX, "Attachments from EML:", rawAttachments.map((a) => a.filename));
    }
    const contentAnalysis = analyzeContent({ metadata, links, bodyText: emlContent, bodyHtml: emlContent });
    return scoreEmail(metadata, domainAnalysis, urgencyAnalysis, {}, attachmentAnalysis, contentAnalysis);
  }

  // Fallback: DOM-based analysis (no auth headers, but links/urgency/domains work)
  console.log(LOG_PREFIX, "Using DOM-based analysis (auth headers not available)");
  const sender = extractSenderFromDom();
  if (!sender) {
    throw new Error("Could not identify the sender. Try opening the email in full view.");
  }

  const replyToEmail = extractReplyToFromDom();
  const replyToDomain = replyToEmail ? replyToEmail.split("@").pop()!.toLowerCase() : null;

  const metadata: EmailMetadata = {
    from: sender.from,
    fromDomain: sender.fromDomain,
    displayName: sender.displayName,
    replyTo: replyToEmail,
    replyToDomain,
    returnPath: null,
    returnPathDomain: null,
    messageId: null,
    subject: (() => {
      const c = getDisplayedEmailContainer();
      const wrapper = c?.parentElement ?? c;
      return (wrapper?.querySelector(".hP, h2.hP")
        ?? document.querySelector("[role='main'] .hP, .nH .hP, .aeF .hP"))?.textContent ?? "";
    })(),
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

  // DOM attachment extraction - Gmail renders attachment chips with aria-label
  const domAttachments = extractAttachmentsFromDom();
  const attachmentAnalysis = analyzeAttachments(domAttachments);
  if (domAttachments.length > 0) {
    console.log(LOG_PREFIX, "Attachments from DOM:", domAttachments.map((a) => a.filename));
  }

  // Content analysis (display name spoofing, shorteners, forms, greetings)
  const bodyHtml = extractBodyHtmlFromDom();
  const contentAnalysis = analyzeContent({ metadata, links, bodyText, bodyHtml });

  console.log(LOG_PREFIX, "DOM analysis - sender:", sender.fromDomain,
    "links:", linkDomains.length, "urgency:", urgencyAnalysis.hasUrgency,
    "content signals:", contentAnalysis.signals.length);

  const scoreOptions: ScoreOptions = { skipAuth: true };
  return scoreEmail(metadata, domainAnalysis, urgencyAnalysis, scoreOptions, attachmentAnalysis, contentAnalysis);
}

interface AnalysisResponse { html: string | null; subject?: string; from?: string; provider?: string }

/** Handle the check trigger - returns HTML + metadata for the popup to display. */
async function handleCheck(): Promise<AnalysisResponse> {
  try {
    const emailId = getEmailId();
    if (!emailId) {
      return { html: '<div class="iris-card iris-card-error"><p>Could not identify the current email. Try opening it in full view.</p></div>' };
    }

    if (emailId.ownMessageOnly) {
      return { html: '<div class="iris-card iris-card-info"><span class="iris-info-icon">i</span><p>You already replied to this conversation. No scan needed.</p></div>' };
    }

    const result = await analyzeEmail(emailId);
    const html = createResultCardElement(result).outerHTML;

    // Extract subject and sender scoped to the same container used during analysis,
    // so the metadata matches the email that was actually scored.
    const container = getDisplayedEmailContainer() ?? document;
    // .hP (subject) lives in the thread header (.ha), which is a SIBLING of the message
    // container (.adn), not inside it. Search container.parentElement (the thread wrapper
    // that holds both .ha and .adn) before falling back to [role="main"] - never bare
    // document.querySelector which grabs the first .hP in the inbox list instead.
    const threadWrapper = (container as HTMLElement).parentElement ?? container;
    const subject = (threadWrapper.querySelector<HTMLElement>(".hP, h2.hP")
      ?? document.querySelector<HTMLElement>("[role='main'] .hP, .nH .hP, .aeF .hP"))?.innerText?.trim() ?? "";
    const from = (container.querySelector<HTMLElement>(".gD[email]")
      ?? document.querySelector<HTMLElement>(".gD[email]"))?.getAttribute("email") ?? "";
    return { html, subject, from, provider: "gmail" };
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
    console.error(LOG_PREFIX, "Analysis error:", err);
    return { html: `<div class="iris-card iris-card-error"><p>Analysis failed: ${message}</p></div>` };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (
    message: { action: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: AnalysisResponse) => void
  ) => {
    if (message.action === "iris-check") {
      handleCheck().then((response) => sendResponse(response));
      return true; // async response
    }
  }
);

console.log(LOG_PREFIX, "Content script loaded on", window.location.href);
