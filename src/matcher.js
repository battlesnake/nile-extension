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
// See docs/superpowers/specs/2026-07-07-nile-amazon-every-word-filter-design.md
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  "use strict";

  var DEFAULT_OPTS = {
    enabled: true,
    wholeWords: true,          // SSD ≠ SSDs
    spacingFlexible: true,     // 1TB = 1 TB
    hyphenFlexible: true,      // USB-C = USB C
    numberEquivalence: true,   // 1 = 1.0 = 1.00
    dataSizeEquivalence: true, // 1TB = 1000GB = 1024GB (binary+decimal)
    measureEquivalence: true,  // 1GHz = 1000MHz, 1Ah = 1000mAh …
    caseSensitive: false,
    requireOrder: false,       // words must appear in query order
    requirePhrase: false,      // whole query must be one consecutive phrase
    ignoreConnectors: false,   // drop a/an/the/for/with/…
    tolerancePct: 10           // ~N% tolerance for the ~ operator
  };

  var CONNECTORS = {
    a: 1, an: 1, the: 1, for: 1, with: 1, and: 1, or: 1, of: 1,
    to: 1, in: 1, on: 1, by: 1, at: 1, from: 1, plus: 1, "&": 1
  };

  // ── Units ──────────────────────────────────────────────────────────────────
  // Spelled-out forms normalised to symbols before parsing. Plurals handled by
  // stripping a trailing "s" on lookup.
  var SPELLED = {
    terabyte: "TB", gigabyte: "GB", megabyte: "MB", kilobyte: "KB", petabyte: "PB",
    terabit: "Tb", gigabit: "Gb", megabit: "Mb", kilobit: "Kb",
    gigahertz: "GHz", megahertz: "MHz", kilohertz: "kHz", hertz: "Hz",
    watt: "W", kilowatt: "kW", milliwatt: "mW", megawatt: "MW",
    watthour: "Wh", kilowatthour: "kWh",
    volt: "V", kilovolt: "kV", millivolt: "mV",
    amp: "A", ampere: "A", milliamp: "mA", milliampere: "mA",
    amphour: "Ah", milliamphour: "mAh",
    gram: "g", kilogram: "kg", milligram: "mg",
    meter: "m", metre: "m", centimeter: "cm", centimetre: "cm",
    millimeter: "mm", millimetre: "mm", kilometer: "km", kilometre: "km",
    liter: "L", litre: "L", milliliter: "ml", millilitre: "ml",
    inch: "in", byte: "B", bit: "bit", megapixel: "MP"
  };

  // Base unit tokens (checked longest-first). Single-letter b/B are conflated to
  // the bytes family (storage-dominant); explicit "bit"/"bps" stay distinct.
  var BASES = [
    { t: "bytes", f: "bytes" }, { t: "byte", f: "bytes" },
    { t: "bits", f: "bits" }, { t: "bit", f: "bits" },
    { t: "bps", f: "bitrate" },
    { t: "inch", f: "imperial_len" },
    { t: "hz", f: "freq" },
    { t: "ah", f: "battery" },
    { t: "wh", f: "energy" },
    { t: "mp", f: "pixels" },
    { t: "in", f: "imperial_len" },
    { t: "b", f: "bytes" },
    { t: "w", f: "power" }, { t: "v", f: "voltage" }, { t: "a", f: "current" },
    { t: "m", f: "length" }, { t: "g", f: "mass" }, { t: "l", f: "volume" },
    { t: '"', f: "imperial_len" }
  ].sort(function (a, b) { return b.t.length - a.t.length; });

  var DATA_FAMILIES = { bytes: 1, bits: 1 };
  // Families where a lowercase "m" prefix means milli (not mega).
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

  // unitInfo(raw) -> { family, factors:[..] } | null
  // factors are canonical-unit multipliers; data units carry a decimal AND a
  // binary factor so 1TB matches both 1000GB and 1024GB.
  function unitInfo(raw) {
    if (!raw) return null;
    var norm = raw;
    var spelled = SPELLED[norm.toLowerCase()] ||
      (norm.toLowerCase().slice(-1) === "s" ? SPELLED[norm.toLowerCase().slice(0, -1)] : null);
    if (spelled) norm = spelled;
    var lower = norm.toLowerCase();
    for (var i = 0; i < BASES.length; i++) {
      var base = BASES[i];
      if (lower.length >= base.t.length && lower.slice(-base.t.length) === base.t) {
        var prefix = norm.slice(0, norm.length - base.t.length);
        if (DATA_FAMILIES[base.f]) {
          var dp = dataPower(prefix);
          if (dp == null) continue;
          if (dp.binaryOnly) return { family: base.f, factors: [Math.pow(1024, dp.n)] };
          return { family: base.f, factors: [Math.pow(1000, dp.n), Math.pow(1024, dp.n)] };
        }
        var f = prefixFactor(prefix, base.f);
        if (f == null) continue;
        return { family: base.f, factors: [f] };
      }
    }
    return null;
  }

  function approxEq(a, b) {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      while (i < n && !/\s/.test(q[i]) && q[i] !== "]" && q[i] !== "[" && q[i] !== '"') i++;
      var raw = q.slice(start, i);
      if (!raw) return null;
      var tolerance = false, text = raw;
      if (raw[0] === "~") {                       // ~ is our operator; never a literal
        if (/\d/.test(raw[1] || "")) tolerance = true;
        text = raw.slice(1);
      }
      if (!text) return null;
      return { type: "word", text: text, tolerance: tolerance };
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
    return terms;
  }

  function dropConnectors(items) {
    return items.filter(function (it) {
      if (it.type === "group") { it.items = dropConnectors(it.items); return it.items.length > 0; }
      if (it.type === "word" && !it.tolerance) {
        return !CONNECTORS[it.text.toLowerCase()];
      }
      return true;
    });
  }

  // ── Regex builders ───────────────────────────────────────────────────────────
  function boundaryWrap(src, opts) {
    return opts.wholeWords ? "(?<![A-Za-z0-9])" + src + "(?![A-Za-z0-9])" : src;
  }

  // Flexible source for an unquoted word: hyphen→[-\s]+, digit/letter→\s*.
  function buildFlexSource(token, opts) {
    var parts = token.split("-");
    var out = [];
    for (var pi = 0; pi < parts.length; pi++) {
      if (pi > 0) out.push(opts.hyphenFlexible ? "[-\\s]+" : "\\-");
      var subs = parts[pi].split(/(?<=\d)(?=\D)|(?<=\D)(?=\d)/);
      for (var si = 0; si < subs.length; si++) {
        if (si > 0) out.push(opts.spacingFlexible ? "\\s*" : "");
        out.push(escapeRegExp(subs[si]));
      }
    }
    return out.join("");
  }

  function plainRegex(token, opts) {
    var body = buildFlexSource(token, opts);
    var src;
    if (!opts.wholeWords) {
      src = body;
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      // Numeric literal (reached only when number-equivalence is off): keep "."
      // and digits out of the boundary so "2" ≠ "2.0" / "20".
      src = "(?<![A-Za-z0-9.])" + body + "(?![A-Za-z0-9.])";
    } else {
      src = boundaryWrap(body, opts);
    }
    return new RegExp(src, opts.caseSensitive ? "g" : "gi");
  }

  // Exact phrase (quoted): literal, \s+ between words, no flex.
  function phraseRegex(text, opts) {
    var words = text.trim().split(/\s+/).map(escapeRegExp);
    var src = boundaryWrap(words.join("\\s+"), opts);
    return new RegExp(src, opts.caseSensitive ? "g" : "gi");
  }

  // ── Quantity handling ────────────────────────────────────────────────────────
  // asQuantity(text, tolerance, opts) -> { family, values:[..], tol } | null
  // family '__number__' is a bare number.
  function asQuantity(text, tolerance, opts) {
    var m = /^(\d+(?:[.,]\d+)?)(.*)$/.exec(text);
    if (!m) return null;
    var num = parseFloat(m[1].replace(",", "."));
    if (!isFinite(num)) return null;
    var unit = m[2];
    var tol = tolerance ? Math.max(0, opts.tolerancePct) / 100 : 0;
    if (unit === "") {
      if (tolerance || opts.numberEquivalence) return { family: "__number__", values: [num], tol: tol };
      return null; // plain literal number
    }
    var info = unitInfo(unit);
    if (!info) return null; // unknown unit → treat token as a plain word
    var toggleOn = DATA_FAMILIES[info.family] ? opts.dataSizeEquivalence : opts.measureEquivalence;
    if (!toggleOn && !tolerance) return null;
    return { family: info.family, values: info.factors.map(function (f) { return num * f; }), tol: tol };
  }

  function valuesMatch(candidates, q) {
    return candidates.some(function (tv) {
      return q.values.some(function (qv) {
        return q.tol > 0 ? Math.abs(tv - qv) <= Math.abs(qv) * q.tol : approxEq(tv, qv);
      });
    });
  }

  var TITLE_QTY_RE = /(\d+(?:[.,]\d+)?)(\s*)([A-Za-zµ"]{0,6})/g;

  // findQuantity(title, q, opts, from) -> { index, length } | null
  function findQuantity(title, q, opts, from) {
    TITLE_QTY_RE.lastIndex = from || 0;
    var m;
    while ((m = TITLE_QTY_RE.exec(title))) {
      var num = parseFloat(m[1].replace(",", "."));
      var gap = m[2] || "", unitRaw = m[3] || "";
      // A bare-number query matches any title number of equal value, regardless
      // of a trailing unit — this only ever broadens a match (keeps a result),
      // never wrongly greys one.
      if (q.family === "__number__") {
        if (valuesMatch([num], q)) return { index: m.index, length: m[1].length };
        continue;
      }
      var unit = (gap.length > 0 && !opts.spacingFlexible) ? "" : unitRaw;
      if (unit === "") continue;              // query has a unit; a bare title number can't satisfy it
      var info = unitInfo(unit);
      if (!info) continue;                    // number glued to a non-unit word (e.g. "3 pack")
      if (info.family !== q.family) continue;
      var cand = info.factors.map(function (f) { return num * f; });
      if (valuesMatch(cand, q)) {
        var len = m[1].length + (opts.spacingFlexible ? gap.length : 0) + unitRaw.length;
        return { index: m.index, length: len };
      }
    }
    return null;
  }

  // ── Single-item matching (returns {index,length}|null) ───────────────────────
  function wordMatch(title, item, opts, from) {
    var q = asQuantity(item.text, item.tolerance, opts);
    if (q) return findQuantity(title, q, opts, from);
    var re = plainRegex(item.text, opts);
    re.lastIndex = from;
    var m = re.exec(title);
    return m ? { index: m.index, length: m[0].length } : null;
  }

  function phraseMatchAt(title, text, opts, from) {
    var re = phraseRegex(text, opts);
    re.lastIndex = from;
    var m = re.exec(title);
    return m ? { index: m.index, length: m[0].length } : null;
  }

  function matchItem(title, item, opts, from) {
    if (item.type === "phrase") return phraseMatchAt(title, item.text, opts, from);
    if (item.type === "group") return matchGroup(title, item.items, opts, from);
    return wordMatch(title, item, opts, from);
  }

  // Ordered subsequence: each item after the previous. Returns span or null.
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

  function matchGroup(title, items, opts, from) {
    return matchOrdered(title, items, opts, from);
  }

  // ── Public entry point ───────────────────────────────────────────────────────
  function normalizeOpts(options) {
    var o = {};
    for (var k in DEFAULT_OPTS) o[k] = DEFAULT_OPTS[k];
    if (options) for (var j in options) if (options[j] !== undefined && options[j] !== null) o[j] = options[j];
    return o;
  }

  function collectWordTexts(items, acc) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === "group") collectWordTexts(it.items, acc);
      else acc.push(it);
    }
    return acc;
  }

  // requirePhrase: whole query as one consecutive phrase (each word flexible).
  function phraseModeMatch(title, terms, opts) {
    var words = collectWordTexts(terms, []);
    if (!words.length) return true;
    var srcs = words.map(function (it) {
      if (it.type === "phrase") return phraseRegex(it.text, { caseSensitive: opts.caseSensitive, wholeWords: false }).source;
      return buildFlexSource(it.text, opts);
    });
    var src = boundaryWrap(srcs.join("\\s+"), opts);
    var re = new RegExp(src, opts.caseSensitive ? "" : "i");
    return re.test(title);
  }

  function titleMatches(title, query, options) {
    var opts = normalizeOpts(options);
    if (!opts.enabled) return true;
    if (title == null) title = "";
    if (query == null) query = "";
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

  var api = {
    titleMatches: titleMatches,
    parseQuery: parseQuery,
    unitInfo: unitInfo,
    asQuantity: asQuantity,
    DEFAULT_OPTS: DEFAULT_OPTS,
    _internals: { buildFlexSource: buildFlexSource, plainRegex: plainRegex, findQuantity: findQuantity }
  };

  global.NileMatcher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
