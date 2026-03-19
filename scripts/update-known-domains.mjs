#!/usr/bin/env node
/**
 * update-known-domains.mjs
 *
 * Fetches the Tranco top-5000 domain list and merges it with the manual
 * additions in src/data/knownDomains.ts.
 *
 * Usage:
 *   node scripts/update-known-domains.mjs
 *   npm run update-known-domains
 *
 * Tranco is an academic research project combining Alexa, Majestic, Umbrella,
 * and Quantcast rankings. Published under CC-BY 4.0.
 * See: https://tranco-list.eu/
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/knownDomains.ts");
const TOP_N = 5000;

async function fetchTrancoList() {
  console.log("Fetching latest Tranco list info...");

  // Get the latest list ID from the Tranco API
  const infoRes = await fetch("https://tranco-list.eu/api/lists/date/latest");
  if (!infoRes.ok) throw new Error(`Tranco info fetch failed: ${infoRes.status}`);
  const info = await infoRes.json();
  const listId = info.list_id;
  console.log(`Latest Tranco list ID: ${listId}`);

  // Download the top-N CSV
  const csvUrl = `https://tranco-list.eu/download/${listId}/${TOP_N}`;
  console.log(`Downloading top-${TOP_N} from ${csvUrl} ...`);
  const csvRes = await fetch(csvUrl);
  if (!csvRes.ok) throw new Error(`Tranco CSV fetch failed: ${csvRes.status}`);
  const csv = await csvRes.text();

  // Parse CSV: format is "rank,domain" (no header row)
  const domains = csv
    .split("\n")
    .map((line) => line.trim().split(",")[1])
    .filter((d) => d && d.length > 0 && d.includes("."));

  console.log(`Parsed ${domains.length} domains from Tranco`);
  return { domains, listId };
}

function extractManualDomains(existingContent) {
  // Extract the Set contents from the existing file
  // Look for lines that are quoted domain strings
  const lines = existingContent.split("\n");
  const manual = new Set();
  let inSet = false;

  for (const line of lines) {
    if (line.includes("KNOWN_DOMAINS = new Set")) { inSet = true; continue; }
    if (inSet && line.trim() === "]);") { break; }
    if (!inSet) continue;

    // Skip comment lines (section headers)
    if (line.trim().startsWith("//")) continue;

    // Extract quoted domain strings
    const matches = line.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g);
    for (const m of matches) {
      manual.add(m[1]);
    }
  }

  return manual;
}

function buildFileContent(trancoDomains, manualDomains, listId, date) {
  // Merge: Tranco first, then manual additions not already in Tranco
  const trancoSet = new Set(trancoDomains);
  const manualOnly = [...manualDomains].filter((d) => !trancoSet.has(d));

  // Format Tranco domains in rows of 5 for readability
  const trancoLines = [];
  for (let i = 0; i < trancoDomains.length; i += 5) {
    const row = trancoDomains.slice(i, i + 5).map((d) => `"${d}"`).join(", ");
    trancoLines.push(`  ${row},`);
  }

  const manualLines = manualOnly.sort().map((d) => `  "${d}",`);

  return `/**
 * Known-legitimate domain list for nicodAImus iris.
 *
 * Domains in this set are exempt from homoglyph detection - they are
 * well-established, high-traffic domains unlikely to be phishing infrastructure.
 *
 * Sources:
 *   - Tranco top-${TOP_N} list ID: ${listId} (https://tranco-list.eu/)
 *   - Manual additions for common email-sending domains not in top-${TOP_N}
 *
 * IMPORTANT: This list suppresses false positives but does NOT suppress
 * auth (DKIM/SPF/DMARC) failures or urgency/credential signals.
 * A domain being "known" only means it is not flagged as a homoglyph impersonator.
 *
 * Last updated: ${date}
 * Run \`npm run update-known-domains\` to refresh.
 */
export const KNOWN_DOMAINS = new Set<string>([
  // === Tranco top-${TOP_N} (ranked by global traffic) ===
${trancoLines.join("\n")}

  // === Manual additions (email-sending domains outside top-${TOP_N}) ===
${manualLines.join("\n")}
]);
`;
}

async function main() {
  try {
    // Read existing file to extract manual additions
    const existing = readFileSync(OUT_PATH, "utf8");
    const manualDomains = extractManualDomains(existing);
    console.log(`Found ${manualDomains.size} manual domain entries to preserve`);

    const { domains: trancoDomains, listId } = await fetchTrancoList();

    const date = new Date().toISOString().split("T")[0];
    const content = buildFileContent(trancoDomains, manualDomains, listId, date);

    writeFileSync(OUT_PATH, content, "utf8");
    const total = new Set([...trancoDomains, ...manualDomains]).size;
    console.log(`\nWrote ${total} domains to src/data/knownDomains.ts`);
    console.log("Run `npm run build` to rebuild the extension.");
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
}

main();
