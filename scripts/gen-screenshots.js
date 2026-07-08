#!/usr/bin/env node
// Generates Chrome Web Store screenshots (1280x800) by loading the packed
// dist/mv3 extension in headless Chromium: a real greyed Amazon results page
// and the options page. Best-effort on live Amazon; skips gracefully if blocked.
//
//   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node scripts/gen-screenshots.js [query]
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var TMP = process.env.NILE_E2E_TMP || path.join(ROOT, ".e2e-tmp");
fs.mkdirSync(TMP, { recursive: true }); process.env.TMPDIR = TMP;
var OUT = path.join(ROOT, "store-assets", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

var puppeteer = require(ROOT + "/node_modules/puppeteer");
var EXT = path.join(ROOT, "dist", "mv3");
var QUERY = process.argv[2] || "1TB SATA III SSD";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
var W = 1280, H = 800;

(async function () {
  var browser = await puppeteer.launch({
    headless: "new",
    userDataDir: path.join(TMP, "shot-profile"),
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--lang=en-US,en", "--disable-extensions-except=" + EXT, "--load-extension=" + EXT]
  });
  var made = [];
  try {
    // extension id
    var sw = await browser.waitForTarget(function (t) {
      return t.type() === "service_worker" && t.url().indexOf("chrome-extension://") === 0;
    }, { timeout: 8000 }).catch(function () { return null; });
    var id = sw ? sw.url().split("/")[2] : null;

    // ── Shot 1: live Amazon with real greying ──
    try {
      var page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.evaluateOnNewDocument(function () {
        Object.defineProperty(navigator, "webdriver", { get: function () { return undefined; } });
      });
      await page.goto("https://www.amazon.com/s?k=" + encodeURIComponent(QUERY),
        { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForSelector(".nile-dim", { timeout: 12000 });
      // Dismiss the "deliver to <country>" popover so it isn't in the shot.
      await page.evaluate(function () {
        Array.prototype.forEach.call(document.querySelectorAll("button,input[type=submit],a,span"), function (el) {
          if (/^\s*Dismiss\s*$/i.test(el.textContent || el.value || "")) el.click();
        });
        ["#a-popover-root", ".a-popover-wrapper", ".a-popover-modal", "[role=dialog]"].forEach(function (s) {
          document.querySelectorAll(s).forEach(function (e) { e.remove(); });
        });
      });
      await page.evaluate(function () {
        var d = document.querySelector(".nile-dim");
        if (d) d.scrollIntoView({ block: "center" });
        window.scrollBy(0, -120);
      });
      await new Promise(function (r) { setTimeout(r, 700); });
      var p1 = path.join(OUT, "1-amazon-greyed.png");
      await page.screenshot({ path: p1 });
      made.push(p1);
    } catch (e) { console.log("live Amazon shot skipped:", e.message); }

    // ── Shot 2: options page ──
    if (id) {
      var opt = await browser.newPage();
      await opt.goto("chrome-extension://" + id + "/options/options.html", { waitUntil: "networkidle0" });
      await opt.evaluate(function () {
        function set(i, v) { var e = document.getElementById(i); if (e) { e.value = v; e.dispatchEvent(new Event("input")); } }
        set("t-query", "1TB SATA SSD");
        set("t-title", "Samsung 1000GB SATA III Internal SSD");
      });
      await new Promise(function (r) { setTimeout(r, 300); });
      var p2 = path.join(OUT, "2-options.png");
      await opt.screenshot({ path: p2 });
      made.push(p2);

      // ── Shot 3: operators + live tester (scrolled into view) ──
      await opt.evaluate(function () {
        function set(i, v) { var e = document.getElementById(i); if (e) { e.value = v; e.dispatchEvent(new Event("input")); } }
        set("t-query", '~1TB "SATA III"');
        set("t-title", "Samsung 960GB SATA III Internal SSD");
        var t = document.querySelector(".tester");
        if (t) t.scrollIntoView({ block: "end" });
      });
      await new Promise(function (r) { setTimeout(r, 400); });
      var p3 = path.join(OUT, "3-operators-tester.png");
      await opt.screenshot({ path: p3 });
      made.push(p3);
    }
  } finally { await browser.close(); }

  console.log("wrote " + made.length + " screenshot(s):");
  made.forEach(function (p) { console.log("  " + path.relative(ROOT, p) + " (" + fs.statSync(p).size + " b)"); });
  if (!made.length) process.exit(1);
})().catch(function (e) { console.error("screenshot error:", e.message); process.exit(1); });
