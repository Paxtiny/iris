import { describe, it, expect } from "vitest";
import { analyzeContent, type ContentAnalysisInput } from "../../src/core/contentAnalyzer";
import type { EmailMetadata, ExtractedLink } from "../../src/core/types";

function makeMetadata(overrides: Partial<EmailMetadata> = {}): EmailMetadata {
  return {
    from: "test@example.com",
    fromDomain: "example.com",
    displayName: null,
    replyTo: null,
    replyToDomain: null,
    returnPath: null,
    returnPathDomain: null,
    messageId: null,
    subject: "Test",
    dkim: "none",
    dkimDomain: null,
    spf: "none",
    dmarc: "none",
    receivedDomains: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<ContentAnalysisInput> = {}): ContentAnalysisInput {
  return {
    metadata: makeMetadata(),
    links: [],
    bodyText: null,
    bodyHtml: null,
    ...overrides,
  };
}

describe("contentAnalyzer", () => {
  describe("display name spoofing", () => {
    it("detects email in display name from different domain", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "hacker@evil.xyz",
          fromDomain: "evil.xyz",
          displayName: "security@paypal.com",
        }),
      }));
      const signal = result.signals.find((s) => s.name === "display_name_spoof");
      expect(signal).toBeDefined();
      expect(signal!.points).toBe(3);
    });

    it("skips when display name email matches actual sender domain", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "support@paypal.com",
          fromDomain: "paypal.com",
          displayName: "support@paypal.com",
        }),
      }));
      expect(result.signals.find((s) => s.name === "display_name_spoof")).toBeUndefined();
    });

    it("skips when display name has no email", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "noreply@paypal.com",
          fromDomain: "paypal.com",
          displayName: "PayPal Support",
        }),
      }));
      expect(result.signals.find((s) => s.name === "display_name_spoof")).toBeUndefined();
    });

    it("skips when no display name", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({ displayName: null }),
      }));
      expect(result.signals.find((s) => s.name === "display_name_spoof")).toBeUndefined();
    });
  });

  describe("URL shortener detection", () => {
    it("detects bit.ly links", () => {
      const links: ExtractedLink[] = [
        { href: "https://bit.ly/abc123", domain: "bit.ly", displayText: "Click here" },
      ];
      const result = analyzeContent(makeInput({ links }));
      const signal = result.signals.find((s) => s.name === "url_shortener");
      expect(signal).toBeDefined();
      expect(signal!.points).toBe(1);
    });

    it("exempts t.co from twitter.com sender", () => {
      const links: ExtractedLink[] = [
        { href: "https://t.co/abc", domain: "t.co", displayText: "link" },
      ];
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({ from: "notify@twitter.com", fromDomain: "twitter.com" }),
        links,
      }));
      expect(result.signals.find((s) => s.name === "url_shortener")).toBeUndefined();
    });

    it("flags t.co from non-twitter sender", () => {
      const links: ExtractedLink[] = [
        { href: "https://t.co/abc", domain: "t.co", displayText: "link" },
      ];
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({ from: "scam@evil.xyz", fromDomain: "evil.xyz" }),
        links,
      }));
      expect(result.signals.find((s) => s.name === "url_shortener")).toBeDefined();
    });

    it("skips when no shortener links", () => {
      const links: ExtractedLink[] = [
        { href: "https://google.com", domain: "google.com", displayText: "Google" },
      ];
      const result = analyzeContent(makeInput({ links }));
      expect(result.signals.find((s) => s.name === "url_shortener")).toBeUndefined();
    });
  });

  describe("free email provider mismatch", () => {
    it("detects brand name sending from gmail", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "paypal.support@gmail.com",
          fromDomain: "gmail.com",
          displayName: "PayPal Support",
        }),
      }));
      const signal = result.signals.find((s) => s.name === "free_email_mismatch");
      expect(signal).toBeDefined();
      expect(signal!.points).toBe(2);
    });

    it("skips Google sending from gmail.com", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "noreply@gmail.com",
          fromDomain: "gmail.com",
          displayName: "Google",
        }),
      }));
      expect(result.signals.find((s) => s.name === "free_email_mismatch")).toBeUndefined();
    });

    it("skips Microsoft sending from outlook.com", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "support@outlook.com",
          fromDomain: "outlook.com",
          displayName: "Microsoft Support",
        }),
      }));
      expect(result.signals.find((s) => s.name === "free_email_mismatch")).toBeUndefined();
    });

    it("skips personal email with no brand name", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "john@gmail.com",
          fromDomain: "gmail.com",
          displayName: "John Smith",
        }),
      }));
      expect(result.signals.find((s) => s.name === "free_email_mismatch")).toBeUndefined();
    });

    it("skips non-free-provider domain", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "support@paypal.com",
          fromDomain: "paypal.com",
          displayName: "PayPal Support",
        }),
      }));
      expect(result.signals.find((s) => s.name === "free_email_mismatch")).toBeUndefined();
    });
  });

  describe("embedded forms detection", () => {
    it("detects form with password input (+3)", () => {
      const result = analyzeContent(makeInput({
        bodyHtml: '<div><form action="https://evil.xyz"><input type="password" name="pw"></form></div>',
      }));
      const signal = result.signals.find((s) => s.name === "embedded_form");
      expect(signal).toBeDefined();
      expect(signal!.points).toBe(3);
    });

    it("detects form without password input (+2)", () => {
      const result = analyzeContent(makeInput({
        bodyHtml: '<form><input type="text" name="data"></form>',
      }));
      const signal = result.signals.find((s) => s.name === "embedded_form");
      expect(signal).toBeDefined();
      expect(signal!.points).toBe(2);
    });

    it("ignores form inside HTML comment", () => {
      const result = analyzeContent(makeInput({
        bodyHtml: '<!-- <form><input type="password"></form> -->',
      }));
      expect(result.signals.find((s) => s.name === "embedded_form")).toBeUndefined();
    });

    it("skips when no body HTML", () => {
      const result = analyzeContent(makeInput({ bodyHtml: null }));
      expect(result.signals.find((s) => s.name === "embedded_form")).toBeUndefined();
    });
  });

  describe("generic greeting detection", () => {
    it("detects 'Dear Customer'", () => {
      const result = analyzeContent(makeInput({
        bodyText: "Dear Customer, your account has been suspended...",
      }));
      const signal = result.signals.find((s) => s.name === "generic_greeting");
      expect(signal).toBeDefined();
      expect(signal!.points).toBe(1);
    });

    it("detects 'Dear User'", () => {
      const result = analyzeContent(makeInput({
        bodyText: "Dear User, please verify your identity.",
      }));
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeDefined();
    });

    it("detects German 'Sehr geehrter Kunde'", () => {
      const result = analyzeContent(makeInput({
        bodyText: "Sehr geehrter Kunde, Ihr Konto wurde gesperrt.",
      }));
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeDefined();
    });

    it("does not flag 'Dear John'", () => {
      const result = analyzeContent(makeInput({
        bodyText: "Dear John, thank you for your order.",
      }));
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeUndefined();
    });

    it("does not flag 'Hello C.,'", () => {
      const result = analyzeContent(makeInput({
        bodyText: "Hello C., your monthly report is ready.",
      }));
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeUndefined();
    });

    it("does not flag 'Hi there!'", () => {
      const result = analyzeContent(makeInput({
        bodyText: "Hi there! Just wanted to follow up.",
      }));
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeUndefined();
    });

    it("skips when no body text", () => {
      const result = analyzeContent(makeInput({ bodyText: null }));
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeUndefined();
    });
  });

  describe("multiple signals combined", () => {
    it("detects multiple signals in a phishing email", () => {
      const result = analyzeContent(makeInput({
        metadata: makeMetadata({
          from: "paypal-security@gmail.com",
          fromDomain: "gmail.com",
          displayName: "security@paypal.com",
        }),
        links: [
          { href: "https://bit.ly/verify", domain: "bit.ly", displayText: "Verify" },
        ],
        bodyText: "Dear Customer, your account has been locked.",
        bodyHtml: '<form action="https://evil.xyz"><input type="password"></form>',
      }));

      expect(result.signals.length).toBeGreaterThanOrEqual(4);
      expect(result.signals.find((s) => s.name === "display_name_spoof")).toBeDefined();
      expect(result.signals.find((s) => s.name === "url_shortener")).toBeDefined();
      expect(result.signals.find((s) => s.name === "free_email_mismatch")).toBeDefined();
      expect(result.signals.find((s) => s.name === "embedded_form")).toBeDefined();
      expect(result.signals.find((s) => s.name === "generic_greeting")).toBeDefined();
    });
  });
});
