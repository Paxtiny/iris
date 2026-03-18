import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseEmailHeaders, extractDomain } from "../../src/core/headerParser";

const fixturesDir = resolve(__dirname, "../fixtures");

describe("extractDomain", () => {
  it("extracts domain from Name <email> format", () => {
    expect(extractDomain("Google Cloud <CloudPlatform-noreply@google.com>")).toBe("google.com");
  });

  it("extracts domain from bare email", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
  });

  it("extracts domain from angle-bracket email", () => {
    expect(extractDomain("<noreply@paypa1-secure.xyz>")).toBe("paypa1-secure.xyz");
  });

  it("returns empty string for non-email", () => {
    expect(extractDomain("not an email")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractDomain("")).toBe("");
  });
});

describe("parseEmailHeaders - legit Google Cloud email", () => {
  const eml = readFileSync(resolve(fixturesDir, "legit-google-cloud.eml"), "utf-8");
  const metadata = parseEmailHeaders(eml);

  it("parses from address", () => {
    expect(metadata.from).toBe("Google Cloud <CloudPlatform-noreply@google.com>");
  });

  it("parses from domain", () => {
    expect(metadata.fromDomain).toBe("google.com");
  });

  it("parses reply-to", () => {
    expect(metadata.replyTo).toContain("google.com");
  });

  it("parses reply-to domain", () => {
    expect(metadata.replyToDomain).toBe("google.com");
  });

  it("parses return-path domain (bounce service)", () => {
    expect(metadata.returnPathDomain).toBe("scoutcamp.bounces.google.com");
  });

  it("parses subject", () => {
    expect(metadata.subject).toContain("OpenTelemetry");
  });

  it("detects DKIM pass", () => {
    expect(metadata.dkim).toBe("pass");
  });

  it("detects DKIM domain", () => {
    expect(metadata.dkimDomain).toBe("google.com");
  });

  it("detects SPF pass", () => {
    expect(metadata.spf).toBe("pass");
  });

  it("detects DMARC pass", () => {
    expect(metadata.dmarc).toBe("pass");
  });

  it("parses message ID", () => {
    expect(metadata.messageId).toContain("@google.com");
  });
});

describe("parseEmailHeaders - phishing PayPal email", () => {
  const eml = readFileSync(resolve(fixturesDir, "phishing-paypal.eml"), "utf-8");
  const metadata = parseEmailHeaders(eml);

  it("parses from domain as fake paypal", () => {
    expect(metadata.fromDomain).toBe("paypa1-secure.xyz");
  });

  it("detects DKIM fail", () => {
    expect(metadata.dkim).toBe("fail");
  });

  it("detects SPF fail", () => {
    expect(metadata.spf).toBe("fail");
  });

  it("detects DMARC fail", () => {
    expect(metadata.dmarc).toBe("fail");
  });

  it("parses reply-to as different domain", () => {
    expect(metadata.replyToDomain).toBe("paypa1-verify.com");
  });
});
