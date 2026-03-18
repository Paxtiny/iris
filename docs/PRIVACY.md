# Privacy Policy - nicodAImus iris

## What iris does

nicodAImus iris analyzes emails for phishing risk directly in your browser.

## What data iris accesses

When you click the "iris" button on an email:

1. iris reads the email headers (sender, authentication results, reply-to address)
2. iris reads the links in the email body (domain names only)
3. iris scores these signals locally in your browser

## What data iris sends

**Nothing.** In the current version, all analysis happens locally in your browser. No data is sent to any server - not to nicodAImus, not to Google, not to anyone.

You can verify this yourself:
- The source code is open on GitHub
- Open your browser's DevTools Network tab while using iris - you will see zero outgoing requests

## What data iris stores

iris does not store any data. Each analysis is performed on-demand when you click the button. Nothing is saved to disk, local storage, or cookies.

## Permissions

iris requires access to `mail.google.com` to:
- Inject the check button into the Gmail toolbar
- Read the email you want to analyze
- Display the result card

iris does not access any other websites.

## Future versions

Future versions may offer optional AI-powered deep analysis for ambiguous emails. If this feature is added:
- It will be opt-in (you click a button to request it)
- Only structured metadata will be sent (domain names, authentication results)
- No email body, subject text, or personal information will leave your browser
- The privacy policy will be updated before any such change

## Contact

Questions about privacy? Open an issue on the GitHub repository.
