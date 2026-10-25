// Nile options page. Builds the toggle list (each with its own example),
// persists to chrome.storage.sync, and runs a live rule-tester off the same
// matcher the content script uses.
(function () {
  "use strict";

  var M = window.NileMatcher;
  var DEFAULTS = M.DEFAULT_OPTS;

  // Order + copy for each rule. The example is exactly what renders under the
  // switch, so behaviour and documentation can never drift apart.
  var TOGGLES = [
    { key: "wholeWords", label: "Whole words only",
      ex: '<code>SSD</code> matches “2TB SSD”, “SSD-Drive” — not “SSDs”, “mSSD”.' },
    { key: "spacingFlexible", label: "Number / unit spacing flexible",
      ex: '<code>1TB</code> matches “1TB”, “1 TB” — not “1 T B”.' },
    { key: "hyphenFlexible", label: "Hyphen / space flexible",
      ex: '<code>USB-C</code> matches “USB-C”, “USB C” — not “USBC”.' },
    { key: "numberEquivalence", label: "Match equal numbers",
      ex: '<code>2</code> matches “2.0”, “2.00” — not “20”, “0.2”.' },
    { key: "dataSizeEquivalence", label: "Match equivalent data sizes",
      ex: '<code>1TB</code> matches “1000GB”, “1024 GB” (binary + decimal) — not “512GB”.' },
    { key: "measureEquivalence", label: "Match equivalent measures",
      ex: '<code>1GHz</code> matches “1000MHz”; <code>1Ah</code> matches “1000mAh”; <code>1m</code> matches “100cm”.' },
    { key: "caseSensitive", label: "Case-sensitive",
      ex: '<code>iPhone</code> matches “iPhone 15” — not “iphone”, “IPHONE”.' },
    { key: "requireOrder", label: "Words must appear in order",
      ex: '<code>red case</code> matches “Red Phone Case” — not “Case for Red phone”.' },
    { key: "requirePhrase", label: "Whole query must be one phrase",
      ex: '<code>gaming mouse</code> matches “RGB Gaming Mouse” — not “Mouse for Gaming”.' },
    { key: "ignoreConnectors", label: "Ignore connector words",
      ex: '<code>case for iphone</code> — the “for” isn’t required (matches “iPhone Case”).' },
    { key: "includeBrand", label: "Also match the brand",
      ex: '<code>DESTEK V5</code> matches brand “DESTEK” + title “V5 VR Glasses…”. Off: only the title counts (<code>@brand</code> still works).' }
  ];

  var settings = Object.assign({}, DEFAULTS);

  function $(id) { return document.getElementById(id); }

  function save(patch) {
    Object.assign(settings, patch);
    try { chrome.storage.sync.set(patch); } catch (e) { /* ignore */ }
    renderVerdict();
  }

  // ── Build toggle rows ──────────────────────────────────────────────────────
  function buildToggles() {
    var host = $("toggles");
    TOGGLES.forEach(function (t) {
      var row = document.createElement("div");
      row.className = "row";

      var main = document.createElement("div");
      main.className = "row-main";
      var label = document.createElement("span");
      label.className = "row-label";
      label.textContent = t.label;
      var ex = document.createElement("span");
      ex.className = "row-ex";
      ex.innerHTML = t.ex; // static, authored strings only
      main.appendChild(label);
      main.appendChild(ex);

      var ctl = document.createElement("label");
      ctl.className = "row-ctl row-switch";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.id = "opt-" + t.key;
      var track = document.createElement("span");
      track.className = "track";
      var thumb = document.createElement("span");
      thumb.className = "thumb";
      track.appendChild(thumb);
      ctl.appendChild(input);
      ctl.appendChild(track);

      input.addEventListener("change", function () {
        var patch = {}; patch[t.key] = input.checked; save(patch);
      });

      row.appendChild(main);
      row.appendChild(ctl);
      host.appendChild(row);
    });
  }

  // ── Live tester ────────────────────────────────────────────────────────────
  function renderVerdict() {
    var q = $("t-query").value;
    var title = $("t-title").value;
    var brand = $("t-brand").value;
    var el = $("t-verdict");
    if (!q.trim() || !title.trim()) {
      el.className = "verdict verdict-idle";
      el.textContent = "Enter a query and a title.";
      return;
    }
    var keep = M.titleMatches(title, q, settings, brand);
    el.className = "verdict " + (keep ? "verdict-keep" : "verdict-grey");
    el.textContent = keep
      ? "Kept — the title (or brand) contains every query term."
      : "Greyed out — the title (or brand) is missing a query term.";
  }

  // ── Load + reflect ─────────────────────────────────────────────────────────
  function reflect() {
    $("opt-enabled").checked = !!settings.enabled;
    TOGGLES.forEach(function (t) {
      var el = $("opt-" + t.key);
      if (el) el.checked = !!settings[t.key];
    });
    $("opt-tolerancePct").value = settings.tolerancePct;
    renderVerdict();
  }

  function load() {
    try {
      chrome.storage.sync.get(DEFAULTS, function (stored) {
        settings = Object.assign({}, DEFAULTS, stored || {});
        reflect();
      });
    } catch (e) { reflect(); }
  }

  function init() {
    buildToggles();

    $("opt-enabled").addEventListener("change", function () {
      save({ enabled: $("opt-enabled").checked });
    });
    $("opt-tolerancePct").addEventListener("change", function () {
      var v = parseFloat($("opt-tolerancePct").value);
      if (!isFinite(v) || v < 0) v = 0;
      if (v > 100) v = 100;
      $("opt-tolerancePct").value = v;
      save({ tolerancePct: v });
    });
    $("t-query").addEventListener("input", renderVerdict);
    $("t-title").addEventListener("input", renderVerdict);
    $("t-brand").addEventListener("input", renderVerdict);

    // Reflect live changes made elsewhere (e.g. another options tab).
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "sync") return;
        for (var k in changes) settings[k] = changes[k].newValue;
        reflect();
      });
    } catch (e) { /* ignore */ }

    try { $("ver").textContent = "v" + chrome.runtime.getManifest().version; } catch (e) {}

    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
