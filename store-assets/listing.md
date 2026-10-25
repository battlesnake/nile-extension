# Chrome Web Store — listing content

Copy/paste these into the Developer Dashboard when creating the item. Field
limits noted. (Name and version come from the manifest and can't be changed
per-upload; listing text/images can be edited any time.)

---

## Product name
`Nile — Amazon Every-Word Search Filter`  (≤ 45 chars ✓)

## Summary / short description  (≤ 132 chars)
`Greys out Amazon search results whose title is missing a word of your search — tunable, quantity-aware matching.`
(118 chars — matches the manifest description.)

## Category
**Shopping**  (alt: Productivity)

## Language
English (United Kingdom) — or English (United States)

---

## Detailed description  (≤ 16,000 chars)

Amazon shows you results that don't match what you typed. Search "1TB SATA SSD"
and you still get "512GB SATA SSD" and "1TB USB SSD". Nile fixes that.

Nile greys out (dims) every Amazon search result whose TITLE does not contain
EVERY word of your search query — so the results you actually asked for stand
out. Dimmed results aren't hidden: hover any one to bring it back to full colour.

WHY IT'S DIFFERENT
Nile understands what the words mean, not just how they're spelled:
• Whole-word, case-insensitive matching — "SSD" won't match "SSDs".
• Spacing & hyphens — "1TB" = "1 TB", "USB-C" = "USB C".
• Equal numbers — "2" = "2.0" = "2.00".
• Data sizes, binary AND decimal — "1TB" = "1000GB" = "1024GB", "1GB" = "1024MB".
• Measures — "1GHz" = "1000MHz", "1Ah" = "1000mAh", "1m" = "100cm", "1kg" = "1000g".
• Thousands separators & spelled-out units — "10,000mAh", "1 Terabyte", "500 Watts".

POWERFUL, OPTIONAL SEARCH OPERATORS
Type these straight into the Amazon search box — Amazon ignores them, Nile uses
them:
• "exact phrase" — require a phrase verbatim, e.g. ssd "SATA III"
• [word order]  — require words in order, e.g. [1TB SSD]
• @brand        — the next word/phrase must match the product's brand, e.g. @DESTEK or @"Black Diamond"
• ~0.5TB        — match within a tolerance (default 10%), e.g. ~0.5TB matches 480GB

FULLY TUNABLE
An options page lets you switch every matching rule on or off — each shown with
a live example — plus a "Try your rules" box that tests a title against your
settings instantly. Defaults are tuned for real Amazon titles.

PRIVATE BY DESIGN
Nile collects nothing. It runs entirely in your browser, makes no network
requests, and contains no analytics or remote code. Your settings are stored
only in your browser's own sync storage.

Works on Amazon marketplaces worldwide (.com, .co.uk, .de, .fr, .ca, .co.jp, and
more). Open source.

---

## Single purpose (required)
Nile has a single purpose: to visually de-emphasise (grey out) Amazon search
results whose product title does not contain every word of the user's search
query.

## Permission justifications (required)
- **storage** — to save the user's matching-rule preferences (the options-page
  toggles) and sync them across the user's own browsers. No other use.
- **Host access to Amazon sites** (`https://www.amazon.*/*` — declared via
  content scripts, not host_permissions) — the content script must read the
  search query and product titles on Amazon search pages to decide which
  results to dim. It runs only on Amazon domains and sends nothing anywhere.

## Data usage disclosures (Privacy practices tab)
- Does the item collect user data? **No.**
- Tick nothing under the data-type categories (no PII, no activity, no web
  history, etc.).
- Remote code: **No**, the extension does not use remote code (all JS is bundled).
- Certify compliance with the Developer Program Policies: **Yes**.
- Privacy policy URL: host `PRIVACY.md` (see PUBLISHING.md) and paste its URL if
  the form asks for one.

---

## Asset → field mapping
| Store field | File |
|---|---|
| Package (ZIP) | `dist/nile-mv3.zip` (manifest.json at root) |
| Store icon (128×128) | `store-assets/store-icon-128.png` |
| Screenshot 1 (1280×800) | `store-assets/screenshots/1-amazon-greyed.png` |
| Screenshot 2 (1280×800) | `store-assets/screenshots/2-options.png` |
| Screenshot 3 (1280×800) | `store-assets/screenshots/3-operators-tester.png` |
| Small promo tile (440×280) | `store-assets/promo/small-tile-440x280.png` |
| Marquee promo tile (1400×560) | `store-assets/promo/marquee-1400x560.png` |
