import type {
  EmailMetadata,
  DomainAnalysis,
  UrgencyAnalysis,
  AttachmentAnalysis,
  ContentAnalysis,
  ScoringResult,
  ScoringSignal,
} from "./types";
import { hasSuspiciousTld } from "./domainAnalyzer";

/** Options for scoring */
export interface ScoreOptions {
  /** When true, skip DKIM/SPF/DMARC checks (e.g., DOM-only mode where headers are unavailable) */
  skipAuth?: boolean;
}

/** Score an email for phishing risk based on analyzed signals */
export function scoreEmail(
  metadata: EmailMetadata,
  domains: DomainAnalysis,
  urgency: UrgencyAnalysis,
  options?: ScoreOptions,
  attachments?: AttachmentAnalysis,
  content?: ContentAnalysis,
): ScoringResult {
  const signals: ScoringSignal[] = [];
  let rawScore = 0;
  const skipAuth = options?.skipAuth ?? false;

  if (skipAuth) {
    signals.push({ name: "auth_skipped", points: 0, detail: "Email authentication (DKIM/SPF/DMARC) not available in browser-only mode" });
  }

  if (!skipAuth) {
    // DKIM check (+3 for fail/missing)
    if (metadata.dkim === "fail") {
      signals.push({ name: "dkim_fail", points: 3, detail: "DKIM signature failed verification" });
      rawScore += 3;
    } else if (metadata.dkim === "none") {
      signals.push({ name: "dkim_none", points: 2, detail: "No DKIM signature present" });
      rawScore += 2;
    }

    // SPF check (+2 for fail/missing)
    if (metadata.spf === "fail") {
      signals.push({ name: "spf_fail", points: 2, detail: "SPF check failed - sender IP not authorized" });
      rawScore += 2;
    } else if (metadata.spf === "none") {
      signals.push({ name: "spf_none", points: 1, detail: "No SPF record found" });
      rawScore += 1;
    }

    // DMARC check (+2 for fail/missing)
    if (metadata.dmarc === "fail") {
      signals.push({ name: "dmarc_fail", points: 2, detail: "DMARC policy violated" });
      rawScore += 2;
    } else if (metadata.dmarc === "none") {
      signals.push({ name: "dmarc_none", points: 1, detail: "No DMARC policy found" });
      rawScore += 1;
    }
  }

  // Reply-To mismatch (+2)
  if (domains.replyToMismatch) {
    signals.push({
      name: "reply_to_mismatch",
      points: 2,
      detail: `Reply-To domain (${metadata.replyToDomain}) differs from sender (${domains.senderDomain})`,
    });
    rawScore += 2;
  }

  // Link domain mismatches (+2)
  if (domains.linkDomainMismatches.length > 0) {
    const mismatchList = domains.linkDomainMismatches.slice(0, 3).join(", ");
    signals.push({
      name: "link_mismatch",
      points: 2,
      detail: `Links point to different domains: ${mismatchList}`,
    });
    rawScore += 2;
  }

  // Homoglyph detection (+3)
  if (domains.homoglyphs.length > 0) {
    for (const [suspicious, legit] of domains.homoglyphs) {
      signals.push({
        name: "homoglyph",
        points: 3,
        detail: `Domain "${suspicious}" looks like "${legit}" (possible impersonation)`,
      });
      rawScore += 3;
    }
  }

  // Suspicious TLD (+1)
  if (hasSuspiciousTld(domains.senderDomain)) {
    signals.push({
      name: "suspicious_tld",
      points: 1,
      detail: `Sender domain uses a suspicious TLD: ${domains.senderDomain}`,
    });
    rawScore += 1;
  }

  // Urgency language (+1)
  if (urgency.hasUrgency) {
    signals.push({
      name: "urgency",
      points: 1,
      detail: `Pressure language detected: "${urgency.urgencyMatches[0]}"`,
    });
    rawScore += 1;
  }

  // Credential request (+1)
  if (urgency.hasCredentialRequest) {
    signals.push({
      name: "credential_request",
      points: 1,
      detail: `Asks for credentials: "${urgency.credentialMatches[0]}"`,
    });
    rawScore += 1;
  }

  // Attachment signals
  if (attachments && attachments.attachments.length > 0) {
    const isSafe =
      attachments.dangerousExecutables.length === 0 &&
      attachments.scriptFiles.length === 0 &&
      attachments.macroFiles.length === 0 &&
      attachments.doubleExtensions.length === 0 &&
      attachments.rtlTricks.length === 0;

    if (isSafe) {
      const names = attachments.attachments.map((a) => a.filename).slice(0, 3).join(", ");
      const more = attachments.attachments.length > 3 ? ` (+${attachments.attachments.length - 3} more)` : "";
      signals.push({
        name: "attachments_ok",
        points: 0,
        detail: `${attachments.attachments.length} attachment(s) - no suspicious file types: ${names}${more}`,
      });
    }

    for (const f of attachments.rtlTricks) {
      signals.push({ name: "attachment_rtl", points: 4, detail: `Attachment filename uses Unicode direction trick to hide its real extension: "${f}"` });
      rawScore += 4;
    }
    for (const f of attachments.doubleExtensions) {
      signals.push({ name: "attachment_double_ext", points: 4, detail: `Attachment uses double-extension to disguise its type: "${f}"` });
      rawScore += 4;
    }
    for (const f of attachments.dangerousExecutables) {
      if (!attachments.doubleExtensions.includes(f)) { // avoid double-counting
        signals.push({ name: "attachment_executable", points: 4, detail: `Executable attachment: "${f}"` });
        rawScore += 4;
      }
    }
    for (const f of attachments.scriptFiles) {
      signals.push({ name: "attachment_script", points: 3, detail: `Script attachment: "${f}"` });
      rawScore += 3;
    }
    for (const f of attachments.macroFiles) {
      signals.push({ name: "attachment_macro", points: 2, detail: `Macro-enabled Office attachment: "${f}"` });
      rawScore += 2;
    }
  }

  // Content analysis signals (display name spoofing, shorteners, forms, etc.)
  if (content) {
    for (const signal of content.signals) {
      signals.push(signal);
      rawScore += signal.points;
    }
  }

  // Legitimacy bonus (-3 when all auth passes and domains match)
  // In skipAuth mode, give a smaller bonus (-1) when domains are clean
  if (
    !skipAuth &&
    metadata.dkim === "pass" &&
    metadata.spf === "pass" &&
    metadata.dmarc === "pass" &&
    !domains.replyToMismatch &&
    domains.homoglyphs.length === 0 &&
    domains.linkDomainMismatches.length === 0
  ) {
    signals.push({
      name: "all_auth_pass",
      points: -3,
      detail: "All authentication checks passed and domains are consistent",
    });
    rawScore -= 3;
  } else if (
    skipAuth &&
    !domains.replyToMismatch &&
    domains.homoglyphs.length === 0 &&
    domains.linkDomainMismatches.length === 0
  ) {
    signals.push({
      name: "domains_clean",
      points: -1,
      detail: "All visible domains are consistent (auth headers not available)",
    });
    rawScore -= 1;
  }

  // Clamp to 0-10
  const score = Math.max(0, Math.min(10, rawScore));

  const level =
    score <= 2 ? "safe" : score <= 5 ? "uncertain" : "dangerous";

  const explanation = generateExplanation(metadata, domains, urgency, score, level, skipAuth, attachments);

  return { score, level, signals, explanation };
}

/** Generate a plain-language explanation */
function generateExplanation(
  metadata: EmailMetadata,
  domains: DomainAnalysis,
  urgency: UrgencyAnalysis,
  _score: number,
  level: "safe" | "uncertain" | "dangerous",
  skipAuth = false,
  attachments?: AttachmentAnalysis,
): string {
  const parts: string[] = [];

  if (level === "safe") {
    if (skipAuth) {
      parts.push(
        `This email from ${domains.senderDomain} has no suspicious signals in the visible content.`
      );
    } else {
      parts.push(
        `This email from ${domains.senderDomain} passes all authentication checks (DKIM, SPF, DMARC).`
      );
    }
    if (domains.linkDomainMismatches.length === 0) {
      parts.push("All links point to the expected domain.");
    }
  } else if (level === "dangerous") {
    if (attachments && (attachments.dangerousExecutables.length > 0 || attachments.rtlTricks.length > 0 || attachments.doubleExtensions.length > 0)) {
      const f = (attachments.rtlTricks[0] ?? attachments.doubleExtensions[0] ?? attachments.dangerousExecutables[0])!;
      parts.push(`This email contains a dangerous attachment: "${f}". Do not open it.`);
    }
    if (domains.homoglyphs.length > 0) {
      const [suspicious, legit] = domains.homoglyphs[0]!;
      parts.push(`The domain "${suspicious}" appears to impersonate "${legit}".`);
    }
    if (metadata.dkim === "fail" || metadata.spf === "fail") {
      parts.push("Email authentication failed - the sender may not be who they claim.");
    }
    if (domains.replyToMismatch) {
      parts.push(`The reply address (${metadata.replyToDomain}) differs from the sender (${domains.senderDomain}).`);
    }
    if (urgency.hasCredentialRequest) {
      parts.push("This email asks for your login credentials - legitimate services rarely do this via email.");
    }
  } else {
    // Uncertain
    parts.push(
      `This email from ${domains.senderDomain} has some signals that warrant caution.`
    );
    if (domains.linkDomainMismatches.length > 0) {
      parts.push(
        `Some links point to different domains (${domains.linkDomainMismatches.slice(0, 2).join(", ")}).`
      );
    }
    if (urgency.hasUrgency) {
      parts.push("The email uses urgency language to pressure you into acting quickly.");
    }
  }

  return parts.join(" ");
}
