// ─────────────────────────────────────────────────────────────────────────────
// Nile content script — the DOM layer.
//
// On Amazon search pages: read the query, find product tiles, ask NileMatcher
// whether each title (or brand) contains every query word, and grey out the
// ones that don't. Logic lives in matcher.js (loaded first); this file only touches the
// page. Tile selectors + title extraction adapted from Shpigford/knockoff.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  var M = (typeof NileMatcher !== "undefined") ? NileMatcher : self.NileMatcher;
  if (!M) return; // matcher failed to load; do nothing rather than throw

  var settings = Object.assign({}, M.DEFAULT_OPTS);

  // Product tiles across Amazon layouts; data-asin has anchored these since ~2019.
  var TILE_SELECTORS = [
    'div[data-component-type="s-search-result"]',
    'div.octopus-pc-item[data-asin]',
    'li[class*="ProductGridItem"][data-asin]'
  ].join(",");

  // ── Query ────────────────────────────────────────────────────────────────
  // The ?k= param is authoritative — it produced the results on screen. Fall
  // back to the search box (#twotabsearchtextbox) if k is absent.
  function currentQuery() {
    var k = "";
    try { k = new URLSearchParams(location.search).get("k") || ""; } catch (e) { k = ""; }
    if (!k.trim()) {
      var box = document.getElementById("twotabsearchtextbox");
      if (box && box.value) k = box.value;
    }
    return k.trim();
  }

  // ── Title and brand ──────────────────────────────────────────────────────
  // Some layouts (e.g. amazon.de) put the brand in its own <h2 class="a-size-mini">
  // above the title link, so "the first h2" is not necessarily the title: the
  // title is the h2 inside the product link.
  function titleHeading(tile) {
    return tile.querySelector('[data-cy="title-recipe"] a h2.a-text-normal') ||
      tile.querySelector('[data-cy="title-recipe"] a h2') ||
      tile.querySelector("a h2") ||
      tile.querySelector("h2.a-text-normal") ||
      tile.querySelector("h2");
  }

  function tileTitle(tile) {
    var h2 = titleHeading(tile);
    var text = h2
      ? (h2.textContent || h2.getAttribute("aria-label") || "")
      : ((tile.querySelector("a.a-text-normal") || {}).textContent || "");
    return text.replace(/^Sponsored Ad [–-]\s*/i, "").trim();
  }

  // The separate brand heading, when the layout has one; "" otherwise.
  function tileBrand(tile) {
    var title = titleHeading(tile);
    // Scoped to the title block: a badge heading elsewhere in the tile
    // ("ClimatePartner Verified") must never be mistaken for the brand.
    var h = tile.querySelector('[data-cy="title-recipe"] h2.a-size-mini');
    if (!h || h === title) return "";
    return (h.textContent || "").trim();
  }

  // ── Scan ───────────────────────────────────────────────────────────────────
  var lastQuery = null;

  function processTile(tile, query) {
    var title = tileTitle(tile);
    if (!title) return;
    // Re-evaluate if the query changed (filter refinements rewrite ?k=).
    if (tile.getAttribute("data-nile-q") === query) return;
    tile.setAttribute("data-nile-q", query);

    var keep = M.titleMatches(title, query, settings, tileBrand(tile));
    tile.classList.toggle("nile-dim", !keep);
  }

  function clearAll() {
    document.querySelectorAll(".nile-dim").forEach(function (t) {
      t.classList.remove("nile-dim");
    });
    document.querySelectorAll("[data-nile-q]").forEach(function (t) {
      t.removeAttribute("data-nile-q");
    });
  }

  function scan() {
    var query = settings.enabled ? currentQuery() : "";
    if (!settings.enabled || !query) { clearAll(); lastQuery = query; return; }
    if (query !== lastQuery) { clearAll(); lastQuery = query; }
    document.querySelectorAll(TILE_SELECTORS).forEach(function (tile) {
      processTile(tile, query);
    });
  }

  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = null; scan(); }, 150);
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  function loadSettings() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.get(M.DEFAULT_OPTS, function (stored) {
          settings = Object.assign({}, M.DEFAULT_OPTS, stored || {});
          resolve();
        });
      } catch (e) { resolve(); }
    });
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") return;
      loadSettings().then(function () { clearAll(); lastQuery = null; scan(); });
    });
  } catch (e) { /* storage unavailable */ }

  loadSettings().then(function () {
    scan();
    var target = document.body || document.documentElement;
    if (target) {
      new MutationObserver(scheduleScan).observe(target, { childList: true, subtree: true });
    }
  });
})();
