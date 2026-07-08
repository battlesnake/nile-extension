# Nile — Amazon Every-Word Search Filter (Design)

**Date:** 2026-07-07
**Status:** Approved (built autonomously overnight per user request)

## Problem

Amazon search returns many results whose titles do **not** contain every word
of the search query. Searching `1TB SATA SSD` surfaces `512GB SATA SSD` and
`1TB USB SSD`, neither of which is what was asked for. This extension **greys
out** (dims) any search result whose title does not contain **every** word of
the query, with quote-aware, quantity-aware matching and a settings page to
tune the rules.

Reference studied: [Shpigford/knockoff](https://github.com/Shpigford/knockoff)
— reused its tile selectors, `h2`-text title extraction, dim treatment, and
debounced `MutationObserver` scan. Everything else (query reading + matching
engine) is new.

## Behaviour

Grey a result **iff its title does not satisfy the query**. Satisfaction =
**every** query term is present in the title (AND), per the rules below.

### Query parsing

- Read from `?k=` URL param (authoritative — it produced the results shown),
  falling back to `#twotabsearchtextbox` value.
- Split into **terms** respecting the query operators below.
- **All** terms are required, including connector words (unless the "ignore
  connector words" toggle is on).

### Query operators (Amazon ignores them; we parse them)

These let the user pin restrictions in the search box that Amazon will strip or
ignore, so Amazon returns a superset and we filter precisely.

| Operator | Meaning | Example |
|---|---|---|
| `"phrase"` | exact phrase for *part* of the query (case-insensitive, consecutive, in order); no flex inside | `ssd "SATA III"` requires the literal phrase "SATA III" |
| `[a b c]` | **order group**: bracketed terms must appear in that left-to-right order (gaps allowed), each still matched flexibly | `[1TB SSD]` needs 1TB before SSD |
| `~<num>[unit]` | **±N% tolerance** on a quantity (no space after `~`); N = "tolerance %" setting (default 10) | `~0.5TB` matches `480GB`…`550GB` |

Operators compose: groups may contain phrases/words/tolerance terms; `~` may
appear inside `[...]`. Reserved chars `" [ ] ~` are treated as operators, not
literal title text.

### Matching rules

Base rule = **case-insensitive, whole-word, all-words-required**.

| Term | Rule |
|---|---|
| Unquoted word | whole-word, case-insensitive, **spacing flex** (`1TB`=`1 TB`), **hyphen flex** (`USB-C`=`USB C`), **quantity equivalence** (below) |
| Quoted term | **exact** literal (case-insensitive only); no spacing/hyphen/quantity flex; multi-word ⇒ consecutive phrase |

### Quantity equivalence (unquoted terms only)

A query word that is a number (optionally + a known unit) is compared to the
title **by value**, not text:

- **Numeric equality** — `1`=`1.0`=`1.00`; `1.5`=`1.50`.
- **Data sizes** (binary **and** decimal) — `1TB`=`1000GB`=`1024GB`;
  `1GB`=`1000MB`=`1024MB`. Each quantity expands to `{decimal ×1000ⁿ, binary
  ×1024ⁿ}`; two match if those sets intersect (float epsilon). Bytes and bits
  are distinct families.
- **Measures** (decimal SI) — `1GHz`=`1000MHz`, `1Ah`=`1000mAh`, `1m`=`100cm`,
  `1kg`=`1000g`, etc.
- **Base unit must agree**: `1GB`↔`1000MB` (both bytes) but not bare `1000M`;
  `1G`↔`1000M` but not `1GB`.
- Prefix case respected only where it disambiguates (`mW` milli vs `MW` mega;
  `Mb` megabit vs `MB` megabyte); otherwise case-insensitive.
- Unknown units → treated as plain text (still spacing/hyphen matched).

Unit families (v1): bytes `B KB MB GB TB PB` (+`KiB…`), bits `bit Kb Mb Gb Tb`
`bps Kbps Mbps Gbps`, frequency `Hz kHz MHz GHz`, power `mW W kW`, battery
`mAh Ah`, current `mA A`, voltage `mV V kV`, length `mm cm m km`, mass
`mg g kg`, volume `ml cl L`, pixels `MP`, imperial length `in`/`inch`/`"`
(synonyms; no metric cross-convert).

### Settings toggles (options page)

Master **Enabled**, plus (each rendered with in-UI does/doesn't-match examples):

| Toggle | Default | On means |
|---|---|---|
| Whole words only | On | `SSD`✓"2TB SSD", "SSD-Drive"; ✗"SSDs","mSSD" |
| Number/unit spacing flexible | On | `1TB`✓"1TB","1 TB"; ✗"1 T B","11TB" |
| Hyphen/space flexible | On | `USB-C`✓"USB-C","USB C"; ✗"USBC","USB 3 C" |
| Match equal numbers | On | `2`✓"2.0","2.00"; ✗"20","0.2" |
| Match equivalent data sizes | On | `1TB`✓"1000GB","1024 GB"; ✗"512GB", "1Gb"(bit) |
| Match equivalent measures | On | `1GHz`✓"1000MHz"; `1Ah`✓"1000mAh"; ✗"1000MW" |
| Case-sensitive | Off | `iPhone`✓"iPhone 15"; ✗"iphone","IPHONE" |
| Words must appear in order | Off | `red case`✓"Red Phone Case"; ✗"Case for Red phone" |
| Whole query must be one phrase | Off | `gaming mouse`✓"RGB Gaming Mouse"; ✗"Mouse for Gaming" |
| Ignore connector words | Off | `case for iphone`✓"iPhone Case"; ✗"Samsung Case" |
| Tolerance % (for `~`) | 10 | `~1TB` matches 900GB–1.1TB |

Per-query operators (`"" [] ~`) always work regardless of toggles.

## Architecture

```
manifest.v3.json ┐                        ┌ src/matcher.js   pure logic (Node-testable + content-script global)
manifest.v2.json ┘ → build.js → dist/mv3  ├ src/content.js   DOM: tiles, query, scan, dim
                                dist/mv2   ├ src/styles.css   grey-out treatment (prefix nile-)
                                           ├ src/background.js toolbar click → openOptionsPage()
                                           └ options/…        toggles + examples, chrome.storage.sync
```

- `matcher.js` is pure (string in → boolean out); attaches to the shared
  content-script global **and** `module.exports` for Node tests.
- One source tree; `build.js` copies shared files + the chosen manifest (as
  `manifest.json`) into `dist/mv3/` and `dist/mv2/`.
- No persistent background: a 3-line event handler (`(chrome.action ||
  chrome.browserAction).onClicked → chrome.runtime.openOptionsPage()`) works as
  an MV3 service worker and an MV2 event page.
- Settings live in `chrome.storage.sync`; content script re-scans on
  `chrome.storage.onChanged`.

### DOM layer

- Tile selectors (from knockoff): `div[data-component-type="s-search-result"]`
  plus grid variants, anchored on `data-asin`.
- Title from the tile's `h2` `textContent`, stripping `"Sponsored Ad – "`.
- Grey-out: `opacity:0.32; filter:grayscale(0.85)` on the tile's children,
  **restored on hover**. All classes prefixed `nile-`.
- Debounced `MutationObserver` handles Amazon's lazy tile injection.

### Marketplaces

knockoff's full Amazon domain list (`.com .co.uk .de .fr .it .es .ca …`).

## Testing

- **Unit** (`tests/`): Node harness over `matcher.js` covering every rule,
  toggle, and the user's worked examples. Must be green.
- **Adversarial**: workflow fan-out generating spec-derived tricky vectors +
  bug review of matcher/manifests/content.
- **E2E**: headless Chromium loads a real Amazon search HTML fixture with the
  content script + a query; asserts the correct tiles get `.nile-dim`.

## Out of scope (v1)

Hide/label actions (dim only), per-marketplace toggles, sync of allow/block
lists, non-data physical units beyond the families listed.
