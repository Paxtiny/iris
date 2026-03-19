# nicodAImus iris

Privacy-first email phishing detection browser extension for Gmail and Proton Mail.

Scores emails 0-10 for phishing risk, entirely in your browser. No data leaves your machine.

## What it does

Click the **iris icon** in your browser's extension toolbar while viewing an email:

- Checks email authentication (DKIM, SPF, DMARC)
- Detects domain impersonation and homoglyph attacks (paypa1.com, amaz0n.com)
- Identifies mismatched reply-to and link domains
- Detects urgency language and credential requests (EN/DE)
- Thread-aware: skips your own sent messages, shows info card for reply threads
- Explains the result in plain language

**Score 0-2** (green) - Very likely legitimate
**Score 3-5** (yellow) - Review carefully
**Score 6-10** (red) - Very likely phishing

### Proton Mail extras

For Proton Mail, iris also offers an optional **Verify authentication** step that fetches the full raw headers on demand, letting you confirm DKIM/SPF/DMARC results from the actual message envelope rather than the DOM.

## Privacy

All analysis happens locally in your browser. The extension makes no automatic network requests. [Full privacy policy](docs/PRIVACY.md).

Verify yourself: open DevTools Network tab while using iris. You will see no outgoing requests from the extension itself (the only exception is if you actively click the "by nicodAImus" link in the panel header).

## Install

### Chrome (developer mode)

1. Clone or download this repo
2. Run `npm install && npm run build`
3. Open `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the `dist/chrome/` folder
7. Open Gmail or Proton Mail and click the iris icon in the extension toolbar

### Firefox

1. Clone or download this repo
2. Run `npm install && npm run build`
3. Open `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select `dist/firefox/manifest.json`
6. Open Gmail or Proton Mail and click the iris icon in the extension toolbar

## How it works

iris opens a persistent side panel when you click its icon. The panel stays open while you browse your inbox.

**Gmail:** iris fetches the raw `.eml` file from Gmail (background fetch to bypass CORS) and parses authentication headers, sender domains, and links locally. Falls back to DOM-based analysis if the fetch fails.

**Proton Mail:** iris parses headers from the email's content iframes. The optional "Verify authentication" button fetches the full raw headers on demand.

1. **Header parsing** - Extracts sender, reply-to, return-path, authentication results (DKIM/SPF/DMARC)
2. **Domain analysis** - Compares claimed identity with actual domains, detects homoglyphs
3. **Link extraction** - Checks if links go to the expected domains
4. **Urgency detection** - Identifies pressure language (EN/DE) and credential requests
5. **Scoring** - Combines all signals into a 0-10 risk score
6. **Explanation** - Generates a plain-language verdict

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build for Firefox
npm run build -- --target firefox

# Build for Chrome
npm run build -- --target chrome

# Build for both
npm run build
```

## Project structure

```
src/
  core/               # Scoring engine (zero dependencies, platform-agnostic)
    types.ts
    headerParser.ts
    domainAnalyzer.ts
    linkExtractor.ts
    urgencyDetector.ts
    attachmentAnalyzer.ts
    scorer.ts
  data/               # Known legitimate domains list
  platforms/
    chrome/           # Chrome extension (Manifest V3)
      background.ts   # Service worker: panel window management, EML fetch
      content-gmail.ts
      content-protonmail.ts
      popup.ts / popup.html
    firefox/          # Firefox extension (same source, different manifest)
  ui/                 # Shared UI components and styles
  icons/              # Extension and panel icons
tests/
  core/               # Unit tests (Vitest)
  fixtures/           # Sample .eml files
```

## Contributing

The core scoring engine (`src/core/`) is where most contributions will land:
- New homoglyph patterns
- Additional brand domains
- Urgency patterns in more languages
- Better scoring heuristics

PRs welcome. Please include tests for new patterns.

## License

MIT

## About

Built by [nicodAImus](https://nicodaimus.com) - privacy-first AI assistant.
