import type { ExtractedLink } from "./types";

/**
 * Extract links from HTML email body.
 * Parses href attributes from <a> tags without external dependencies.
 */
export function extractLinks(emlContent: string): ExtractedLink[] {
  const body = extractHtmlBody(emlContent);
  if (!body) return [];

  const links: ExtractedLink[] = [];
  // Match <a ...href="..."...>...</a> patterns
  const linkRegex = /<a\s[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(body)) !== null) {
    const href = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    const displayText = stripHtml(match[4] ?? "").trim();

    if (!href || href.startsWith("mailto:") || href.startsWith("#")) continue;

    const domain = extractDomainFromUrl(href);
    if (domain) {
      links.push({ href, domain, displayText });
    }
  }

  // Deduplicate by domain
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.domain)) return false;
    seen.add(l.domain);
    return true;
  });
}

/** Extract the HTML body from a multipart .eml file */
function extractHtmlBody(eml: string): string | null {
  // Look for Content-Type: text/html section in multipart message
  const htmlMarker = /Content-Type:\s*text\/html/i;
  const htmlIdx = eml.search(htmlMarker);

  if (htmlIdx === -1) {
    // Not multipart - check if the whole thing is HTML
    if (eml.includes("<html") || eml.includes("<a ")) return eml;
    return null;
  }

  // Find the start of HTML content (after the blank line following headers)
  const afterMarker = eml.substring(htmlIdx);
  const blankLineIdx = afterMarker.search(/\r?\n\r?\n/);
  if (blankLineIdx === -1) return null;

  const htmlStart = afterMarker.substring(blankLineIdx + 2);

  // Find the MIME boundary that ends this section
  // Look for a boundary pattern (--boundary)
  const boundaryMatch = eml.match(/boundary\s*=\s*"?([^"\s;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1]!;
    const endIdx = htmlStart.indexOf(`--${boundary}`);
    if (endIdx !== -1) {
      return decodeContent(htmlStart.substring(0, endIdx));
    }
  }

  return decodeContent(htmlStart);
}

/** Decode quoted-printable or base64 content */
function decodeContent(content: string): string {
  // Check for Content-Transfer-Encoding in nearby headers
  if (content.includes("Content-Transfer-Encoding: base64")) {
    const lines = content.split(/\r?\n/).filter((l) => !l.includes(":") && l.trim());
    try {
      return atob(lines.join(""));
    } catch {
      return content;
    }
  }

  // Decode quoted-printable
  return content
    .replace(/=\r?\n/g, "") // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/** Extract domain from a URL */
function extractDomainFromUrl(url: string): string {
  try {
    // Handle protocol-relative URLs
    const fullUrl = url.startsWith("//") ? "https:" + url : url;
    if (!fullUrl.startsWith("http")) return "";
    const parsed = new URL(fullUrl);
    return parsed.hostname.toLowerCase();
  } catch {
    // Fallback: try regex extraction
    const match = url.match(/https?:\/\/([^/:\s?#]+)/i);
    return match ? match[1]!.toLowerCase() : "";
  }
}

/** Strip HTML tags from text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}
