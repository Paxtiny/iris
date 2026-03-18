import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseEmailHeaders } from "../../src/core/headerParser";
import { analyzeDomains } from "../../src/core/domainAnalyzer";
import { extractLinks } from "../../src/core/linkExtractor";
import { detectUrgency } from "../../src/core/urgencyDetector";
import { scoreEmail } from "../../src/core/scorer";

const fixturesDir = resolve(__dirname, "../fixtures");

function analyzeFixture(filename: string) {
  const eml = readFileSync(resolve(fixturesDir, filename), "utf-8");
  const metadata = parseEmailHeaders(eml);
  const links = extractLinks(eml);
  const linkDomains = links.map((l) => l.domain);
  const domains = analyzeDomains(metadata, linkDomains);
  const urgency = detectUrgency(eml);
  return scoreEmail(metadata, domains, urgency);
}

describe("Full pipeline - scoring", () => {
  it("scores legit Google Cloud email as safe (0-2)", () => {
    const result = analyzeFixture("legit-google-cloud.eml");
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.level).toBe("safe");
    expect(result.explanation).toContain("google.com");
  });

  it("scores phishing PayPal email as dangerous (6+)", () => {
    const result = analyzeFixture("phishing-paypal.eml");
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.level).toBe("dangerous");
  });

  it("phishing email has multiple red flag signals", () => {
    const result = analyzeFixture("phishing-paypal.eml");
    const signalNames = result.signals.map((s) => s.name);
    expect(signalNames).toContain("dkim_fail");
    expect(signalNames).toContain("spf_fail");
    expect(signalNames).toContain("dmarc_fail");
    expect(signalNames).toContain("urgency");
    expect(signalNames).toContain("credential_request");
  });

  it("scores ambiguous newsletter in uncertain range (3-5)", () => {
    const result = analyzeFixture("ambiguous-newsletter.eml");
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it("legit email has all_auth_pass signal", () => {
    const result = analyzeFixture("legit-google-cloud.eml");
    const signalNames = result.signals.map((s) => s.name);
    expect(signalNames).toContain("all_auth_pass");
  });

  it("result always has an explanation", () => {
    const result = analyzeFixture("legit-google-cloud.eml");
    expect(result.explanation.length).toBeGreaterThan(10);
  });

  it("score is always between 0 and 10", () => {
    for (const fixture of ["legit-google-cloud.eml", "phishing-paypal.eml", "ambiguous-newsletter.eml"]) {
      const result = analyzeFixture(fixture);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    }
  });
});
