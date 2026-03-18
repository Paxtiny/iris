# nicodAImus iris

Privacy-first email phishing detection browser extension.

Scores emails 0-10 for phishing risk, entirely in your browser. No data leaves your machine.

## What it does

Click the **iris** button in your Gmail toolbar to analyze any email:

- Checks email authentication (DKIM, SPF, DMARC)
- Detects domain impersonation and homoglyph attacks (paypa1.com, amaz0n.com)
- Identifies mismatched reply-to and link domains
- Detects urgency language and credential requests
- Explains the result in plain language

**Score 0-2** (green) - Very likely legitimate
**Score 3-5** (yellow) - Review carefully
**Score 6-10** (red) - Very likely phishing

## Privacy

All analysis happens locally in your browser. Zero network requests. Zero data collection. [Full privacy policy](docs/PRIVACY.md).

Verify yourself: open DevTools Network tab while using iris. You will see no outgoing requests.

## Install

### Chrome (developer mode)

1. Clone or download this repo
2. Run `npm install && npm run build`
3. Open `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the `dist/chrome/` folder
7. Open Gmail - you'll see the iris button in the email toolbar

### Firefox

1. Clone or download this repo
2. Run `npm install && npm run build`
3. Open `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select `dist/firefox/manifest.json`
6. Open Gmail - you'll see the iris button in the email toolbar

### Alternative: browser toolbar icon

If the toolbar button doesn't appear (Gmail DOM updates can affect injection), click the iris icon in your browser's extension toolbar for the same functionality.

## How it works

iris fetches the raw email (.eml) from Gmail and analyzes it locally:

1. **Header parsing** - Extracts sender, reply-to, return-path, authentication results
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

# Build for Chrome
npm run build:chrome

# Build for Firefox
npm run build:firefox

# Build for both
npm run build
```

## Project structure

```
src/
  core/           # Scoring engine (zero dependencies, platform-agnostic)
    types.ts      # TypeScript interfaces
    headerParser.ts
    domainAnalyzer.ts
    linkExtractor.ts
    urgencyDetector.ts
    scorer.ts
  platforms/
    chrome/       # Chrome extension (Manifest V3)
    firefox/      # Firefox extension
  ui/             # Shared UI components
tests/
  core/           # Unit tests
  fixtures/       # Sample .eml files
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
