#!/usr/bin/env node
// Best-effort LIVE check against real Amazon (manual tool; NOT part of `npm test`
// because it needs network and can hit anti-bot). Injects the real matcher +
// content script into the live search DOM and reports how many tiles were
// greyed, with sample verdicts. Prints a clear diagnosis if blocked.
//
//   node tests/live-check.js "1TB SATA SSD"
//   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node tests/live-check.js "usb-c cable"
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var TMP = process.env.NILE_E2E_TMP || path.join(ROOT, ".e2e-tmp");
fs.mkdirSync(TMP, { recursive: true }); process.env.TMPDIR = TMP;

var puppeteer;
try { puppeteer = require("puppeteer"); }
catch (e) { try { puppeteer = require("puppeteer-core"); } catch (e2) {
  console.log("live-check needs puppeteer: npm i -D puppeteer"); process.exit(0); } }

var read = function (p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); };
var QUERY = process.argv[2] || "1TB SATA SSD";
var TLD = process.argv[3] || "com";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

(async function () {
  var opts = {
    headless: "new", userDataDir: path.join(TMP, "live-profile"),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=en-US,en"]
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  var browser = await puppeteer.launch(opts);
  try {
    var page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1400, height: 1000 });
    await page.evaluateOnNewDocument(function () {
      Object.defineProperty(navigator, "webdriver", { get: function () { return undefined; } });
      Object.defineProperty(navigator, "languages", { get: function () { return ["en-US", "en"]; } });
    });
    var url = "https://www.amazon." + TLD + "/s?k=" + encodeURIComponent(QUERY);
    var resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    console.log("HTTP", resp && resp.status(), "→", url);

    if (!(await page.$('div[data-component-type="s-search-result"]'))) {
      console.log("NO RESULT TILES — likely anti-bot/interstitial. Page title:",
        JSON.stringify(await page.title()));
      process.exit(2);
    }

    await page.addStyleTag({ content: read("src/styles.css") });
    await page.addScriptTag({ content: read("src/matcher.js") });
    await page.addScriptTag({ content: read("src/content.js") });
    await new Promise(function (r) { setTimeout(r, 800); });

    var data = await page.evaluate(function () {
      var out = [];
      document.querySelectorAll('div[data-component-type="s-search-result"]').forEach(function (t) {
        var h2 = t.querySelector("a h2") || t.querySelector("h2");
        var title = (h2 ? (h2.textContent || h2.getAttribute("aria-label") || "") : "")
          .replace(/^Sponsored Ad [–-]\s*/i, "").trim();
        var bh = t.querySelector("h2.a-size-mini");
        var brand = bh && bh !== h2 ? (bh.textContent || "").trim() : "";
        if (title) out.push({ greyed: t.classList.contains("nile-dim"), title: title, brand: brand });
      });
      return out;
    });
    var greyed = data.filter(function (d) { return d.greyed; }).length;
    console.log("\nLIVE query: " + JSON.stringify(QUERY));
    console.log("tiles: " + data.length + " · greyed: " + greyed + " · kept: " + (data.length - greyed) + "\n");
    data.forEach(function (d) {
      console.log("  [" + (d.greyed ? "GREY" : "KEEP") + "] " + (d.brand ? "{" + d.brand + "} " : "") + d.title.slice(0, 92));
    });
  } finally { await browser.close(); }
})().catch(function (e) { console.error("LIVE error:", e.message); process.exit(1); });
