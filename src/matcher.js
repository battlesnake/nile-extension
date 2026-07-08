// ─────────────────────────────────────────────────────────────────────────────
// Nile — matching engine (pure logic; no DOM, no chrome APIs).
//
// titleMatches(title, query, options) -> boolean
//   true  => the title satisfies the query (keep it)
//   false => grey it out (title is missing a required term)
//
// Loaded both as a content-script global (window.NileMatcher) and as a Node
// module (module.exports) so the same code is unit-tested and shipped.
//
// Design principle: over-greying (hiding a wanted result) is the harmful
// failure; under-greying (keeping an extra) is safe. Quantity matching errs
// toward keeping. The whole engine is wrapped to fail OPEN (keep) on any error.
//
// See docs/superpowers/specs/2026-07-07-nile-amazon-every-word-filter-design.md
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  "use strict";

  var DEFAULT_OPTS = {
    enabled: true,
    wholeWords: true,          // SSD ≠ SSDs
    spacingFlexible: true,     // 1TB = 1 TB  (literal tokens; quantities always compare by value)
    hyphenFlexible: true,      // USB-C = USB C
    numberEquivalence: true,   // 1 = 1.0 = 1.00
    dataSizeEquivalence: true, // 1TB = 1000GB = 1024GB (binary+decimal)
    measureEquivalence: true,  // 1GHz = 1000MHz, 1Ah = 1000mAh, 1G = 1000M …
    caseSensitive: false,
    requireOrder: false,       // words must appear in query order
    requirePhrase: false,      // whole query must be one consecutive phrase (literal; no equivalence)
    ignoreConnectors: false,   // drop a/an/the/for/with/…
    tolerancePct: 10           // ~N% tolerance for the ~ operator
  };

  var CONNECTORS = {
    a: 1, an: 1, the: 1, for: 1, with: 1, and: 1, or: 1, of: 1,
    to: 1, in: 1, on: 1, by: 1, at: 1, from: 1, plus: 1, "&": 1
  };

  // ── Units ──────────────────────────────────────────────────────────────────
  // Spelled-out forms normalised to symbols; plurals handled by trailing-"s" strip.
  var SPELLED = {
    terabyte: "TB", gigabyte: "GB", megabyte: "MB", kilobyte: "KB", petabyte: "PB",
    terabit: "Tb", gigabit: "Gb", megabit: "Mb", kilobit: "Kb",
    gigahertz: "GHz", megahertz: "MHz", kilohertz: "kHz", hertz: "Hz",
    watt: "W", kilowatt: "kW", milliwatt: "mW", megawatt: "MW",
    watthour: "Wh", kilowatthour: "kWh", milliwatthour: "mWh",
    volt: "V", kilovolt: "kV", millivolt: "mV",
    amp: "A", ampere: "A", milliamp: "mA", milliampere: "mA",
    amphour: "Ah", milliamphour: "mAh",
    gram: "g", kilogram: "kg", milligram: "mg", gramme: "g", kilogramme: "kg",
    meter: "m", metre: "m", centimeter: "cm", centimetre: "cm",
    millimeter: "mm", millimetre: "mm", kilometer: "km", kilometre: "km",
    liter: "L", litre: "L", milliliter: "ml", millilitre: "ml", centiliter: "cl", centilitre: "cl",
    inch: "in", byte: "B", bit: "bit", megapixel: "MP"
  };

  // Base tokens (checked longest-first). Single-letter b/B disambiguated by case
  // in matchUnit (Gb=bit, GB=byte); bare 'b'/'B' fall to bytes.
  var BASES = [
    { t: "bytes", f: "bytes" }, { t: "byte", f: "bytes" },
    { t: "bits", f: "bits" }, { t: "bit", f: "bits" },
    { t: "bps", f: "bitrate" },
    { t: "inch", f: "imperial_len" },
    { t: "hz", f: "freq" }, { t: "ah", f: "battery" }, { t: "wh", f: "energy" },
    { t: "mp", f: "pixels" }, { t: "in", f: "imperial_len" },
    { t: "b", f: "bytes" },
    { t: "w", f: "power" }, { t: "v", f: "voltage" }, { t: "a", f: "current" },
    { t: "m", f: "length" }, { t: "g", f: "mass" }, { t: "l", f: "volume" },
    { t: '"', f: "imperial_len" }
  ].sort(function (a, b) { return b.t.length - a.t.length; });

  var DATA_FAMILIES = { bytes: 1, bits: 1 };
  var MILLI_FAMILIES = {
    power: 1, current: 1, voltage: 1, battery: 1, energy: 1,
    length: 1, mass: 1, volume: 1
  };

  function dataPower(prefix) {
    if (prefix === "") return { n: 0, binaryOnly: false };
    var p = prefix.toLowerCase();
    var bin = { ki: 1, mi: 2, gi: 3, ti: 4, pi: 5 };
    if (bin[p] != null) return { n: bin[p], binaryOnly: true };
    var dec = { k: 1, m: 2, g: 3, t: 4, p: 5 };
    if (dec[p] != null) return { n: dec[p], binaryOnly: false };
    return null;
  }

  function prefixFactor(prefix, family) {
    if (prefix === "") return 1;
    if (prefix === "M") return 1e6;                                   // mega
    if (prefix === "m") return MILLI_FAMILIES[family] ? 1e-3 : 1e6;   // milli|mega
    var p = prefix.toLowerCase();
    switch (p) {
      case "k": return 1e3;
      case "g": return 1e9;
      case "t": return 1e12;
      case "p": return 1e15;
      case "c": return (family === "length" || family === "volume") ? 1e-2 : null;
      case "µ": case "u": return 1e-6;
      case "n": return 1e-9;
      default: return null;
    }
  }

  // A bare magnitude prefix (no base unit): 256G, 1G, 8M, 5k. Uppercase M/G are
  // mega/giga (lowercase m/g stay milli/gram). Returns the power-of-1000 index.
  function bareMagnitudePow(u) {
    if (u.length !== 1) return null;
    switch (u) {
      case "K": case "k": return 1;
      case "M": return 2;
      case "G": return 3;
      case "T": case "t": return 4;
      case "P": case "p": return 5;
      default: return null;
    }
  }

  function matchUnit(cand) {
    var lower = cand.toLowerCase();
    for (var i = 0; i < BASES.length; i++) {
      var base = BASES[i];
      if (lower.length >= base.t.length && lower.slice(-base.t.length) === base.t) {
        var prefix = cand.slice(0, cand.length - base.t.length); // original case
        var fam = base.f;
        if (base.t === "b") {
          // Gb=gigabit, GB=gigabyte; bare/lowercase-prefixed → bytes (storage-dominant).
          fam = (cand.charAt(cand.length - 1) === "b" && /^[KMGTP]$/.test(prefix)) ? "bits" : "bytes";
        }
        if (fam === "bytes" || fam === "bits") {
          var dp = dataPower(prefix);
          if (dp == null) continue;
          if (dp.binaryOnly) return { family: fam, factors: [Math.pow(1024, dp.n)] };
          return { family: fam, factors: [Math.pow(1000, dp.n), Math.pow(1024, dp.n)] };
        }
        var f = prefixFactor(prefix, fam);
        if (f == null) continue;
        return { family: fam, factors: [f] };
      }
    }
    return null;
  }

  // unitInfo(raw) -> { family, factors:[..] } | null. Handles spelled forms +
  // trailing-"s" plurals (GBs, Watts, Megabytes).
  function unitInfo(raw) {
    if (!raw) return null;
    var tries = [raw];
    var last = raw.charAt(raw.length - 1);
    if (raw.length > 1 && (last === "s" || last === "S")) tries.push(raw.slice(0, -1));
    for (var i = 0; i < tries.length; i++) {
      var cand = tries[i];
      var spelled = SPELLED[cand.toLowerCase()];
      if (spelled) cand = spelled;
      var r = matchUnit(cand);
      if (r) return r;
    }
    return null;
  }

  function approxEq(a, b) {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function safeRegExp(src, flags) {
    try { return new RegExp(src, flags); } catch (e) { return null; }
  }

  // Parse a numeric token, distinguishing decimal points from thousands
  // separators: "1,000"/"1.000"→1000, "1,024"→1024, "0.256"→0.256, "1.5"→1.5,
  // "1.234,56"→1234.56, "1.000.000"→1000000.
  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).trim();
    var hasDot = s.indexOf(".") >= 0, hasComma = s.indexOf(",") >= 0;
    if (hasDot && hasComma) {
      var dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
      var thou = dec === "." ? "," : ".";
      return parseFloat(s.split(thou).join("").replace(dec, "."));
    }
    var sep = hasDot ? "." : (hasComma ? "," : null);
    if (!sep) return parseFloat(s);
    var parts = s.split(sep);
    if (parts.length > 2) return parseFloat(parts.join(""));           // 1.000.000 → thousands
    // single separator: exactly-3-digit tail with a non-zero 1-3 digit head → thousands
    if (/^[1-9]\d{0,2}$/.test(parts[0]) && /^\d{3}$/.test(parts[1])) return parseFloat(parts[0] + parts[1]);
    return parseFloat(parts[0] + "." + parts[1]);
  }

  // ── Query parsing → term tree ────────────────────────────────────────────────
  // Item = { type:'word', text, tolerance } | { type:'phrase', text }
  //      | { type:'group', items:[...] }
  function parseQuery(q) {
    var i = 0, n = q.length, terms = [];

    function skipWs() { while (i < n && /\s/.test(q[i])) i++; }

    function readPhrase() {
      i++; // opening quote
      var start = i;
      while (i < n && q[i] !== '"') i++;
      var text = q.slice(start, i);
      if (i < n) i++; // closing quote
      return text ? { type: "phrase", text: text } : null;
    }

    function readWord() {
      var start = i;
      while (i < n && !/\s/.test(q[i]) && q[i] !== "]" && q[i] !== "[") {
        // A double-quote ends a word — EXCEPT an inch mark right after a digit (13").
        if (q[i] === '"') { if (i > start && /\d/.test(q[i - 1])) { i++; break; } else break; }
        i++;
      }
      var raw = q.slice(start, i);
      if (!raw) return null;
      var tolerance = false, text = raw;
      if (raw[0] === "~") {                     // ~ is our operator; never a literal
        if (/[\d.]/.test(raw[1] || "")) tolerance = true;
        text = raw.slice(1);
      }
      if (/^\.\d/.test(text)) text = "0" + text; // .5 → 0.5
      return text ? { type: "word", text: text, tolerance: tolerance } : null;
    }

    function readGroup() {
      i++; // opening bracket
      var items = [];
      while (i < n && q[i] !== "]") {
        var it = readItem();
        if (it) items.push(it); else skipWs();
      }
      if (i < n) i++; // closing bracket
      return items.length ? { type: "group", items: items } : null;
    }

    function readItem() {
      skipWs();
      if (i >= n) return null;
      var c = q[i];
      if (c === "[") return readGroup();
      if (c === '"') return readPhrase();
      if (c === "]") { i++; return null; }
      return readWord();
    }

    while (i < n) {
      var it = readItem();
      if (it) terms.push(it);
      if (i < n && q[i] === "]") i++; // stray close
    }
    return dedupe(mergeUnits(terms));
  }

  function isNumericText(t) { return /^\d+(?:[.,]\d+)*$/.test(t); }
  function isUnitText(t) { return unitInfo(t) != null || bareMagnitudePow(t) != null; }

  // Merge a spaced number+unit written as two words ("500 GB" → "500GB", "5 kg").
  // Skips units that are also connector words (in, a) to avoid mangling "10 in 1".
  function mergeUnits(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === "group") { out.push({ type: "group", items: mergeUnits(it.items) }); continue; }
      if (it.type === "word" && isNumericText(it.text) && i + 1 < items.length) {
        var nx = items[i + 1];
        if (nx.type === "word" && !nx.tolerance && isUnitText(nx.text) &&
            !CONNECTORS[nx.text.toLowerCase()]) {
          out.push({ type: "word", text: it.text + nx.text, tolerance: it.tolerance });
          i++; continue;
        }
      }
      out.push(it);
    }
    return out;
  }

  function dedupe(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === "group") it = { type: "group", items: dedupe(it.items) };
      var prev = out[out.length - 1];
      if (prev && it.type === prev.type && it.type !== "group" &&
          it.text === prev.text && it.tolerance === prev.tolerance) continue;
      out.push(it);
    }
    return out;
  }

  function dropConnectors(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === "group") {
        var sub = dropConnectors(it.items);
        if (sub.length) out.push({ type: "group", items: sub });
        continue;
      }
      if (it.type === "word" && !it.tolerance && CONNECTORS[it.text.toLowerCase()]) continue;
      out.push(it);
    }
    return out;
  }

  // ── Regex builders ───────────────────────────────────────────────────────────
  // Unicode-aware word class; the numeric variant also excludes "." so 2 ≠ 2.0.
  function boundaryClass(numeric) { return numeric ? "[\\p{L}\\p{N}.]" : "[\\p{L}\\p{N}]"; }
  var WORDCHAR = /[\p{L}\p{N}]/u;

  // Flexible source for an unquoted word: hyphen→[-\s]+, digit/letter→\s*.
  function buildFlexSource(token, opts) {
    var parts = token.split(/-+/).filter(function (p) { return p.length; });
    var out = [];
    for (var pi = 0; pi < parts.length; pi++) {
      if (pi > 0) out.push(opts.hyphenFlexible ? "[-\\s]+" : "-");
      var subs = parts[pi].split(/(?<=\d)(?=\D)|(?<=\D)(?=\d)/);
      for (var si = 0; si < subs.length; si++) {
        if (si > 0) out.push(opts.spacingFlexible ? "\\s*" : "");
        out.push(escapeRegExp(subs[si]));
      }
    }
    return out.join("");
  }

  // Boundaries applied only where the token's edge char is itself a word char,
  // so punctuation-edged tokens (.NET, C++, $5, (2)) aren't over-constrained.
  function wrap(body, token, opts, numeric) {
    if (!opts.wholeWords) return body;
    var cls = boundaryClass(numeric);
    var lb = WORDCHAR.test(token.charAt(0)) ? "(?<!" + cls + ")" : "";
    var rb = WORDCHAR.test(token.charAt(token.length - 1)) ? "(?!" + cls + ")" : "";
    return lb + body + rb;
  }

  function plainRegex(token, opts) {
    var numeric = isNumericText(token);
    var src = wrap(buildFlexSource(token, opts), token, opts, numeric);
    return safeRegExp(src, opts.caseSensitive ? "gu" : "giu");
  }

  // Exact phrase (quoted): literal, \s+ between words, no flex, always bounded.
  function phraseRegex(text, opts) {
    text = text.trim();
    var words = text.split(/\s+/).map(escapeRegExp);
    var numeric = words.length === 1 && isNumericText(text);
    var cls = boundaryClass(numeric);
    var lb = WORDCHAR.test(text.charAt(0)) ? "(?<!" + cls + ")" : "";
    var rb = WORDCHAR.test(text.charAt(text.length - 1)) ? "(?!" + cls + ")" : "";
    return safeRegExp(lb + words.join("\\s+") + rb, opts.caseSensitive ? "gu" : "giu");
  }

  // ── Quantity handling ────────────────────────────────────────────────────────
  // asQuantity(text, tolerance, opts) -> { family, values, tol } | null
  // families: '__number__' (bare), '__magnitude__' (bare prefix), or a unit family.
  function asQuantity(text, tolerance, opts) {
    var m = /^(\d+(?:[.,]\d+)*)(.*)$/.exec(text);
    if (!m) return null;
    var num = parseNum(m[1]);
    if (!isFinite(num)) return null;
    var unit = m[2];
    var tol = tolerance ? Math.max(0, opts.tolerancePct) / 100 : 0;

    if (unit === "") {
      if (tolerance || opts.numberEquivalence) return { family: "__number__", values: [num], tol: tol };
      return null; // plain literal number
    }
    var mag = bareMagnitudePow(unit);
    if (mag != null && (opts.measureEquivalence || tolerance)) {
      var mv = tolerance ? [num * Math.pow(1000, mag)]
        : [num * Math.pow(1000, mag), num * Math.pow(1024, mag)];
      return { family: "__magnitude__", values: mv, tol: tol };
    }
    var info = unitInfo(unit);
    if (!info) return null; // unknown unit → treat token as a plain word
    var toggleOn = DATA_FAMILIES[info.family] ? opts.dataSizeEquivalence : opts.measureEquivalence;
    if (!toggleOn && !tolerance) return null;
    var values = tolerance ? [num * info.factors[0]] : info.factors.map(function (f) { return num * f; });
    return { family: info.family, values: values, tol: tol };
  }

  function valuesMatch(candidates, q) {
    return candidates.some(function (tv) {
      return q.values.some(function (qv) {
        return q.tol > 0 ? Math.abs(tv - qv) <= Math.abs(qv) * q.tol : approxEq(tv, qv);
      });
    });
  }

  // findQuantity(title, q, opts, from) -> { index, length } | null
  function findQuantity(title, q, opts, from) {
    var re = /(\d+(?:[.,]\d+)*)(\s*)([A-Za-zµ"]+)?/g; // fresh instance: no shared lastIndex
    re.lastIndex = from || 0;
    var m;
    while ((m = re.exec(title))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      var num = parseNum(m[1]);
      if (!isFinite(num)) continue;
      var unitRaw = m[3] || "";
      var span = { index: m.index, length: m[1].length + (m[2] || "").length + unitRaw.length };

      if (q.family === "__number__") {
        if (valuesMatch([num], q)) return { index: m.index, length: m[1].length };
        continue;
      }
      if (q.family === "__magnitude__") {
        var cands;
        if (!unitRaw) cands = [num];
        else {
          var mg = bareMagnitudePow(unitRaw);
          if (mg != null) cands = [num * Math.pow(1000, mg), num * Math.pow(1024, mg)];
          else { var info2 = unitInfo(unitRaw); cands = info2 ? info2.factors.map(function (f) { return num * f; }) : [num]; }
        }
        if (valuesMatch(cands, q)) return span;
        continue;
      }
      if (!unitRaw) continue;                 // query wants a unit; bare title number can't satisfy it
      var info = unitInfo(unitRaw);
      if (!info || info.family !== q.family) continue;
      if (valuesMatch(info.factors.map(function (f) { return num * f; }), q)) return span;
    }
    return null;
  }

  // ── Single-item matching (returns {index,length}|null) ───────────────────────
  function wordMatch(title, item, opts, from) {
    var q = asQuantity(item.text, item.tolerance, opts);
    if (q) return findQuantity(title, q, opts, from);
    var re = plainRegex(item.text, opts);
    if (!re) return { index: from, length: 0 }; // fail-open: treat as present
    re.lastIndex = from;
    var m = re.exec(title);
    return m ? { index: m.index, length: m[0].length } : null;
  }

  function phraseMatchAt(title, text, opts, from) {
    var re = phraseRegex(text, opts);
    if (!re) return { index: from, length: 0 };
    re.lastIndex = from;
    var m = re.exec(title);
    return m ? { index: m.index, length: m[0].length } : null;
  }

  function matchItem(title, item, opts, from) {
    if (item.type === "phrase") return phraseMatchAt(title, item.text, opts, from);
    if (item.type === "group") return matchOrdered(title, item.items, opts, from);
    return wordMatch(title, item, opts, from);
  }

  // Ordered subsequence: each item at/after the previous. Returns span or null.
  function matchOrdered(title, items, opts, from) {
    var cursor = from, first = -1, lastEnd = from;
    for (var k = 0; k < items.length; k++) {
      var r = matchItem(title, items[k], opts, cursor);
      if (!r) return null;
      if (first < 0) first = r.index;
      cursor = r.index + Math.max(1, r.length);
      lastEnd = r.index + r.length;
    }
    return { index: first < 0 ? from : first, length: lastEnd - (first < 0 ? from : first) };
  }

  // ── requirePhrase (literal consecutive mode; no quantity equivalence) ─────────
  function collectWords(items, acc) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].type === "group") collectWords(items[i].items, acc);
      else acc.push(items[i]);
    }
    return acc;
  }

  function phraseModeMatch(title, terms, opts) {
    var words = collectWords(terms, []);
    if (!words.length) return true;
    var srcs = words.map(function (it) {
      if (it.type === "phrase") return it.text.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
      return buildFlexSource(it.text, opts);
    });
    var body = srcs.join("\\s+");
    var lb = WORDCHAR.test((words[0].text || "").charAt(0)) && opts.wholeWords ? "(?<![\\p{L}\\p{N}])" : "";
    var re = safeRegExp(lb + body, opts.caseSensitive ? "u" : "iu");
    return re ? re.test(title) : true;
  }

  // ── Public entry point ───────────────────────────────────────────────────────
  function normalizeOpts(options) {
    var o = {};
    for (var k in DEFAULT_OPTS) o[k] = DEFAULT_OPTS[k];
    if (options) for (var j in options) if (options[j] !== undefined && options[j] !== null) o[j] = options[j];
    return o;
  }

  function run(title, query, opts) {
    var terms = parseQuery(query);
    if (opts.ignoreConnectors) terms = dropConnectors(terms);
    if (!terms.length) return true;
    if (opts.requirePhrase) return phraseModeMatch(title, terms, opts);
    if (opts.requireOrder) return matchOrdered(title, terms, opts, 0) != null;
    for (var i = 0; i < terms.length; i++) {
      if (!matchItem(title, terms[i], opts, 0)) return false;
    }
    return true;
  }

  function titleMatches(title, query, options) {
    var opts = normalizeOpts(options);
    if (!opts.enabled) return true;
    if (title == null) title = "";
    if (query == null) query = "";
    try { return run(title, query, opts); }
    catch (e) { return true; } // fail open: never grey due to an engine error
  }

  var api = {
    titleMatches: titleMatches,
    parseQuery: parseQuery,
    unitInfo: unitInfo,
    asQuantity: asQuantity,
    parseNum: parseNum,
    DEFAULT_OPTS: DEFAULT_OPTS,
    _internals: { buildFlexSource: buildFlexSource, plainRegex: plainRegex, findQuantity: findQuantity }
  };

  global.NileMatcher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
