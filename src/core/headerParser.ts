import type { AuthResult, EmailMetadata, AttachmentInfo } from "./types";

/** Parse raw .eml content and extract structured email metadata */
export function parseEmailHeaders(emlContent: string): EmailMetadata {
  const headers = extractHeaders(emlContent);

  return {
    from: getHeader(headers, "from") ?? "",
    fromDomain: extractDomain(getHeader(headers, "from") ?? ""),
    replyTo: getHeader(headers, "reply-to"),
    replyToDomain: extractDomain(getHeader(headers, "reply-to") ?? ""),
    returnPath: getHeader(headers, "return-path"),
    returnPathDomain: extractDomain(getHeader(headers, "return-path") ?? ""),
    messageId: getHeader(headers, "message-id"),
    subject: getHeader(headers, "subject") ?? "",
    dkim: parseAuthResult(headers, "dkim"),
    dkimDomain: parseDkimDomain(headers),
    spf: parseAuthResult(headers, "spf"),
    dmarc: parseAuthResult(headers, "dmarc"),
    receivedDomains: parseReceivedDomains(headers),
  };
}

/**
 * Extract headers from raw .eml text.
 * Headers end at the first blank line (double CRLF or double LF).
 * Handles header folding (continuation lines starting with whitespace).
 */
function extractHeaders(eml: string): Map<string, string[]> {
  const headers = new Map<string, string[]>();

  // Split headers from body at blank line
  const headerEndIdx = eml.indexOf("\r\n\r\n");
  const headerEndIdx2 = eml.indexOf("\n\n");
  let headerSection: string;

  if (headerEndIdx !== -1 && (headerEndIdx2 === -1 || headerEndIdx < headerEndIdx2)) {
    headerSection = eml.substring(0, headerEndIdx);
  } else if (headerEndIdx2 !== -1) {
    headerSection = eml.substring(0, headerEndIdx2);
  } else {
    headerSection = eml;
  }

  // Normalize line endings
  const lines = headerSection.replace(/\r\n/g, "\n").split("\n");

  let currentKey = "";
  let currentValue = "";

  for (const line of lines) {
    // Continuation line (starts with whitespace)
    if (/^\s/.test(line) && currentKey) {
      currentValue += " " + line.trim();
      continue;
    }

    // Save previous header
    if (currentKey) {
      const key = currentKey.toLowerCase();
      const existing = headers.get(key) ?? [];
      existing.push(currentValue);
      headers.set(key, existing);
    }

    // Parse new header
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      currentKey = line.substring(0, colonIdx).trim();
      currentValue = line.substring(colonIdx + 1).trim();
    } else {
      currentKey = "";
      currentValue = "";
    }
  }

  // Save last header
  if (currentKey) {
    const key = currentKey.toLowerCase();
    const existing = headers.get(key) ?? [];
    existing.push(currentValue);
    headers.set(key, existing);
  }

  return headers;
}

/** Get the first value for a header (case-insensitive) */
function getHeader(headers: Map<string, string[]>, name: string): string | null {
  const values = headers.get(name.toLowerCase());
  return values?.[0] ?? null;
}

/** Extract domain from an email address or header value */
export function extractDomain(value: string): string {
  if (!value) return "";

  // Handle "Name <email@domain.com>" format
  const angleMatch = value.match(/<([^>]+)>/);
  const email = angleMatch ? angleMatch[1] : value;

  // Handle bare email
  const emailStr = email ?? "";
  const atIdx = emailStr.lastIndexOf("@");
  if (atIdx === -1) return "";

  const domain = emailStr
    .substring(atIdx + 1)
    .trim()
    .replace(/[>;,\s].*/g, "")
    .toLowerCase();

  return domain;
}

/** Parse authentication result from Authentication-Results header */
function parseAuthResult(
  headers: Map<string, string[]>,
  mechanism: string
): AuthResult {
  const authResults = headers.get("authentication-results") ?? [];

  for (const ar of authResults) {
    // Match "dkim=pass", "spf=fail", "dmarc=pass" etc.
    const regex = new RegExp(`${mechanism}\\s*=\\s*(pass|fail|none|softfail|temperror|permerror)`, "i");
    const match = ar.match(regex);
    if (match) {
      const result = match[1]!.toLowerCase();
      if (result === "pass") return "pass";
      if (result === "none") return "none";
      return "fail"; // softfail, fail, temperror, permerror all count as fail
    }
  }

  return "none";
}

/** Extract the DKIM signing domain from Authentication-Results */
function parseDkimDomain(headers: Map<string, string[]>): string | null {
  const authResults = headers.get("authentication-results") ?? [];

  for (const ar of authResults) {
    const match = ar.match(/dkim=pass\s+.*?header\.i=@([a-z0-9.-]+)/i);
    if (match) return match[1]!.toLowerCase();

    const match2 = ar.match(/dkim=pass\s+.*?header\.d=([a-z0-9.-]+)/i);
    if (match2) return match2[1]!.toLowerCase();
  }

  return null;
}

/**
 * Extract attachment filenames from a raw EML/MIME string.
 * Handles Content-Disposition and Content-Type name parameter.
 * Also decodes RFC 2047 encoded-words (=?utf-8?B?...?= / =?utf-8?Q?...?=).
 */
export function parseAttachments(emlContent: string): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  const seen = new Set<string>();

  // Regex for Content-Disposition: attachment; filename="..." or filename*=...
  const dispositionRe =
    /Content-Disposition\s*:\s*attachment[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/gi;
  for (const block of emlContent.matchAll(dispositionRe)) {
    const filename = extractFilenameParam(block[0]);
    if (filename && !seen.has(filename)) {
      seen.add(filename);
      attachments.push({ filename });
    }
  }

  // Regex for Content-Type: ...; name="..." (catches inline attachments not in Content-Disposition)
  const contentTypeRe =
    /Content-Type\s*:\s*([a-z0-9!#$&\-^_]+\/[a-z0-9!#$&\-^_.+]+)[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/gi;
  for (const block of emlContent.matchAll(contentTypeRe)) {
    const mimeType = block[1]!.toLowerCase();
    if (mimeType === "text/plain" || mimeType === "text/html" || mimeType === "multipart/alternative") continue;
    const filename = extractFilenameParam(block[0], "name");
    if (filename && !seen.has(filename)) {
      seen.add(filename);
      attachments.push({ filename, mimeType });
    }
  }

  return attachments;
}

/** Extract filename= or name= parameter from a MIME header block */
function extractFilenameParam(block: string, param = "filename"): string | null {
  // RFC 2231 encoded: filename*=UTF-8''encoded%20name.ext
  const rfc2231 = new RegExp(`${param}\\*\\s*=\\s*[^']*''([^\\s;\\r\\n]+)`, "i");
  const m2231 = block.match(rfc2231);
  if (m2231) {
    try { return decodeURIComponent(m2231[1]!); } catch { /* fall through */ }
  }

  // Quoted: filename="name.ext"
  const quoted = new RegExp(`${param}\\s*=\\s*"([^"]*)"`, "i");
  const mq = block.match(quoted);
  if (mq) return decodeRfc2047(mq[1]!.trim());

  // Unquoted: filename=name.ext
  const unquoted = new RegExp(`${param}\\s*=\\s*([^\\s;\\r\\n"]+)`, "i");
  const mu = block.match(unquoted);
  if (mu) return decodeRfc2047(mu[1]!.trim());

  return null;
}

/** Decode RFC 2047 encoded-words: =?charset?B?base64?= or =?charset?Q?quoted?= */
function decodeRfc2047(text: string): string {
  return text.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_match, _charset, enc, encoded) => {
    try {
      if (enc.toUpperCase() === "B") {
        return atob(encoded);
      } else {
        return encoded.replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16))
        ).replace(/_/g, " ");
      }
    } catch { return text; }
  });
}

/** Extract domains from Received headers */
function parseReceivedDomains(headers: Map<string, string[]>): string[] {
  const received = headers.get("received") ?? [];
  const domains: string[] = [];

  for (const r of received) {
    // Match "from domain.com" in Received headers
    const match = r.match(/from\s+([a-z0-9.-]+\.[a-z]{2,})/i);
    if (match) {
      domains.push(match[1]!.toLowerCase());
    }
  }

  return domains;
}
