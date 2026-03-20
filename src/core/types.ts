/** Authentication result from email headers */
export type AuthResult = "pass" | "fail" | "none";

/** Parsed email metadata extracted from .eml headers */
export interface EmailMetadata {
  from: string;
  fromDomain: string;
  /** Display name portion of the From header (e.g., "PayPal Support") */
  displayName: string | null;
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

/** A single attachment identified in an email */
export interface AttachmentInfo {
  filename: string;
  mimeType?: string;
}

/** Result of attachment analysis */
export interface AttachmentAnalysis {
  attachments: AttachmentInfo[];
  /** Filenames with directly executable extensions (.exe, .bat, .scr ...) */
  dangerousExecutables: string[];
  /** Filenames with script extensions (.ps1, .vbs, .js, .jar ...) */
  scriptFiles: string[];
  /** Macro-enabled Office files (.xlsm, .docm ...) */
  macroFiles: string[];
  /** Filenames using double-extension trick (invoice.pdf.exe) */
  doubleExtensions: string[];
  /** Filenames using Unicode RTL override to spoof extension */
  rtlTricks: string[];
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

/** Result of content-level analysis (display name, links, body) */
export interface ContentAnalysis {
  signals: ScoringSignal[];
}

/** Supported UI languages */
export type Language = "en" | "de";
