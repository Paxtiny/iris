/** Authentication result from email headers */
export type AuthResult = "pass" | "fail" | "none";

/** Parsed email metadata extracted from .eml headers */
export interface EmailMetadata {
  from: string;
  fromDomain: string;
  replyTo: string | null;
  replyToDomain: string | null;
  returnPath: string | null;
  returnPathDomain: string | null;
  messageId: string | null;
  subject: string;
  dkim: AuthResult;
  dkimDomain: string | null;
  spf: AuthResult;
  dmarc: AuthResult;
  receivedDomains: string[];
}

/** Result of domain analysis */
export interface DomainAnalysis {
  /** The primary sender domain */
  senderDomain: string;
  /** Whether reply-to domain differs from sender */
  replyToMismatch: boolean;
  /** Whether return-path domain differs from sender */
  returnPathMismatch: boolean;
  /** Homoglyph detections: [suspicious domain, likely impersonating] */
  homoglyphs: Array<[string, string]>;
  /** Whether link domains match the sender domain's organization */
  linkDomainMismatches: string[];
}

/** Result of urgency/pressure language detection */
export interface UrgencyAnalysis {
  /** Whether urgency language was detected */
  hasUrgency: boolean;
  /** Whether credential/login requests were detected */
  hasCredentialRequest: boolean;
  /** Matched urgency phrases */
  urgencyMatches: string[];
  /** Matched credential phrases */
  credentialMatches: string[];
}

/** Extracted link from email body */
export interface ExtractedLink {
  href: string;
  domain: string;
  displayText: string;
}

/** Individual scoring signal */
export interface ScoringSignal {
  name: string;
  points: number;
  detail: string;
}

/** Final scoring result */
export interface ScoringResult {
  /** Overall score 0-10 (higher = more suspicious) */
  score: number;
  /** Risk level derived from score */
  level: "safe" | "uncertain" | "dangerous";
  /** Individual signals that contributed to the score */
  signals: ScoringSignal[];
  /** Plain-language explanation for the user */
  explanation: string;
}

/** Supported UI languages */
export type Language = "en" | "de";
