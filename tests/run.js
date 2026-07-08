// Node test harness for src/matcher.js. Run: node tests/run.js
// Each case: [title, query, options, expectMatch]  (expectMatch=true => keep, false => grey)

var M = require("../src/matcher.js");

var pass = 0, fail = 0, failures = [];

function check(title, query, opts, expect, note) {
  var got = M.titleMatches(title, query, opts);
  if (got === expect) { pass++; return; }
  fail++;
  failures.push(
    "  ✗ " + (note ? note + " | " : "") +
    "query=" + JSON.stringify(query) + " title=" + JSON.stringify(title) +
    " opts=" + JSON.stringify(opts || {}) +
    " expected " + (expect ? "KEEP" : "GREY") + " got " + (got ? "KEEP" : "GREY")
  );
}
var keep = function (t, q, o, n) { check(t, q, o, true, n); };
var grey = function (t, q, o, n) { check(t, q, o, false, n); };

// ── The user's worked example (defaults) ────────────────────────────────────
keep("1TB SATA SSD", "1TB SATA SSD", {}, "core");
keep("Samsung 1TB SATA III Internal SSD", "1TB SATA SSD", {}, "core superset");
grey("512GB SATA SSD", "1TB SATA SSD", {}, "core missing 1TB");
grey("1TB USB SSD", "1TB SATA SSD", {}, "core missing SATA");
keep("Crucial 1 TB SATA Solid State Drive SSD", "1TB SATA SSD", {}, "core spacing");

// ── Whole words ─────────────────────────────────────────────────────────────
keep("Samsung 2TB SSD", "SSD", {}, "whole word plain");
keep("Fast SSD-Drive", "SSD", {}, "whole word hyphen edge");
grey("Pack of SSDs here", "SSD", {}, "whole word plural");
grey("mSSD module", "SSD", {}, "whole word prefix-glued");
keep("Pack of SSDs here", "SSD", { wholeWords: false }, "substring on");

// ── Spacing flex ────────────────────────────────────────────────────────────
keep("Disk 1 TB model", "1TB", {}, "spacing on");
keep("Disk 1TB model", "1TB", {}, "spacing glued");
grey("Disk 1 TB model", "1TB", { spacingFlexible: false, dataSizeEquivalence: false }, "spacing off");
keep("Disk 1TB model", "1TB", { spacingFlexible: false }, "spacing off glued still ok");

// ── Hyphen flex ─────────────────────────────────────────────────────────────
keep("Cable USB-C fast", "USB-C", {}, "hyphen literal");
keep("Cable USB C fast", "USB-C", {}, "hyphen as space");
grey("Cable USBC fast", "USB-C", {}, "hyphen no separator");
grey("USB 3 C hub", "USB-C", {}, "hyphen wrong middle");
grey("Cable USB C fast", "USB-C", { hyphenFlexible: false }, "hyphen off needs literal");
keep("Wi Fi Router", "Wi-Fi", {}, "hyphen wifi space");

// ── Number equivalence ──────────────────────────────────────────────────────
keep("Set of 2.0 pieces", "2", {}, "num 2=2.0");
keep("Set of 2.00 pieces", "2", {}, "num 2=2.00");
grey("Set of 20 pieces", "2", {}, "num 2!=20");
grey("Set of 0.2 pieces", "2", {}, "num 2!=0.2");
keep("Disk 1.0TB drive", "1TB", {}, "num in quantity");
grey("Set of 2.0 pieces", "2", { numberEquivalence: false }, "num equiv off");

// ── Data sizes (binary + decimal) ───────────────────────────────────────────
keep("Drive 1000GB capacity", "1TB", {}, "1TB=1000GB decimal");
keep("Drive 1024GB capacity", "1TB", {}, "1TB=1024GB binary");
keep("Drive 1024 GB capacity", "1TB", {}, "1TB=1024 GB spaced");
grey("Drive 512GB capacity", "1TB", {}, "1TB!=512GB");
keep("RAM 1024MB stick", "1GB", {}, "1GB=1024MB");
keep("RAM 1000MB stick", "1GB", {}, "1GB=1000MB");
grey("Drive 1000GB capacity", "1TB", { dataSizeEquivalence: false }, "data equiv off");

// ── Measures ────────────────────────────────────────────────────────────────
keep("CPU 1000MHz turbo", "1GHz", {}, "1GHz=1000MHz");
grey("CPU 1000MW turbo", "1GHz", {}, "GHz!=MW family");
keep("Battery 1000mAh cell", "1Ah", {}, "1Ah=1000mAh");
keep("Cable 100cm long", "1m", {}, "1m=100cm");
keep("Cable 1000mm long", "1m", {}, "1m=1000mm");
keep("Weight 1000g total", "1kg", {}, "1kg=1000g");
keep("Speaker 500 Watts RMS", "500W", {}, "spelled watts");
keep("Screen 1920 x 1080 12MP camera", "12MP", {}, "megapixel");
grey("Cable 100mm long", "1m", {}, "1m!=100mm");

// ── Case sensitivity ────────────────────────────────────────────────────────
keep("New iphone 15 case", "iPhone", {}, "ci default");
keep("New IPHONE 15 case", "iPhone", {}, "ci upper");
keep("New iPhone 15 case", "iPhone", { caseSensitive: true }, "cs exact");
grey("New iphone 15 case", "iPhone", { caseSensitive: true }, "cs lower");
grey("New IPHONE 15 case", "iPhone", { caseSensitive: true }, "cs upper");

// ── Order ───────────────────────────────────────────────────────────────────
keep("Red Phone Case", "red case", { requireOrder: true }, "order ok");
grey("Case for Red phone", "red case", { requireOrder: true }, "order violated");
keep("Case for Red phone", "red case", {}, "order off unordered ok");

// ── Whole-query phrase ──────────────────────────────────────────────────────
keep("RGB Gaming Mouse Pro", "gaming mouse", { requirePhrase: true }, "phrase consecutive");
grey("Mouse for Gaming use", "gaming mouse", { requirePhrase: true }, "phrase split");
grey("Gaming RGB Mouse", "gaming mouse", { requirePhrase: true }, "phrase non-adjacent");

// ── Ignore connectors ───────────────────────────────────────────────────────
keep("Clear iPhone Case", "case for iphone", { ignoreConnectors: true }, "connector dropped");
grey("Clear Samsung Case", "case for iphone", { ignoreConnectors: true }, "still needs iphone");
grey("Clear iPhone Case", "case for iphone", {}, "connector required default");

// ── Operator: quoted phrase (partial) ───────────────────────────────────────
keep('1TB SSD SATA III drive', 'ssd "SATA III"', {}, "quoted phrase present");
grey('1TB SSD SATA 3 drive', 'ssd "SATA III"', {}, "quoted phrase absent");
grey('SSD SATA-III drive', 'ssd "SATA III"', {}, "quoted exact no hyphen flex");
keep('"1TB" exact', '"1TB"', {}, "quoted 1tb literal");
grey('1 TB spaced', '"1TB"', {}, "quoted 1tb no spacing flex");

// ── Operator: order group [ ] ───────────────────────────────────────────────
keep("1TB SATA SSD", "[1TB SSD]", {}, "group order ok");
grey("SSD then 1TB", "[1TB SSD]", {}, "group order violated");
keep("SSD then 1TB", "1TB SSD", {}, "no group unordered ok");

// ── Operator: ~ tolerance ───────────────────────────────────────────────────
keep("Drive 480GB unit", "~0.5TB", {}, "tolerance 480GB in 10pct of 0.5TB");
keep("Drive 500GB unit", "~0.5TB", {}, "tolerance 500GB");
grey("Drive 400GB unit", "~0.5TB", {}, "tolerance 400GB out of range");
keep("Count 95 items", "~100", {}, "tolerance number 95~100");
grey("Count 85 items", "~100", {}, "tolerance number 85 out");
keep("Drive 1.1TB unit", "~1TB", {}, "tolerance 1.1TB upper edge");

// ── Empty / edge ────────────────────────────────────────────────────────────
keep("anything at all", "", {}, "empty query keeps");
keep("anything", "1TB", { enabled: false }, "disabled keeps");
grey("no relevant terms", "1TB SATA", {}, "missing both");

// ── Multi-word AND ordering independence ────────────────────────────────────
keep("SSD SATA 1TB", "1TB SATA SSD", {}, "any order default");

// ═══ Adversarial-hardening regressions ══════════════════════════════════════

// Spelled-out title units (>6 chars) — the {0,6} cap bug
keep("Drive 1000 Megabytes storage", "1GB", {}, "spelled megabytes");
keep("CPU 1000 Megahertz turbo", "1GHz", {}, "spelled megahertz");
keep("Kit 12 Megapixel Camera", "12MP", {}, "spelled megapixel");
keep("Internal 1 Terabyte SSD", "1TB", {}, "spelled terabyte");
keep("Cable 100 centimeter long", "1m", {}, "spelled centimeter");
keep("Motor 1000 milliwatt unit", "1W", {}, "spelled milliwatt");
keep("Dose 1000000 milligrams", "1kg", {}, "spelled milligrams");
keep("Power Bank 3000 mAh cell", "3Ah", {}, "3Ah=3000mAh symbol");

// Plural symbol units
keep("USB Flash Drive 512GBs", "512GB", {}, "plural GBs");
keep("Memory Module 1000MBs", "1GB", {}, "plural MBs");

// Thousands separators
keep("Portable Charger 10,000mAh Power Bank", "10000mAh", {}, "comma thousands mAh");
keep("Internal SSD 1,024GB NVMe", "1TB", {}, "comma thousands 1,024GB");
keep("Count 1,000 units", "1000", {}, "comma thousands bare");
keep("Festplatte 1.000 GB intern", "1TB", {}, "de dot thousands");
grey("Craft Beads Pack of 5,000 Pieces", "5", {}, "5 != 5,000");
keep("SSD 0.256TB drive", "0.256TB", {}, "leading-zero decimal preserved");

// Punctuation-edged tokens (boundary bug)
keep("Learn ASP.NET Core Programming", ".NET", {}, "dotNET");
keep("Widget(2) Pack deal", "(2)", {}, "paren token");
keep("Learn C++17 today", "C++", {}, "cpp plus plus");
keep("Cost US$5 each item", "$5", {}, "dollar token");

// Hyphen collapse + no ReDoS
keep("Cable USB--C fast", "USB-C", {}, "double hyphen collapses");

// spacingFlexible must not disable value equivalence / operators
keep("Enterprise Drive 1000 GB Capacity", "1TB", { spacingFlexible: false }, "equiv ignores spacing toggle");
keep("Drive 950 GB unit", "~1TB", { spacingFlexible: false }, "tolerance ignores spacing toggle");

// Tolerance band (binary must not inflate)
grey("SSD 1.2TB internal", "~1TB", {}, "1.2TB out of 10pct");
keep("SSD 1.05TB internal", "~1TB", {}, "1.05TB in band");

// Bare magnitude equivalence
keep("Signal Booster 1000M range", "1G", {}, "1G=1000M");
keep("Smartphone 256GB Storage", "256G", {}, "256G~256GB");
grey("Omega-3 Fish Oil 5000mg Softgels", "5G", {}, "5G not grams");

// Bits vs bytes distinction
grey("SD Card 1GB Memory", "1Gb", {}, "1Gb(bit) != 1GB(byte)");
grey("Config chip holds 1Mb cache", "1MB", {}, "1MB(byte) != 1Mb(bit)");
keep("SD Card 1GB Memory", "1GB", {}, "1GB byte matches byte");

// Inch operator
grey("Lenovo Legion 13 Gen 8 Gaming Laptop", '13"', {}, "13inch not matched by 13 gen");
keep('Laptop 13" FHD display', '13"', {}, "13inch matches");
keep("Monitor 24 inch curved", '24"', {}, "24inch matches spelled");

// Merge spaced query quantity
keep("Fast 500GB SSD internal", "500 GB", {}, "merge 500 GB");
grey("Fast 256GB SSD internal", "500 GB", {}, "merge 500 GB mismatch");
keep("Multitool 10 in 1 set", "10 in 1", {}, "10 in 1 not mangled");

// Quoted numeric exactness (phraseRegex boundary)
grey("Set of 2.0 pieces", '"2"', {}, "quoted 2 != 2.0");
grey("model 20.5 x unit", '"20"', {}, "quoted 20 != 20.5");

// Duplicate terms
keep("One SSD only", "SSD SSD", { requireOrder: true }, "dup term dedup");

// Order group with spaced quantity
keep("1TB SATA SSD", "[1 TB SATA]", {}, "group merges 1 TB");

// Unicode / degenerate safety (must not throw)
keep("café latte maker", "café", {}, "unicode token matches");
keep("anything here", "   ", {}, "whitespace-only query keeps");

// ── Report ──────────────────────────────────────────────────────────────────
console.log("\nNile matcher tests");
console.log("  passed: " + pass);
console.log("  failed: " + fail);
if (fail) {
  console.log("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nAll green ✓");
