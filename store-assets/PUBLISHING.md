# Publishing Nile to the Chrome Web Store

Everything is prepared. This is the human-only part (an automated agent can't pay
the fee, host a URL, or click "Submit"). Reference:
https://developer.chrome.com/docs/webstore/prepare

## 0. One-time setup (~5 min, $5)
1. Go to the **Chrome Web Store Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account you want to publish under.
3. Pay the **one-time $5 developer registration fee** and accept the agreement.
4. (Recommended) Set up the publisher display name.

## 1. Build the package
```bash
cd nile-search
node build.js --zip        # produces dist/nile-mv3.zip (manifest.json at root)
```
Upload target: **`dist/nile-mv3.zip`** (Chrome requires Manifest V3).

> Sanity check already done for you: `manifest.json` is at the ZIP root,
> description is 118/132 chars, MV3, `storage` permission only, no remote code.

## 2. Create the item
1. Dashboard → **Add new item** → upload `dist/nile-mv3.zip`.
2. If it complains about the version, note each future upload needs a higher
   `version` than the last (currently `1.1.0`; the first upload was `1.0.0`).

## 3. Fill the Store listing tab
Paste from **`store-assets/listing.md`**:
- **Description** (the detailed description block)
- **Category**: Shopping
- **Language**: English
- **Store icon**: `store-assets/store-icon-128.png` (usually auto-filled from the manifest)
- **Screenshots** (add all three, 1280×800):
  - `store-assets/screenshots/1-amazon-greyed.png`
  - `store-assets/screenshots/2-options.png`
  - `store-assets/screenshots/3-operators-tester.png`
- **Small promo tile** (440×280): `store-assets/promo/small-tile-440x280.png`
- **Marquee promo tile** (1400×560): `store-assets/promo/marquee-1400x560.png`

## 4. Fill the Privacy tab
From **`store-assets/listing.md`** → "Single purpose" and "Permission
justifications", and:
- **Data collection**: declare **no** data collected (leave all categories unticked).
- **Remote code**: **No**.
- **Privacy policy URL**: host `PRIVACY.md` somewhere public and paste the URL.
  Easiest options:
  - Push this repo to GitHub and use the raw URL of `PRIVACY.md`, or GitHub
    Pages, or
  - Paste its contents into a public Gist and use that URL.
- Certify compliance with the Developer Program Policies.

## 5. Distribution
- Visibility: **Public** (or **Unlisted** if you want a private link first).
- Regions: all, or pick.

## 6. Submit
- Click **Submit for review**. First reviews typically take a few days.
- You'll get an email on approval or if changes are requested.

---

## Optional: Firefox (addons.mozilla.org)
The `dist/mv2` build (and its `manifest.v2.json` with the `gecko` id) targets
Firefox. Zip `dist/mv2` and submit at https://addons.mozilla.org/developers/ —
AMO signs it. (Separate account, no fee.) Ask me to prep the AMO listing if you
want to go there too.

## If a review is rejected
Common asks for an extension like this are usually satisfied already: minimal
permissions (`storage` + Amazon host access only), a single clear purpose, no
remote code, and a privacy policy. If they flag host permissions, point to the
permission justification in `listing.md`.
