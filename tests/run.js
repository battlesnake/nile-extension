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

// ── Report ──────────────────────────────────────────────────────────────────
console.log("\nNile matcher tests");
console.log("  passed: " + pass);
console.log("  failed: " + fail);
if (fail) {
  console.log("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nAll green ✓");
