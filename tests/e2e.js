#!/usr/bin/env node
// Headless-Chromium end-to-end test.
//
// Serves the Amazon-search fixture at /s?k=1TB+SATA+SSD, injects the real
// matcher.js + content.js + styles.css into the page (content.js is defensive
// about a missing chrome.storage, so it runs with default settings), then
// asserts the correct tiles receive the .nile-dim grey-out class.
//
// Uses puppeteer if installed, otherwise puppeteer-core against a system
// Chrome/Chromium. Exits non-zero on any mismatch; exits 0 with a SKIP notice
// if no browser is available.

"use strict";
var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");

// The sandbox blocks direct writes to /tmp, so steer all temp files (Chrome's
// profile, mkdtemp) into a writable project-local dir.
var TMP = process.env.NILE_E2E_TMP || path.join(ROOT, ".e2e-tmp");
fs.mkdirSync(TMP, { recursive: true });
process.env.TMPDIR = TMP;
var FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "amazon-search.html"), "utf8");
var read = function (p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); };

// Cases: a query and the expected verdict per data-asin (true = kept, false = greyed).
// Tiles not listed for a case are not asserted.
var CASES = [
  { query: "1TB SATA SSD", expect: {
    B0EVO1TB01: true,
    B0MX500TB2: true,
    B0SEAG1000: true,   // 1000GB == 1TB (data-size equivalence)
    B0SAND512G: false,  // missing 1TB
    B0WDBLUUSB: false,  // missing SATA
    B0DESTEK01: false   // VR glasses: no SSD words in title or brand
  } },
  // Brand sits in its own heading above the title and is NOT repeated in it.
  { query: "DESTEK V5", expect: {
    B0DESTEK01: true,   // brand DESTEK + title V5
    B0NOBRAND1: false,  // no brand row, no DESTEK/V5 in title
    B0ACCESSRY: true,   // "DESTEK V5" in the title (plain terms match brand or title)
    B0EVO1TB01: false
  } },
  { query: "@DESTEK V5", expect: {
    B0DESTEK01: true,
    B0ACCESSRY: false,  // DESTEK only in the title, brand is Orbit Parts
    B0NOBRAND1: false
  } },
  { query: '@"Orbit Parts" remote', expect: {
    B0ACCESSRY: true,
    B0DESTEK01: false
  } }
];

function loadBrowserModule() {
  try { return { mod: require("puppeteer"), core: false }; } catch (e) {}
  try { return { mod: require("puppeteer-core"), core: true }; } catch (e) {}
  return null;
}

function findChrome() {
  var envp = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  var cands = [envp,
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/snap/bin/chromium"].filter(Boolean);
  for (var i = 0; i < cands.length; i++) if (fs.existsSync(cands[i])) return cands[i];
  return null;
}

function serve() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(FIXTURE); // any path returns the fixture; the ?k= drives the query
    });
    server.listen(0, "127.0.0.1", function () { resolve(server); });
  });
}

(async function () {
  var picked = loadBrowserModule();
  if (!picked) { console.log("E2E SKIP: puppeteer not installed (npm i -D puppeteer)."); process.exit(0); }
  var puppeteer = picked.mod;

  var launchOpts = {
    headless: "new",
    userDataDir: path.join(TMP, "profile"),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  };
  if (picked.core) {
    var exe = findChrome();
    if (!exe) { console.log("E2E SKIP: puppeteer-core present but no Chrome/Chromium found."); process.exit(0); }
    launchOpts.executablePath = exe;
  }

  var server = await serve();
  var port = server.address().port;

  var browser = await puppeteer.launch(launchOpts);
  var failed = false;
  try {
    console.log("\nHeadless E2E (real Chromium, real DOM):");
    for (var c = 0; c < CASES.length; c++) {
      var kase = CASES[c];
      var url = "http://127.0.0.1:" + port + "/s?k=" + encodeURIComponent(kase.query);
      var page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: read("src/styles.css") });
      await page.addScriptTag({ content: read("src/matcher.js") });
      await page.addScriptTag({ content: read("src/content.js") });
      await new Promise(function (r) { setTimeout(r, 400); }); // let scan + observer settle

      var results = await page.evaluate(function () {
        var out = {};
        document.querySelectorAll("[data-asin]").forEach(function (t) {
          out[t.getAttribute("data-asin")] = t.classList.contains("nile-dim");
        });
        return out;
      });
      await page.close();

      console.log("  query " + JSON.stringify(kase.query));
      Object.keys(kase.expect).forEach(function (asin) {
        var greyed = !!results[asin];
        var expectGrey = !kase.expect[asin];
        var ok = greyed === expectGrey;
        if (!ok) failed = true;
        console.log("    " + (ok ? "✓" : "✗") + " " + asin + " → " +
          (greyed ? "GREY" : "KEEP") + " (expected " + (expectGrey ? "GREY" : "KEEP") + ")");
      });
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failed) { console.log("\nE2E FAILED"); process.exit(1); }
  console.log("\nE2E passed ✓");
})().catch(function (e) { console.error("E2E error:", e); process.exit(1); });
