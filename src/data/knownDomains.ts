/**
 * Known-legitimate domain list for nicodAImus iris.
 *
 * Domains in this set are exempt from homoglyph detection - they are
 * well-established, high-traffic domains unlikely to be phishing infrastructure.
 *
 * Sources:
 *   - Tranco top-5000 (https://tranco-list.eu/) - run `npm run update-known-domains`
 *   - Manual additions for common email-sending domains
 *
 * IMPORTANT: This list suppresses false positives but does NOT suppress
 * auth (DKIM/SPF/DMARC) failures or urgency/credential signals.
 * A domain being "known" only means it is not flagged as a homoglyph impersonator.
 *
 * Last updated: 2026-03-19 (initial snapshot - run update-known-domains for full list)
 */
export const KNOWN_DOMAINS = new Set<string>([
  // === Search & Portals ===
  "google.com", "bing.com", "yahoo.com", "baidu.com", "yandex.com", "yandex.ru",
  "duckduckgo.com", "ask.com", "aol.com", "msn.com", "search.com",

  // === Social Media ===
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
  "reddit.com", "pinterest.com", "tiktok.com", "snapchat.com", "tumblr.com",
  "whatsapp.com", "telegram.org", "discord.com", "twitch.tv", "vk.com",
  "weibo.com", "qq.com", "quora.com", "medium.com",

  // === Microsoft family ===
  "microsoft.com", "microsoftadvertising.com", "microsoftonline.com",
  "office.com", "office365.com", "outlook.com", "hotmail.com", "live.com",
  "bing.com", "azure.com", "azure.net", "azurewebsites.net", "msn.com",
  "dynamics.com", "mkt.dynamics.com", "dynmktg.com", "pb-dynmktg.com",
  "xbox.com", "skype.com", "sharepoint.com", "onedrive.com", "onenote.com",
  "msedge.net", "visualstudio.com", "azureedge.net", "windowsazure.com",
  "microsoft365.com", "teams.microsoft.com",

  // === Google family ===
  "gmail.com", "googlemail.com", "youtube.com", "googleapis.com",
  "googleadservices.com", "google-analytics.com", "googletagmanager.com",
  "gstatic.com", "googlevideo.com", "ggpht.com", "googleusercontent.com",
  "doubleclick.net", "admob.com", "blogger.com", "blogspot.com", "waze.com",
  "google.de", "google.co.uk", "google.fr", "google.es", "google.it",
  "google.pl", "google.nl", "google.at", "google.ch", "google.ru",
  "google.co.jp", "google.com.br", "google.com.au",

  // === Amazon family ===
  "amazon.com", "amazon.de", "amazon.co.uk", "amazon.fr", "amazon.it",
  "amazon.es", "amazon.ca", "amazon.co.jp", "amazon.com.au", "amazon.com.br",
  "amazon.in", "amazon.nl", "amazon.pl", "amazon.se", "amazon.com.mx",
  "amazonaws.com", "amazonpay.com", "awstrack.me", "amazon-adsystem.com",
  "media-amazon.com", "ssl-images-amazon.com", "audible.com", "twitch.tv",
  "alexa.com", "zappos.com", "imdb.com", "goodreads.com",

  // === Apple ===
  "apple.com", "icloud.com", "me.com", "mac.com", "itunes.com",
  "mzstatic.com", "aaplimg.com",

  // === Meta family ===
  "meta.com", "fb.com", "fbcdn.net", "messenger.com", "oculus.com",
  "workplace.com", "instagram.com", "whatsapp.com",

  // === E-commerce ===
  "ebay.com", "ebay.de", "ebay.co.uk", "ebay.fr", "ebay.it", "ebay.es",
  "ebay.com.au", "ebaystatic.com", "ebayimg.com",
  "shopify.com", "myshopify.com", "shopifycdn.com",
  "etsy.com", "aliexpress.com", "alibaba.com", "taobao.com", "jd.com",
  "paypal.com", "paypal.de", "paypal.co.uk", "paypal.fr", "paypalobjects.com",
  "stripe.com", "stripe.network",
  "klarna.com", "klarna.se", "adyen.com",

  // === Cloud & Hosting ===
  "cloudflare.com", "cloudflare.net", "aws.amazon.com",
  "digitalocean.com", "heroku.com", "vercel.com", "netlify.com",
  "github.com", "githubusercontent.com", "githubassets.com", "gitlab.com",
  "bitbucket.org", "atlassian.com", "jira.com", "confluence.com",
  "fastly.net", "akamai.com", "akamaized.net", "edgekey.net",
  "cdn77.com", "bunnycdn.com", "stackpath.com",

  // === Email & Marketing ===
  "sendgrid.net", "sendgrid.com", "mailchimp.com", "list-manage.com",
  "mcusercontent.com", "mandrillapp.com", "mailgun.org", "mailgun.net",
  "postmarkapp.com", "sparkpostmail.com", "sparkpost.com",
  "amazonses.com", "sesnotifications.com",
  "sendinblue.com", "brevo.com",
  "hubspot.com", "hubspotemail.net", "hs-emails.com", "hsappstatic.net",
  "klaviyo.com", "klaviyomail.com",
  "constantcontact.com", "r.constantcontact.com",
  "activecampaign.com", "mcsv.net",
  "campaign-archive.com", "createsend.com",
  "exacttarget.com", "salesforceiq.com", "pardot.com",

  // === CRM & Business ===
  "salesforce.com", "force.com",
  "sap.com", "oracle.com", "servicenow.com",
  "zendesk.com", "intercom.io", "freshdesk.com",
  "notion.so", "airtable.com", "monday.com", "asana.com",

  // === Communications & Productivity ===
  "slack.com", "slack-edge.com",
  "zoom.us", "zoom.com",
  "dropbox.com", "dropboxstatic.com",
  "box.com", "wetransfer.com",
  "docusign.com", "docusign.net",

  // === Adobe ===
  "adobe.com", "adobecc.com", "adobelogin.com", "adobeaemcloud.com",
  "typekit.com", "typekit.net",

  // === Streaming ===
  "netflix.com", "nflximg.net", "nflxvideo.net",
  "spotify.com", "scdn.co",
  "apple.com", "disneyplus.com", "hulu.com", "hbo.com",
  "youtube.com", "youtu.be",
  "soundcloud.com", "deezer.com",

  // === Travel ===
  "booking.com", "airbnb.com", "expedia.com", "hotels.com",
  "uber.com", "lyft.com", "airbnb.com",
  "tripadvisor.com", "kayak.com", "skyscanner.net",
  "ryanair.com", "lufthansa.com", "delta.com", "united.com",

  // === Finance & Banking ===
  "paypal.com", "venmo.com", "wise.com", "revolut.com",
  "visa.com", "mastercard.com", "amex.com", "americanexpress.com",
  "jpmorgan.com", "citibank.com", "bankofamerica.com", "chase.com",
  "wellsfargo.com", "barclays.com", "hsbc.com", "santander.com",
  "ing.com", "ing.de", "ing.nl", "comdirect.de", "dkb.de",
  "deutsche-bank.de", "db.com", "commerzbank.de", "postbank.de",
  "sparkasse.de", "volksbank.de", "raiffeisenbank.de",

  // === Logistics ===
  "dhl.com", "dhl.de", "fedex.com", "ups.com", "usps.com",
  "dpd.com", "gls-group.eu", "hermes.de", "dpdgroup.com",
  "royalmail.com", "deutschepost.de",

  // === News & Media ===
  "bbc.com", "bbc.co.uk", "cnn.com", "nytimes.com", "theguardian.com",
  "reuters.com", "apnews.com", "bloomberg.com", "wsj.com",
  "spiegel.de", "zeit.de", "faz.net", "sueddeutsche.de", "welt.de",
  "heise.de", "golem.de",

  // === Developer Tools ===
  "stackoverflow.com", "npmjs.com", "pypi.org", "rubygems.org",
  "docker.com", "kubernetes.io", "terraform.io",
  "jetbrains.com", "intellij.com",

  // === Security & Identity ===
  "okta.com", "auth0.com", "onelogin.com",
  "1password.com", "lastpass.com", "bitwarden.com",
  "letsencrypt.org", "digicert.com", "verisign.com",

  // === Misc well-known ===
  "wikipedia.org", "wikimedia.org",
  "wordpress.com", "wordpress.org", "wix.com", "squarespace.com",
  "godaddy.com", "namecheap.com", "hover.com",
  "twilio.com", "vonage.com",
  "protonmail.com", "proton.me", "tutanota.com",
  "mozilla.org", "firefox.com",
  "w3.org", "iana.org", "icann.org",
  "coinbase.com", "binance.com", "kraken.com",
]);
