#!/usr/bin/env node
/**
 * Send test emails to verify iris phishing detection signals.
 * Uses nodemailer with Ethereal (fake SMTP) to generate .eml files,
 * then provides a web link to view each email.
 *
 * For real delivery: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.
 * Example with Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com SMTP_PASS=app-password
 *
 * Usage: node admin-tools/send-test-emails.mjs [--dry-run]
 */

import nodemailer from "nodemailer";

const RECIPIENTS = [
  "clemensk77@gmail.com",
  "paxtiny@protonmail.com",
];

const DRY_RUN = process.argv.includes("--dry-run");

const TEST_EMAILS = [
  // ── 1. DANGEROUS: display name spoof + shortener + generic greeting + form + reply-to mismatch
  {
    name: "EN dangerous - spoof + shortener + greeting + form + reply-to",
    from: '"security@paypal.com" <noreply@test-iris.local>',
    replyTo: "phisher@evil-domain.xyz",
    subject: "[iris-test-1] Your PayPal account has been limited",
    html: `<p>Dear Customer,</p>
<p>We have detected suspicious activity on your PayPal account.
Your account has been temporarily limited.</p>
<p>Please verify your identity immediately:<br>
<a href="https://bit.ly/3xR9kZ2">https://bit.ly/3xR9kZ2</a></p>
<p>Or enter your credentials here:</p>
<form action="https://paypa1-secure.xyz/verify" method="post">
<input type="text" name="email" placeholder="Email"><br>
<input type="password" name="password" placeholder="Password"><br>
<button type="submit">Verify</button>
</form>
<p>If you do not verify within 24 hours, your account will be permanently suspended.</p>
<p>PayPal Security Team</p>`,
    expectedScore: "7+ (dangerous)",
    signals: "display name spoof, shortener, generic greeting, embedded form, reply-to mismatch",
  },
  // ── 2. DANGEROUS: DE urgency + credentials + reply-to mismatch
  {
    name: "DE dangerous - urgency + credentials + reply-to mismatch",
    from: '"Deutsche Bank Sicherheit" <noreply@test-iris.local>',
    replyTo: "scammer@deutschebank-konto.xyz",
    subject: "[iris-test-2] Dringend: Ihr Konto wurde gesperrt",
    html: `<p>Sehr geehrter Kunde,</p>
<p>Ihr Bankkonto wurde aufgrund verdaechtiger Aktivitaeten gesperrt.
Sie muessen Ihre Identitaet sofort ueberpruefen, oder Ihr Konto wird dauerhaft geloescht.</p>
<p>Klicken Sie hier um Ihr Konto zu entsperren:<br>
<a href="https://deutschebank-konto.xyz/verify">https://deutschebank-konto.xyz/verify</a></p>
<p>Geben Sie Ihr Passwort ein um Ihre Identitaet zu bestaetigen.</p>
<p><strong>Handeln Sie jetzt - Sie haben 24 Stunden.</strong></p>
<p>Mit freundlichen Gruessen,<br>Deutsche Bank Sicherheitsteam</p>`,
    expectedScore: "5+ (dangerous)",
    signals: "urgency, credentials, generic greeting, reply-to mismatch",
  },
  // ── 3. UNCERTAIN: shortener + generic greeting (milder)
  {
    name: "EN uncertain - shortener + generic greeting",
    from: '"Account Service" <noreply@test-iris.local>',
    replyTo: "",
    subject: "[iris-test-3] Action required on your account",
    html: `<p>Dear User,</p>
<p>We noticed unusual activity on your account. For your safety,
we recommend reviewing your recent transactions.</p>
<p>Review your account here:<br>
<a href="https://tinyurl.com/y8x3k9m2">https://tinyurl.com/y8x3k9m2</a></p>
<p>If you did not make these changes, please contact support.</p>
<p>Best regards,<br>Account Service Team</p>`,
    expectedScore: "2-4 (uncertain)",
    signals: "shortener, generic greeting",
  },
  // ── 4. SAFE: EN newsletter (control)
  {
    name: "EN safe - clean newsletter (control)",
    from: '"nicodAImus Team" <noreply@test-iris.local>',
    replyTo: "",
    subject: "[iris-test-4] March 2026 Update - What's New",
    html: `<p>Hello,</p>
<p>Here are this month's highlights from the nicodAImus team:</p>
<ul>
<li>New feature: enhanced phishing detection with 6 new signals</li>
<li>Improved panel design with glass-on-void aesthetic</li>
<li>Gmail and Proton Mail support with provider indicators</li>
</ul>
<p>Visit our website for details: <a href="https://nicodaimus.com/blog">nicodaimus.com/blog</a></p>
<p>Best regards,<br>The nicodAImus Team</p>`,
    expectedScore: "0-1 (safe)",
    signals: "none (clean control email)",
  },
  // ── 5. SAFE: DE newsletter (control)
  {
    name: "DE safe - clean newsletter (control)",
    from: '"nicodAImus Team" <noreply@test-iris.local>',
    replyTo: "",
    subject: "[iris-test-5] Maerz 2026 - Neuigkeiten von nicodAImus",
    html: `<p>Hallo,</p>
<p>Hier sind die Neuigkeiten aus dem nicodAImus-Team:</p>
<ul>
<li>Neue Funktion: verbesserte Phishing-Erkennung mit 6 neuen Signalen</li>
<li>Ueberarbeitetes Panel-Design im Glass-on-Void-Stil</li>
<li>Gmail und Proton Mail Unterstuetzung</li>
</ul>
<p>Besuchen Sie unsere Webseite: <a href="https://nicodaimus.com/blog">nicodaimus.com/blog</a></p>
<p>Mit freundlichen Gruessen,<br>Das nicodAImus-Team</p>`,
    expectedScore: "0-1 (safe)",
    signals: "none (clean control email)",
  },
];

async function createTransport() {
  // Check for custom SMTP config
  if (process.env.SMTP_HOST) {
    console.log(`Using custom SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback: Ethereal (test account - emails viewable at ethereal.email but NOT delivered)
  console.log("No SMTP_HOST set. Creating Ethereal test account (emails won't be delivered)...");
  const testAccount = await nodemailer.createTestAccount();
  console.log(`Ethereal account: ${testAccount.user}`);
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

async function main() {
  const total = TEST_EMAILS.length * RECIPIENTS.length;
  console.log("iris test email sender");
  console.log(`Emails: ${TEST_EMAILS.length} x ${RECIPIENTS.length} recipients = ${total} sends\n`);

  if (DRY_RUN) {
    for (const email of TEST_EMAILS) {
      console.log(`[DRY RUN] ${email.name}`);
      console.log(`  Subject: ${email.subject}`);
      console.log(`  From: ${email.from}`);
      console.log(`  Reply-To: ${email.replyTo || "(none)"}`);
      console.log(`  Expected: ${email.expectedScore}`);
      console.log(`  Signals: ${email.signals}\n`);
    }
    return;
  }

  const transport = await createTransport();
  let sent = 0;

  for (const email of TEST_EMAILS) {
    console.log(`\n${email.name}`);
    for (const recipient of RECIPIENTS) {
      try {
        const info = await transport.sendMail({
          from: email.from,
          to: recipient,
          replyTo: email.replyTo || undefined,
          subject: email.subject,
          html: email.html,
        });
        sent++;
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`  -> ${recipient}: OK${previewUrl ? ` | Preview: ${previewUrl}` : ""}`);
      } catch (err) {
        console.error(`  -> ${recipient}: FAILED - ${err.message}`);
      }
    }
  }

  console.log(`\nDone! ${sent}/${total} sent.`);
  if (!process.env.SMTP_HOST) {
    console.log("\n⚠ Ethereal does NOT deliver emails. Preview links above show the emails.");
    console.log("For real delivery, re-run with SMTP credentials:");
    console.log("  SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com SMTP_PASS=app-password node admin-tools/send-test-emails.mjs");
  }
  console.log("\nExpected iris scores:");
  for (const email of TEST_EMAILS) {
    console.log(`  ${email.subject.replace("[iris-test-", "#").replace("]", "")}: ${email.expectedScore} (${email.signals})`);
  }
}

main().catch(console.error);
