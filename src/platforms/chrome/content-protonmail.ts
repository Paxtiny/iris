// nicodAImus iris - ProtonMail content script
// DOM-only analysis (no raw EML fetch); auth headers not available without clicking
// "View headers" - Phase 2 can add that. Links, urgency, and domain signals work fully.

import { parseEmailHeaders } from "../../core/headerParser";
import { analyzeDomains } from "../../core/domainAnalyzer";
import { detectUrgency } from "../../core/urgencyDetector";
import { analyzeAttachments } from "../../core/attachmentAnalyzer";
import { scoreEmail } from "../../core/scorer";
import { createResultCardElement } from "../../ui/components";
import type { EmailMetadata, ExtractedLink, AttachmentInfo } from "../../core/types";

const LOG_PREFIX = "[iris:proton]";

// data-testid attributes confirmed from ProtonMail WebClients open-source repo.
// These survive CSS class obfuscation between deploys.
const SEL = {
  contentIframe: '[data-testid="content-iframe"]',
  recipientSender: '[data-testid="recipients:sender"]',
  // message-header-expanded uses a per-conversation-index suffix
  expandedHeader: (i: number) => `[data-testid="message-header-expanded:${i}"]`,
  roleMain: '[role="main"]',
} as const;

// ─── Navigation helpers ───────────────────────────────────────────────────────

/** Outbound folders we skip (user's own sent/draft mail). */
function isOutboundFolder(): boolean {
  return /^\/(sent|drafts|all-drafts|outbox|scheduled)/.test(
    window.location.pathname
  );
}

/** An email is open when the path has at least 2 non-empty segments:
 *  /inbox/<conversationID>  or  /inbox/<convID>/<messageID> */
function isEmailOpen(): boolean {
  return window.location.pathname.split("/").filter(Boolean).length >= 2;
}

// ─── DOM extraction ───────────────────────────────────────────────────────────

/** Return the last VISIBLE content iframe (last received message in a thread). */
function getContentIframe(): HTMLIFrameElement | null {
  const iframes = document.querySelectorAll<HTMLIFrameElement>(SEL.contentIframe);
  if (iframes.length === 0) return null;

  let last: HTMLIFrameElement | null = null;
  for (const iframe of iframes) {
    const rect = iframe.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) last = iframe;
  }
  return last ?? iframes[iframes.length - 1]!;
}

/** Subject lives in the data-subject attribute on the iframe element.
 *  Falls back to document.title (ProtonMail sets title to the subject). */
function extractSubject(): string {
  const iframe = getContentIframe();
  if (iframe?.dataset.subject) return iframe.dataset.subject;
  // document.title is "Subject | Proton Mail"
  return document.title.replace(/\s*\|\s*Proton Mail\s*$/i, "").trim();
}

/** Extract sender address from ProtonMail's expanded header. Multiple strategies:
 *  1. [title*="@"] inside [data-testid="recipients:sender"]
 *  2. Text regex inside [data-testid="recipients:sender"]
 *  3. Any [title*="@"] inside any expanded header (fallback) */
function extractSender(): { from: string; fromDomain: string } | null {
  // Strategy 1: title attribute on any child of the sender container
  const senderContainer = document.querySelector(SEL.recipientSender);
  if (senderContainer) {
    // ProtonMail RecipientItem renders a button/span with title="email@domain.com"
    const withTitle = senderContainer.querySelector<HTMLElement>("[title*='@']");
    const email = parseEmail(withTitle?.getAttribute("title") ?? senderContainer.textContent ?? "");
    if (email) return email;
  }

  // Strategy 2: scan first few expanded headers for any email address
  for (let i = 0; i < 5; i++) {
    const header = document.querySelector(SEL.expandedHeader(i));
    if (!header) continue;
    // Check title attributes first (more reliable than text)
    for (const el of header.querySelectorAll("[title*='@']")) {
      const email = parseEmail(el.getAttribute("title") ?? "");
      if (email) return email;
    }
    // Fall back to plain text scan
    const email = parseEmail(header.textContent ?? "");
    if (email) return email;
  }

  return null;
}

/** Parse first valid email address out of a string. Returns null if none found. */
function parseEmail(text: string): { from: string; fromDomain: string } | null {
  const match = text.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
  if (!match) return null;
  const from = match[0].toLowerCase();
  const fromDomain = from.split("@").pop()!;
  return { from, fromDomain };
}

/** Extract links from the body iframe's DOM.
 *  ProtonMail uses allow-same-origin on the iframe, so contentDocument is accessible.
 *  Links keep their original href (ProtonMail only strips UTM params and adds rel attrs).
 *  Images are proxied through core/v4/images but we don't scan images. */
function extractLinksFromIframe(): ExtractedLink[] {
  const iframe = getContentIframe();
  const body = iframe?.contentDocument?.body;
  if (!body) {
    console.log(LOG_PREFIX, "No iframe body - contentDocument not accessible yet");
    return [];
  }

  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  for (const anchor of body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("mailto:") || href.startsWith("#")) continue;

    try {
      const domain = new URL(href).hostname.toLowerCase();
      if (!seen.has(domain)) {
        seen.add(domain);
        links.push({ href, domain, displayText: anchor.textContent?.trim() ?? "" });
      }
    } catch { /* skip malformed URLs */ }
  }

  console.log(LOG_PREFIX, "Links from iframe:", links.length, links.map((l) => l.domain));
  return links;
}

/** Extract plain text from the body iframe for urgency detection. */
function extractBodyText(): string {
  const iframe = getContentIframe();
  const body = iframe?.contentDocument?.body as HTMLElement | null | undefined;
  return body?.innerText ?? "";
}

/** Extract attachment filenames from ProtonMail's rendered DOM.
 *  ProtonMail renders an attachment list outside the body iframe.
 *  Priority: [download] attribute > title attribute > parsed textContent */
function extractAttachmentsFromDom(): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  const seen = new Set<string>();

  function addFilename(raw: string | null | undefined): void {
    const filename = cleanFilename(raw);
    if (filename && !seen.has(filename)) {
      seen.add(filename);
      attachments.push({ filename });
    }
  }

  // Strategy 1: [download] attribute on anchor tags - most reliable, set by ProtonMail
  // to the actual filename without any surrounding text.
  for (const el of document.querySelectorAll<HTMLAnchorElement>("a[download]")) {
    addFilename(el.getAttribute("download"));
  }

  // Strategy 2: data-testid="attachment:name" - ProtonMail's named filename span
  for (const el of document.querySelectorAll<HTMLElement>('[data-testid="attachment:name"]')) {
    addFilename(el.getAttribute("title") ?? el.textContent);
  }

  // Strategy 3: data-testid="attachment-item" containers - extract filename from title/aria-label
  // Avoid textContent on the whole container (it includes size + button text).
  for (const el of document.querySelectorAll<HTMLElement>('[data-testid="attachment-item"]')) {
    addFilename(el.getAttribute("title") ?? el.getAttribute("aria-label"));
    // Also check immediate child with title
    const child = el.querySelector<HTMLElement>("[title]");
    if (child) addFilename(child.getAttribute("title"));
  }

  if (attachments.length > 0) {
    console.log(LOG_PREFIX, "Attachments from DOM:", attachments.map((a) => a.filename));
  }
  return attachments;
}

/** Extract a clean filename from a raw string.
 *  Handles cases like "Rechnung.pdf243.76 KB Download Rechnung.pdf" by finding
 *  the first token that looks like a filename (no spaces, has extension). */
function cleanFilename(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  // If it has no spaces and has an extension - it's already clean
  if (!text.includes(" ") && text.includes(".")) return text;

  // Extract first space-free token that contains a file extension
  const match = text.match(/\S+\.[a-zA-Z0-9]{1,10}/);
  if (match) return match[0];

  return null;
}

// ─── HTML helpers for popup responses ────────────────────────────────────────

/** ProtonMail domains used for personal accounts (own sent messages). */
const PROTONMAIL_OWN_DOMAINS = new Set([
  "protonmail.com", "protonmail.ch", "pm.me", "proton.me",
]);

function createInfoHtml(message: string): string {
  return `<div class="iris-card iris-card-info"><span class="iris-info-icon">i</span><p>${message}</p></div>`;
}

function createErrorHtml(message: string): string {
  return `<div class="iris-card iris-card-error"><p>${message}</p></div>`;
}

// ─── View headers modal ───────────────────────────────────────────────────────

/** Wait for a DOM element to appear, up to timeoutMs.
 *  Uses setInterval polling (50ms) rather than MutationObserver to avoid
 *  freezing on React SPAs that fire thousands of mutations per second. */
function waitForElement(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) { resolve(existing); return; }

    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) { clearInterval(interval); resolve(el); return; }
      if (Date.now() - start >= timeoutMs) { clearInterval(interval); resolve(null); }
    }, 50);
  });
}

/** Open ProtonMail's "View headers" modal and return the raw header text.
 *
 *  Strategy:
 *  1. Try clicking the "View headers" item directly (dropdown already open).
 *  2. If not visible, find the "more" dropdown toggle and click it first.
 *  3. Read the <pre> inside the modal and close it.
 *  4. Return null on any failure so the caller falls back to DOM-only mode. */
async function fetchRawHeadersViaModal(): Promise<string | null> {
  // Selectors for the "more" dropdown toggle button.
  // ProtonMail's HeaderMoreDropdown uses SimpleDropdown - the trigger button
  // sits adjacent to the reply/forward buttons. We try known data-testid
  // patterns; fall back to aria-label / title attributes.
  const TOGGLE_SELECTORS = [
    '[data-testid="message-view-more-dropdown:trigger"]',
    '[data-testid="message-view:more-dropdown"]',
    '[data-testid="message-header-expanded:more-dropdown"]',
    '[data-testid="toolbar:more"]',
    'button[aria-label="More"]',
    'button[title="More"]',
    'button[aria-label="More options"]',
    'button[title="More options"]',
  ];

  const ITEM_SEL   = '[data-testid="message-view-more-dropdown:view-message-headers"]';
  const MODAL_PRE  = '.message-headers-modal pre.text-break';
  const CLOSE_SELS = [
    '[data-testid="modal:close"]',
    '.message-headers-modal button[aria-label="Close"]',
    '.message-headers-modal button.modal-close',
    '.modal button[aria-label="Close"]',
  ];

  try {
    // Step 1: open the dropdown if the menu item isn't already in the DOM.
    let item = document.querySelector<HTMLElement>(ITEM_SEL);
    if (!item) {
      let toggle: HTMLElement | null = null;
      for (const sel of TOGGLE_SELECTORS) {
        toggle = document.querySelector<HTMLElement>(sel);
        if (toggle) { console.log(LOG_PREFIX, "Found dropdown toggle:", sel); break; }
      }
      if (!toggle) {
        console.log(LOG_PREFIX, "View-headers: could not find dropdown toggle");
        return null;
      }
      toggle.click();
      item = await waitForElement(ITEM_SEL, 2000);
      if (!item) {
        console.log(LOG_PREFIX, "View-headers: menu item did not appear after toggle click");
        return null;
      }
    }

    // Step 2: click "View headers".
    item.click();

    // Step 3: wait for the modal <pre> to appear.
    const pre = await waitForElement(MODAL_PRE, 3000);
    if (!pre) {
      console.log(LOG_PREFIX, "View-headers: modal <pre> did not appear");
      return null;
    }
    const rawHeaders = pre.textContent ?? "";
    console.log(LOG_PREFIX, "View-headers: got", rawHeaders.length, "chars");

    // Step 4: close the modal.
    for (const sel of CLOSE_SELS) {
      const btn = document.querySelector<HTMLElement>(sel);
      if (btn) { btn.click(); break; }
    }

    return rawHeaders.length > 50 ? rawHeaders : null;
  } catch (err) {
    console.log(LOG_PREFIX, "View-headers error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Analysis pipeline ────────────────────────────────────────────────────────

// Module-level state from the last DOM-only pass, used by iris-verify-auth.
let _lastLinkDomains: string[] = [];
let _lastBodyText = "";
let _lastSubject = "";

interface AnalysisResponse { html: string | null; subject?: string; from?: string; provider?: string }

async function analyzeEmail(): Promise<AnalysisResponse> {
  try {
    const subject = extractSubject();
    const links = extractLinksFromIframe();
    const bodyText = extractBodyText();
    const linkDomains = links.map((l) => l.domain);

    // Persist for iris-verify-auth
    _lastLinkDomains = linkDomains;
    _lastBodyText = bodyText;
    _lastSubject = subject;

    // DOM-only analysis - instant, no UI interaction, no freeze risk.
    // The user can optionally trigger a header fetch via the button below.
    const sender = extractSender();
    if (!sender) {
      return { html: createErrorHtml("Could not identify the sender. Try opening the email in full view.") };
    }

    // If the "sender" is a ProtonMail address and we're in a thread (multiple iframes),
    // we've grabbed the user's own reply rather than the inbound email.
    const iframeCount = document.querySelectorAll(SEL.contentIframe).length;
    if (PROTONMAIL_OWN_DOMAINS.has(sender.fromDomain) && iframeCount > 1) {
      return { html: createInfoHtml("This is your own reply. Scroll to the original inbound email in the thread and scan that message.") };
    }

    const metadata: EmailMetadata = {
      from: sender.from,
      fromDomain: sender.fromDomain,
      replyTo: null,
      replyToDomain: null,
      returnPath: null,
      returnPathDomain: null,
      messageId: null,
      subject,
      dkim: "none",
      dkimDomain: null,
      spf: "none",
      dmarc: "none",
      receivedDomains: [],
    };

    console.log(LOG_PREFIX, "DOM-only analysis:", {
      sender: metadata.from,
      subject: metadata.subject,
      links: linkDomains.length,
    });

    const domainAnalysis = analyzeDomains(metadata, linkDomains);
    const urgencyAnalysis = detectUrgency(`${subject}\n\n${bodyText}`);
    const rawAttachments = extractAttachmentsFromDom();
    const attachmentAnalysis = analyzeAttachments(rawAttachments);
    const result = scoreEmail(metadata, domainAnalysis, urgencyAnalysis, { skipAuth: true }, attachmentAnalysis);

    const cardElement = createResultCardElement(result);
    // Append verify button so the popup can find and re-attach its click handler.
    addVerifyButton(cardElement);
    return { html: cardElement.outerHTML, subject, from: sender.from, provider: "protonmail" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(LOG_PREFIX, "Analysis error:", err);
    return { html: createErrorHtml(`Analysis failed: ${message}`) };
  }
}

/** Append a "Verify authentication" button to an existing result card element.
 *  The button appears in the HTML returned to the popup; the popup re-attaches
 *  the click handler and sends an iris-verify-auth message back to this script. */
function addVerifyButton(card: HTMLElement): void {
  const btn = document.createElement("button");
  btn.className = "iris-btn-verify";
  btn.textContent = "Verify authentication (DKIM/SPF/DMARC)";
  card.appendChild(btn);
}

// ─── Message listener (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { action: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: AnalysisResponse) => void
  ) => {
    // ── iris-check: full DOM-only analysis ────────────────────────────────
    if (message.action === "iris-check") {
      if (isOutboundFolder()) {
        sendResponse({ html: createInfoHtml("Outbound mail - no phishing scan needed.") });
        return true;
      }
      if (!isEmailOpen()) {
        sendResponse({ html: createErrorHtml("Open an email first, then click the iris button.") });
        return true;
      }
      analyzeEmail().then((response) => sendResponse(response));
      return true;
    }

    // ── iris-verify-auth: fetch headers and re-score ──────────────────────
    // Triggered by the popup when the user clicks "Verify authentication".
    if (message.action === "iris-verify-auth") {
      (async () => {
        const rawHeaders = await fetchRawHeadersViaModal();
        if (!rawHeaders) {
          sendResponse({ html: null });
          return;
        }
        // X-Pm-Origin: internal means this is the user's own outgoing message.
        // ProtonMail does not add authentication results for outgoing mail, so
        // DKIM/SPF/DMARC all read as "none" - scoring it would produce a false alarm.
        if (/^X-Pm-Origin:\s*internal/im.test(rawHeaders)) {
          sendResponse({ html: createInfoHtml("This is your own outgoing message - not a phishing risk.") });
          return;
        }

        try {
          let metadata = parseEmailHeaders(rawHeaders);
          if (!metadata.subject) metadata = { ...metadata, subject: _lastSubject };

          console.log(LOG_PREFIX, "Header-based re-analysis:", {
            sender: metadata.from,
            dkim: metadata.dkim,
            spf: metadata.spf,
            dmarc: metadata.dmarc,
            links: _lastLinkDomains.length,
          });

          const domainAnalysis = analyzeDomains(metadata, _lastLinkDomains);
          const urgencyAnalysis = detectUrgency(`${_lastSubject}\n\n${_lastBodyText}`);
          const rawAttachments = extractAttachmentsFromDom();
          const attachmentAnalysis = analyzeAttachments(rawAttachments);
          const result = scoreEmail(metadata, domainAnalysis, urgencyAnalysis, {}, attachmentAnalysis);
          const cardEl = createResultCardElement(result);
          sendResponse({ html: cardEl.outerHTML, subject: _lastSubject, from: metadata.from });
        } catch (err) {
          console.error(LOG_PREFIX, "Header analysis error:", err);
          sendResponse({ html: null });
        }
      })();
      return true;
    }
  }
);

// ─── SPA navigation cleanup ───────────────────────────────────────────────────
// ProtonMail uses History API (pushState) - hashchange does not fire.
// Watch document.title (cheapest signal; ProtonMail sets it to the subject or folder name).

let lastPathname = window.location.pathname;

function onNavigation(): void {
  const current = window.location.pathname;
  if (current !== lastPathname) {
    lastPathname = current;
    console.log(LOG_PREFIX, "Navigation detected:", current);
    // Reset cached state so a stale analysis isn't returned for a new email.
    _lastLinkDomains = [];
    _lastBodyText = "";
    _lastSubject = "";
  }
}

// popstate fires on browser back/forward
window.addEventListener("popstate", onNavigation);

// Intercept history.pushState (React Router navigation) by wrapping it.
// This is the standard technique for SPAs that don't fire popstate on pushState.
const _originalPushState = history.pushState.bind(history);
history.pushState = function (...args) {
  _originalPushState(...args);
  onNavigation();
};

const _originalReplaceState = history.replaceState.bind(history);
history.replaceState = function (...args) {
  _originalReplaceState(...args);
  onNavigation();
};

console.log(LOG_PREFIX, "Content script loaded on", window.location.href);
