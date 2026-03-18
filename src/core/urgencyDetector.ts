import type { UrgencyAnalysis } from "./types";

/** Urgency/pressure phrases in English and German */
const URGENCY_PATTERNS: RegExp[] = [
  // English
  /\bact\s+now\b/i,
  /\bact\s+immediately\b/i,
  /\bimmediate\s+action\s+required\b/i,
  /\byour\s+account\s+(has\s+been\s+|will\s+be\s+)?(suspended|locked|closed|disabled|compromised|restricted)\b/i,
  /\bunauthorized\s+(access|activity|transaction)\b/i,
  /\bverify\s+(your\s+)?(account|identity)\s+(now|immediately|within)\b/i,
  /\bfailure\s+to\s+(respond|verify|confirm|act)\b/i,
  /\bwithin\s+\d+\s+hours?\b/i,
  /\byou\s+have\s+\d+\s+(hours?|days?)\s+to\b/i,
  /\bif\s+you\s+do\s+not\s+respond\b/i,
  /\bsuspicious\s+activity\b/i,
  /\bsecurity\s+alert\b/i,
  /\burgent\b/i,
  /\bexpir(e|es|ed|ing)\s+(soon|today|tomorrow|in\s+\d+)\b/i,

  // German
  /\bsofort(ig)?\s+(handeln|reagieren|bestätigen)\b/i,
  /\bIhr\s+Konto\s+(wurde\s+)?(gesperrt|eingeschränkt|kompromittiert)\b/i,
  /\bunberechtigter?\s+Zugriff\b/i,
  /\bidentität\s+bestätigen\b/i,
  /\binnerhalb\s+von\s+\d+\s+(Stunden?|Tagen?)\b/i,
  /\bdringend\b/i,
  /\bachtung\b/i,
  /\bsicherheitswarnung\b/i,
];

/** Credential/login request patterns */
const CREDENTIAL_PATTERNS: RegExp[] = [
  // English
  /\b(enter|confirm|verify|update)\s+(your\s+)?(password|passwort|pin|credentials|login)\b/i,
  /\b(sign|log)\s*in\s+to\s+(verify|confirm|secure|protect)\b/i,
  /\bconfirm\s+your\s+(identity|account|details|information)\b/i,
  /\breset\s+your\s+password\b/i,
  /\bclick\s+(here|below)\s+to\s+(verify|confirm|secure|update|log\s*in)\b/i,

  // German
  /\b(geben\s+Sie\s+Ihr|bestätigen\s+Sie\s+Ihr)\s+(Passwort|Kennwort|PIN)\b/i,
  /\bmelden\s+Sie\s+sich\s+an\b/i,
  /\bPasswort\s+(zurücksetzen|ändern)\b/i,
  /\bklicken\s+Sie\s+(hier|unten)\s+(um\s+)?(zu\s+)?(bestätigen|verifizieren)\b/i,
];

/** Detect urgency language and credential requests in email content */
export function detectUrgency(emlContent: string): UrgencyAnalysis {
  // Work with decoded text (strip HTML tags for matching)
  const text = emlContent
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );

  const urgencyMatches: string[] = [];
  const credentialMatches: string[] = [];

  for (const pattern of URGENCY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      urgencyMatches.push(match[0]);
    }
  }

  for (const pattern of CREDENTIAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      credentialMatches.push(match[0]);
    }
  }

  return {
    hasUrgency: urgencyMatches.length > 0,
    hasCredentialRequest: credentialMatches.length > 0,
    urgencyMatches,
    credentialMatches,
  };
}
