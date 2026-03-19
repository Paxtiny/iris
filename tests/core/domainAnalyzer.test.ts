import { describe, it, expect } from "vitest";
import {
  detectHomoglyphs,
  getOrgDomain,
  isSameOrg,
  hasSuspiciousTld,
  analyzeDomains,
} from "../../src/core/domainAnalyzer";
import type { EmailMetadata } from "../../src/core/types";

describe("getOrgDomain", () => {
  it("returns domain for 2-part domains", () => {
    expect(getOrgDomain("google.com")).toBe("google.com");
  });

  it("strips subdomain", () => {
    expect(getOrgDomain("mail.google.com")).toBe("google.com");
  });

  it("handles co.uk TLD", () => {
    expect(getOrgDomain("shop.amazon.co.uk")).toBe("amazon.co.uk");
  });

  it("strips deep subdomains", () => {
    expect(getOrgDomain("a.b.c.example.com")).toBe("example.com");
  });
});

describe("isSameOrg", () => {
  it("matches same domain", () => {
    expect(isSameOrg("google.com", "google.com")).toBe(true);
  });

  it("matches subdomain to parent", () => {
    expect(isSameOrg("mail.google.com", "google.com")).toBe(true);
  });

  it("matches known brand cross-domains", () => {
    expect(isSameOrg("google.com", "googleapis.com")).toBe(true);
  });

  it("rejects unrelated domains", () => {
    expect(isSameOrg("google.com", "phishing.xyz")).toBe(false);
  });

  it("handles empty input", () => {
    expect(isSameOrg("", "google.com")).toBe(false);
  });
});

describe("detectHomoglyphs", () => {
  it("detects paypa1.com as PayPal impersonation", () => {
    const results = detectHomoglyphs(["paypa1.com"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]![0]).toBe("paypa1.com");
    expect(results[0]![1]).toBe("paypal.com");
  });

  it("detects amaz0n.com as Amazon impersonation", () => {
    const results = detectHomoglyphs(["amaz0n.com"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]![1]).toBe("amazon.com");
  });

  it("detects g00gle.com as Google impersonation", () => {
    const results = detectHomoglyphs(["g00gle.com"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]![1]).toBe("google.com");
  });

  it("detects paypa1-security.xyz as PayPal impersonation (compound domain)", () => {
    const results = detectHomoglyphs(["paypa1-security.xyz"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]![0]).toBe("paypa1-security.xyz");
    expect(results[0]![1]).toBe("paypal.com");
  });

  it("does not flag legitimate google.com", () => {
    const results = detectHomoglyphs(["google.com"]);
    expect(results.length).toBe(0);
  });

  it("does not flag unrelated domains", () => {
    const results = detectHomoglyphs(["mycompany.com"]);
    expect(results.length).toBe(0);
  });
});

describe("hasSuspiciousTld", () => {
  it("flags paypal-secure.xyz", () => {
    expect(hasSuspiciousTld("paypal-secure.xyz")).toBe(true);
  });

  it("does not flag legitimate .com", () => {
    expect(hasSuspiciousTld("paypal.com")).toBe(false);
  });

  it("does not flag random .xyz without brand", () => {
    expect(hasSuspiciousTld("mywebsite.xyz")).toBe(false);
  });
});

describe("analyzeDomains", () => {
  it("detects reply-to mismatch", () => {
    const metadata: EmailMetadata = {
      from: "security@paypa1-secure.xyz",
      fromDomain: "paypa1-secure.xyz",
      replyTo: "security-team@paypa1-verify.com",
      replyToDomain: "paypa1-verify.com",
      returnPath: null,
      returnPathDomain: null,
      messageId: null,
      subject: "test",
      dkim: "fail",
      dkimDomain: null,
      spf: "fail",
      dmarc: "fail",
      receivedDomains: [],
    };

    const result = analyzeDomains(metadata, []);
    expect(result.replyToMismatch).toBe(true);
  });

  it("does not flag Google bounce as return-path mismatch", () => {
    const metadata: EmailMetadata = {
      from: "Google Cloud <noreply@google.com>",
      fromDomain: "google.com",
      replyTo: "noreply@google.com",
      replyToDomain: "google.com",
      returnPath: "<bounce@scoutcamp.bounces.google.com>",
      returnPathDomain: "scoutcamp.bounces.google.com",
      messageId: null,
      subject: "test",
      dkim: "pass",
      dkimDomain: "google.com",
      spf: "pass",
      dmarc: "pass",
      receivedDomains: [],
    };

    const result = analyzeDomains(metadata, ["c.gle"]);
    expect(result.returnPathMismatch).toBe(false);
  });
});
