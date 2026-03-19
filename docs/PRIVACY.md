# Privacy Policy - nicodAImus iris

## What iris does

nicodAImus iris analyzes emails for phishing risk directly in your browser.

## What data iris accesses

When you click the iris icon in your browser's extension toolbar and then click "Scan":

1. iris reads the email headers (sender, authentication results, reply-to address)
2. iris reads the links in the email body (domain names only)
3. iris scores these signals locally in your browser

## What data iris sends

**Nothing from the extension itself.** All analysis happens locally in your browser. No data is sent to any server automatically.

You can verify this yourself:
- The source code is open on GitHub
- Open your browser's DevTools Network tab while using iris - you will see zero outgoing requests from the extension

## Developer attribution link

The iris panel displays a "by nicodAImus" link in the header. If you click it, your browser navigates to [nicodaimus.com](https://nicodaimus.com). That website uses [Plausible Analytics](https://plausible.io) (privacy-first, no cookies, no fingerprinting, GDPR-compliant) which may record the page visit. The link includes a `utm_source=iris` parameter so the site can count how many visitors came from iris.

This only happens if you actively click the link. The extension never makes this request on your behalf.

## What data iris stores

iris does not store any data. Each analysis is performed on-demand when you click Scan. Nothing is saved to disk, local storage, or cookies.

## Permissions

iris requires access to:
- `mail.google.com` - to read the email you want to analyze (Gmail)
- `mail.proton.me` - to read the email you want to analyze (Proton Mail)
- `activeTab` - to connect the panel window to the tab you are currently viewing

iris does not access any other websites automatically.

## Future versions

Future versions may offer optional AI-powered deep analysis for ambiguous emails. If this feature is added:
- It will be opt-in (you click a button to request it)
- Only structured metadata will be sent (domain names, authentication results)
- No email body, subject text, or personal information will leave your browser
- The privacy policy will be updated before any such change

## Disclaimer and limitation of liability

iris is a best-effort tool that estimates phishing risk based on heuristics: email authentication results (DKIM, SPF, DMARC), domain analysis, link inspection, and language patterns. It cannot guarantee detection of all phishing attempts.

Sophisticated phishing emails - for example those that pass all authentication checks, use recently registered look-alike domains, or do not contain urgency language - may score as safe even if they are malicious. A low risk score is not a guarantee of safety.

**nicodAImus accepts no liability for any security incident, financial loss, data breach, or other harm that results from an email iris did not flag as suspicious or dangerous.** iris is provided as-is, without warranty of any kind.

iris is intended as one layer of awareness, not as a replacement for professional IT security measures, anti-malware software, or your own judgement. When in doubt, do not click links or open attachments.

## Contact

Questions about privacy? Open an issue on the GitHub repository.
