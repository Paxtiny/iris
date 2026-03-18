import type { EmailMetadata, DomainAnalysis } from "./types";

/** Well-known brands and their legitimate domains */
const BRAND_DOMAINS: Record<string, string[]> = {
  paypal: ["paypal.com", "paypal.de", "paypal.co.uk"],
  amazon: ["amazon.com", "amazon.de", "amazon.co.uk", "amazon.fr", "amazon.it", "amazonaws.com"],
  google: ["google.com", "gmail.com", "googlemail.com", "youtube.com", "googleapis.com"],
  microsoft: ["microsoft.com", "outlook.com", "hotmail.com", "live.com", "office365.com", "office.com"],
  apple: ["apple.com", "icloud.com", "me.com"],
  dhl: ["dhl.com", "dhl.de"],
  deutschebank: ["deutsche-bank.de", "db.com"],
  sparkasse: ["sparkasse.de"],
  commerzbank: ["commerzbank.de"],
  ing: ["ing.de", "ing.com"],
  netflix: ["netflix.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  instagram: ["instagram.com"],
  linkedin: ["linkedin.com"],
  twitter: ["twitter.com", "x.com"],
  stripe: ["stripe.com"],
  dropbox: ["dropbox.com"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  usps: ["usps.com"],
  postbank: ["postbank.de"],
};

/** Characters commonly used in homoglyph attacks */
const HOMOGLYPH_MAP: Record<string, string> = {
  "0": "o",
  "1": "l",
  "!": "l",
  "|": "l",
  "5": "s",
  "8": "b",
  "$": "s",
  "@": "a",
};

/** Suspicious TLDs often used in phishing */
const SUSPICIOUS_TLDS = new Set([
  ".xyz", ".top", ".buzz", ".click", ".link", ".info",
  ".support", ".help", ".online", ".site", ".website",
  ".tk", ".ml", ".ga", ".cf", ".gq",
]);

/** Analyze domains in an email for phishing signals */
export function analyzeDomains(
  metadata: EmailMetadata,
  linkDomains: string[]
): DomainAnalysis {
  const senderDomain = metadata.fromDomain.toLowerCase();

  // Check reply-to mismatch
  const replyToMismatch =
    metadata.replyToDomain !== null &&
    metadata.replyToDomain !== "" &&
    !isSameOrg(senderDomain, metadata.replyToDomain);

  // Check return-path mismatch
  const returnPathMismatch =
    metadata.returnPathDomain !== null &&
    metadata.returnPathDomain !== "" &&
    !isSameOrg(senderDomain, metadata.returnPathDomain) &&
    !isBounceService(metadata.returnPathDomain);

  // Check for homoglyphs in all domains
  const allDomains = [
    senderDomain,
    metadata.replyToDomain,
    metadata.returnPathDomain,
    ...linkDomains,
  ].filter((d): d is string => d !== null && d !== "");

  const homoglyphs = detectHomoglyphs(allDomains);

  // Check link domain mismatches
  const linkDomainMismatches = linkDomains
    .filter((d) => d && !isSameOrg(senderDomain, d) && !isCommonService(d))
    .filter((d, i, arr) => arr.indexOf(d) === i); // deduplicate

  return {
    senderDomain,
    replyToMismatch,
    returnPathMismatch,
    homoglyphs,
    linkDomainMismatches,
  };
}

/** Check if two domains belong to the same organization */
export function isSameOrg(domain1: string, domain2: string): boolean {
  if (!domain1 || !domain2) return false;

  const org1 = getOrgDomain(domain1);
  const org2 = getOrgDomain(domain2);

  if (org1 === org2) return true;

  // Check if both domains belong to the same known brand
  for (const domains of Object.values(BRAND_DOMAINS)) {
    const d1Match = domains.some((d) => domain1.endsWith(d));
    const d2Match = domains.some((d) => domain2.endsWith(d));
    if (d1Match && d2Match) return true;
  }

  return false;
}

/** Extract the organizational domain (e.g., mail.google.com -> google.com) */
export function getOrgDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;

  // Handle co.uk, com.au style TLDs
  const lastTwo = parts.slice(-2).join(".");
  if (["co.uk", "com.au", "co.jp", "co.de", "com.br"].includes(lastTwo)) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

/** Detect homoglyph domains that impersonate known brands */
export function detectHomoglyphs(
  domains: string[]
): Array<[string, string]> {
  const results: Array<[string, string]> = [];

  for (const domain of domains) {
    const orgDomain = getOrgDomain(domain);
    const normalized = normalizeHomoglyphs(orgDomain.split(".")[0] ?? "");

    for (const [brand, brandDomains] of Object.entries(BRAND_DOMAINS)) {
      // Skip if this IS the legitimate domain
      if (brandDomains.some((bd) => domain.endsWith(bd))) continue;

      // Check if the normalized form matches or is very close to the brand
      if (normalized === brand || levenshtein(normalized, brand) <= 1) {
        results.push([domain, brandDomains[0]!]);
      }
    }
  }

  return results;
}

/** Replace common homoglyph characters with their look-alikes */
function normalizeHomoglyphs(text: string): string {
  let result = text.toLowerCase();
  for (const [fake, real] of Object.entries(HOMOGLYPH_MAP)) {
    result = result.replaceAll(fake, real);
  }
  // rn -> m is a common visual trick
  result = result.replaceAll("rn", "m");
  return result;
}

/** Simple Levenshtein distance for fuzzy matching */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }

  return dp[m]![n]!;
}

/** Check if a domain is a known bounce/email service */
function isBounceService(domain: string): boolean {
  const bouncePatterns = [
    "bounces.google.com",
    "amazonses.com",
    "sendgrid.net",
    "mailgun.org",
    "mailchimp.com",
    "mandrillapp.com",
    "postmarkapp.com",
  ];
  return bouncePatterns.some((p) => domain.endsWith(p));
}

/** Check if a domain is a common service (CDN, tracking, etc.) */
function isCommonService(domain: string): boolean {
  const services = [
    "googleapis.com",
    "gstatic.com",
    "cloudflare.com",
    "amazonaws.com",
    "azurewebsites.net",
    "doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
    "facebook.net",
    "fbcdn.net",
    "twitter.com",
    "t.co",
    "bit.ly",
    "tinyurl.com",
    "c.gle",
  ];
  return services.some((s) => domain.endsWith(s) || domain === s);
}

/** Check if a domain has a suspicious TLD combined with a brand-like name */
export function hasSuspiciousTld(domain: string): boolean {
  const tld = "." + domain.split(".").pop();
  if (!SUSPICIOUS_TLDS.has(tld)) return false;

  // Only suspicious if the domain name part looks like a brand
  const name = domain.split(".")[0] ?? "";
  const normalized = normalizeHomoglyphs(name);

  for (const brand of Object.keys(BRAND_DOMAINS)) {
    if (normalized.includes(brand)) return true;
  }

  return false;
}
