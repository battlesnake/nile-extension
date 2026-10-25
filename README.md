# Nile — Amazon Every-Word Search Filter

A browser extension (Manifest **V3** and **V2**) that **greys out** any Amazon
search result whose **title (or brand) does not contain every word of your
search query**.

Search `1TB SATA SSD` and Amazon still shows you `512GB SATA SSD` and
`1TB USB SSD`. Nile dims them — they're missing `1TB` and `SATA` respectively —
so the results you actually asked for stand out. Dimmed tiles restore to full
colour on hover, so nothing is ever truly hidden.

Matching is quote-, quantity- and unit-aware, and every rule is tunable from the
options page. Inspired by [Shpigford/knockoff](https://github.com/Shpigford/knockoff)
(brand filtering); Nile reuses its tile-detection approach and adds a full
query-matching engine.

---

## Install (unpacked)

First build the two loadable folders from the source tree:

```bash
node build.js          # creates dist/mv3/ and dist/mv2/
```

### Chrome / Edge / Brave (Manifest V3)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. **Load unpacked** → select the **`dist/mv3`** folder
4. Open any Amazon search page — mismatched results are greyed out.

### Firefox (Manifest V2)

1. Go to `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select **`dist/mv2/manifest.json`**
   (temporary add-ons are removed when Firefox restarts; that's expected for
   unsigned local installs)

Click the toolbar button any time to open **settings**.

---

## How matching works

A result is **kept** only if its title satisfies **every** term in your query
(connector words included). Otherwise it's greyed.

- **Title or brand**: Amazon often shows the brand on its own line above the
  title (brand `DESTEK`, title “V5 VR Glasses…”). A plain word may match
  either, so `DESTEK V5` keeps that result. Switch off with *Also match the
  brand*; use `@` (below) to demand a brand match.

- **Whole-word, case-insensitive** by default: `SSD` matches “2TB SSD” and
  “SSD-Drive”, but not “SSDs” or “mSSD”.
- **Spacing-flexible**: `1TB` matches “1 TB”.
- **Hyphen-flexible**: `USB-C` matches “USB C” (only a space or hyphen may sit
  between the parts — not “USBC”).
- **Number-equivalent**: `2` matches “2.0”, “2.00”.
- **Data-size-equivalent** (binary *and* decimal): `1TB` matches “1000GB” and
  “1024 GB”; `1GB` matches “1024MB”.
- **Measure-equivalent**: `1GHz` = “1000MHz”, `1Ah` = “1000mAh”, `1m` = “100cm”,
  `1kg` = “1000g”, plus `W`, `V`, `A`, `Wh`, `Mbps`, `MP`, inches…

Every one of these is an on/off toggle in settings, each shown with a live
example. There's also a **“Try your rules”** box on the options page that runs a
query against a sample title using your current settings.

## Query operators (type them in the Amazon search box)

Amazon ignores these; Nile uses them, so Amazon returns a superset and Nile
filters it precisely.

| Operator | Meaning | Example |
|---|---|---|
| `"exact phrase"` | that phrase must appear verbatim (one part of the query can be exact without the whole query being exact) | `ssd "SATA III"` |
| `[a b c]` | the bracketed words must appear in that left-to-right order (gaps allowed) | `[1TB SSD]` |
| `@word` / `@"phrase"` | the next word or phrase must match the product's **brand**, not the title (plain words may match either) | `@DESTEK V5`, `@"Black Diamond" jacket` |
| `~<num><unit>` | matches anything within the tolerance % (default 10%); no space after `~` | `~0.5TB` matches 480GB |

## Settings

Open via the toolbar button (or the extension's *Options*). All settings sync
across your browser profile.

| Setting | Default |
|---|---|
| Enabled (master) | On |
| Whole words only | On |
| Number/unit spacing flexible | On |
| Hyphen/space flexible | On |
| Match equal numbers | On |
| Match equivalent data sizes | On |
| Match equivalent measures | On |
| Case-sensitive | Off |
| Words must appear in order | Off |
| Whole query must be one phrase | Off |
| Ignore connector words | Off |
| Also match the brand | On |
| Tolerance % (for `~`) | 10 |

---

## Development

```
src/matcher.js     pure matching engine (no DOM/chrome) — the core logic
src/content.js     DOM layer: read query, find tiles, apply the grey-out
src/styles.css     the dim/desaturate treatment (classes prefixed nile-)
src/background.js   toolbar click → open options (MV3 SW / MV2 event page)
options/           settings page (toggles + examples + live tester)
manifest.v3.json   Chrome/Edge/Firefox-109+
manifest.v2.json   Firefox / older Chromium
build.js           assembles dist/mv3 + dist/mv2 from the above
tests/run.js       Node test suite for the matcher
tests/e2e.js       headless-Chromium test against a real Amazon results fixture
```

```bash
npm test            # run the matcher unit tests
node build.js       # build both dist folders
node build.js --zip # + zip each for distribution
node scripts/render-icons.js   # regenerate PNG icons from icons/icon.svg
```

The matcher is deliberately pure so it can be unit-tested exhaustively in Node
and shipped unchanged as a content-script global (`window.NileMatcher`).

## Publishing

Store-ready assets and a step-by-step checklist live in `store-assets/`:
listing copy (`listing.md`), the publishing walkthrough (`PUBLISHING.md`),
1280×800 screenshots, and 440×280 / 1400×560 promo tiles. Privacy policy:
[`PRIVACY.md`](PRIVACY.md) (Nile collects nothing). Build the uploadable package
with `node build.js --zip` → `dist/nile-mv3.zip`.

## Design

See [`docs/superpowers/specs/2026-07-07-nile-amazon-every-word-filter-design.md`](docs/superpowers/specs/2026-07-07-nile-amazon-every-word-filter-design.md).

## Licence

MIT.
