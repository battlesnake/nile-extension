# Nile — Privacy Policy

_Last updated: 2026-07-08_

**Nile collects no personal data. None of your data ever leaves your browser.**

## What Nile does

Nile is a browser extension that greys out Amazon search results whose title
does not contain every word of your search query. To do this, its content
script reads two things **on Amazon search pages only**:

- your search query (from the page URL / the Amazon search box), and
- the visible product titles on the page.

This information is used **locally, in the moment, in your browser** solely to
decide which results to dim. It is never stored, logged, or transmitted.

## What Nile stores

Only your **settings** (the matching-rule toggles on the options page) are
saved, using your browser's own extension storage (`chrome.storage.sync`). This
lets your preferences persist and sync across your own signed-in browsers via
the browser vendor. Nile itself operates no servers and receives none of this.

## What Nile does NOT do

- No analytics, tracking, or telemetry.
- No network requests of any kind — the extension makes none.
- No remote code — all logic is bundled in the package you install.
- No collection of personal information, browsing history, purchases, or
  activity.
- No selling or sharing of data (there is no data to sell or share).

## Permissions

- **storage** — to save your settings, as described above.
- **Access to Amazon sites** — so the content script can run on Amazon search
  pages to dim non-matching results. It runs only on Amazon domains.

## Contact

Questions about this policy: open an issue on the project's repository.
