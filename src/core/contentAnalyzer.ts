import type { EmailMetadata, ExtractedLink, ContentAnalysis, ScoringSignal } from "./types";

// ── URL Shorteners ──────────────────────────────────────────────────────────
const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "v.gd",
  "rb.gy", "cutt.ly", "shorturl.at", "tiny.cc", "lnk.to", "s.id",
  "buff.ly", "clck.ru", "rebrand.ly", "bl.ink", "surl.li", "short.io",
  "t.ly", "tny.im", "yourls.org",
]);

// ── Free Email Providers ────────────────────────────────────────────────────
const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.de", "yahoo.co.uk", "yahoo.fr",
  "hotmail.com", "outlook.com", "live.com",
  "aol.com", "mail.com",
  "gmx.com", "gmx.de", "gmx.net", "web.de", "t-online.de",
  "yandex.com", "yandex.ru",
  "protonmail.com", "proton.me", "pm.me",
  "tutanota.com", "tuta.io",
  "icloud.com", "me.com",
  "zoho.com",
]);

// Brands whose names in a display name + free provider sender = suspicious.
// Intentionally limited to major brands to avoid false positives on small businesses.
const BRAND_NAMES = new Set([
  "paypal", "amazon", "google", "microsoft", "apple", "meta", "facebook",
  "instagram", "whatsapp", "dhl", "netflix", "linkedin", "twitter",
  "stripe", "dropbox", "fedex", "ups", "usps", "ebay", "shopify",
  "salesforce", "adobe", "zoom", "slack", "github",
  "deutsche bank", "sparkasse", "commerzbank", "ing", "postbank",
]);

// Map free providers to their parent brand so we don't false-positive
// "Google" sending from gmail.com or "Microsoft" sending from outlook.com
const FREE_PROVIDER_BRAND: Record<string, string> = {
  "gmail.com": "google", "googlemail.com": "google",
  "outlook.com": "microsoft", "hotmail.com": "microsoft", "live.com": "microsoft",
  "icloud.com": "apple", "me.com": "apple",
  "protonmail.com": "proton", "proton.me": "proton", "pm.me": "proton",
  "yahoo.com": "yahoo", "yahoo.de": "yahoo", "yahoo.co.uk": "yahoo",
};

// Map shortener domains to their parent brand for exemption
const SHORTENER_BRAND: Record<string, string> = {
  "t.co": "twitter",
};

// Brand domain lookup for shortener exemption
const BRAND_DOMAINS_FOR_SHORTENER: Record<string, string[]> = {
  twitter: ["twitter.com", "x.com", "t.co", "twimg.com"],
};

// ── Generic Greetings ───────────────────────────────────────────────────────
const GENERIC_GREETING_PATTERNS = [
  // English
  /\bdear\s+(customer|user|account\s*holder|client|member|valued\s+customer|sir\s*(?:\/|or)\s*madam|recipient|email\s*user)\b/i,
  /\bhello\s+(customer|user|account\s*holder|client|member)\b/i,
  // German
  /\bsehr\s+geehrte[rs]?\s+(kunde|kundin|nutzer|nutzerin|kontoinhaber|kontoinhaberin|mitglied)\b/i,
  /\bliebe[rs]?\s+(kunde|kundin|nutzer|nutzerin|mitglied)\b/i,
];

// ── Email extraction regex ──────────────────────────────────────────────────
const EMAIL_REGEX = /[\w.+-]+@[\w.-]+\.\w{2,}/;

/** Extract org domain from a full domain (e.g., mail.google.com -> google.com) */
function orgDomain(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  if (parts.length <= 2) return domain.toLowerCase();
  // Handle multi-part TLDs
  const multiPartTlds = [".co.uk", ".co.jp", ".co.de", ".com.au", ".com.br", ".co.in"];
  const joined = "." + parts.slice(-2).join(".");
  if (multiPartTlds.some((t) => joined.endsWith(t))) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

// ── Detection Functions ─────────────────────────────────────────────────────

/** Detect display name spoofing: display name contains an email from a different domain */
function detectDisplayNameSpoofing(
  displayName: string | null,
  actualEmail: string,
): ScoringSignal | null {
  if (!displayName) return null;
  const match = displayName.match(EMAIL_REGEX);
  if (!match) return null;

  const embeddedEmail = match[0].toLowerCase();
  const embeddedDomain = embeddedEmail.split("@")[1] ?? "";
  const actualDomain = actualEmail.toLowerCase().split("@")[1] ?? "";

  // Same domain = not spoofing
  if (orgDomain(embeddedDomain) === orgDomain(actualDomain)) return null;

  return {
    name: "display_name_spoof",
    points: 3,
    detail: `Display name contains "${embeddedEmail}" but actual sender is ${actualEmail}`,
  };
}

/** Detect URL shorteners in email links */
function detectUrlShorteners(
  links: ExtractedLink[],
  senderDomain: string,
): ScoringSignal | null {
  const senderOrg = orgDomain(senderDomain);

  for (const link of links) {
    const linkDomain = link.domain.toLowerCase();
    if (!URL_SHORTENERS.has(linkDomain)) continue;

    // Exempt if shortener belongs to sender's brand (e.g., t.co from twitter.com)
    const shortenerBrand = SHORTENER_BRAND[linkDomain];
    if (shortenerBrand) {
      const brandDomains = BRAND_DOMAINS_FOR_SHORTENER[shortenerBrand];
      if (brandDomains?.some((d) => orgDomain(d) === senderOrg)) continue;
    }

    return {
      name: "url_shortener",
      points: 2,
      detail: `Link uses URL shortener (${linkDomain}) which hides the real destination`,
    };
  }
  return null;
}

/** Detect brand name in display name but sender uses free email provider */
function detectFreeEmailMismatch(
  displayName: string | null,
  fromDomain: string,
): ScoringSignal | null {
  if (!displayName) return null;
  if (!FREE_EMAIL_PROVIDERS.has(fromDomain.toLowerCase())) return null;

  const nameLower = displayName.toLowerCase();

  // Check if the free provider IS the brand (gmail.com = google, outlook.com = microsoft)
  const providerBrand = FREE_PROVIDER_BRAND[fromDomain.toLowerCase()];

  for (const brand of BRAND_NAMES) {
    if (nameLower.includes(brand)) {
      // Skip if this brand owns the free provider
      if (providerBrand && (providerBrand === brand || brand.startsWith(providerBrand))) continue;
      return {
        name: "free_email_mismatch",
        points: 2,
        detail: `Display name mentions "${brand}" but sends from free provider ${fromDomain}`,
      };
    }
  }
  return null;
}

/** Detect embedded HTML forms in email body */
function detectEmbeddedForms(bodyHtml: string | null): ScoringSignal | null {
  if (!bodyHtml) return null;

  // Strip HTML comments to avoid matching commented-out forms
  const stripped = bodyHtml.replace(/<!--[\s\S]*?-->/g, "");

  if (!/<form\b/i.test(stripped)) return null;

  // Check for password/credential inputs inside the form
  const hasCredentialInput = /<input\s[^>]*type\s*=\s*["']?password/i.test(stripped);

  return {
    name: "embedded_form",
    points: hasCredentialInput ? 3 : 2,
    detail: hasCredentialInput
      ? "Email contains an embedded form with a password field"
      : "Email contains an embedded form - legitimate emails link to websites instead",
  };
}

/** Detect generic greetings that indicate mass/phishing emails */
function detectGenericGreeting(bodyText: string | null): ScoringSignal | null {
  if (!bodyText) return null;

  // Only check the first 500 characters to avoid matching quoted/forwarded content
  const prefix = bodyText.slice(0, 500);

  for (const pattern of GENERIC_GREETING_PATTERNS) {
    const match = prefix.match(pattern);
    if (match) {
      return {
        name: "generic_greeting",
        points: 1,
        detail: `Uses impersonal greeting "${match[0]}" instead of your name`,
      };
    }
  }
  return null;
}

// ── Main Analysis Function ──────────────────────────────────────────────────

export interface ContentAnalysisInput {
  metadata: EmailMetadata;
  links: ExtractedLink[];
  bodyText: string | null;
  bodyHtml: string | null;
}

/** Analyze email content for phishing signals beyond domain/auth checks */
export function analyzeContent(input: ContentAnalysisInput): ContentAnalysis {
  const signals: ScoringSignal[] = [];

  const s1 = detectDisplayNameSpoofing(input.metadata.displayName, input.metadata.from);
  if (s1) signals.push(s1);

  const s2 = detectUrlShorteners(input.links, input.metadata.fromDomain);
  if (s2) signals.push(s2);

  const s3 = detectFreeEmailMismatch(input.metadata.displayName, input.metadata.fromDomain);
  if (s3) signals.push(s3);

  const s4 = detectEmbeddedForms(input.bodyHtml);
  if (s4) signals.push(s4);

  const s5 = detectGenericGreeting(input.bodyText);
  if (s5) signals.push(s5);

  return { signals };
}
