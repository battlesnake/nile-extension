#!/usr/bin/env node
// Rasterise icons/icon.svg → icon16/32/48/128.png. Prefers rsvg-convert, falls
// back to ImageMagick. Run: node scripts/render-icons.js
"use strict";
var cp = require("child_process");
var path = require("path");
var fs = require("fs");

var svg = path.join(__dirname, "..", "icons", "icon.svg");
var sizes = [16, 32, 48, 128];

function has(cmd) {
  try { cp.execSync("command -v " + cmd, { stdio: "ignore" }); return true; }
  catch (e) { return false; }
}

var useRsvg = has("rsvg-convert");
var useMagick = has("convert");
if (!useRsvg && !useMagick) {
  console.error("Need rsvg-convert or ImageMagick to render icons.");
  process.exit(1);
}

sizes.forEach(function (sz) {
  var out = path.join(__dirname, "..", "icons", "icon" + sz + ".png");
  var cmd = useRsvg
    ? "rsvg-convert -w " + sz + " -h " + sz + " " + JSON.stringify(svg) + " -o " + JSON.stringify(out)
    : "convert -background none -density 384 -resize " + sz + "x" + sz + " " + JSON.stringify(svg) + " " + JSON.stringify(out);
  cp.execSync(cmd);
  console.log("wrote icons/icon" + sz + ".png (" + fs.statSync(out).size + " b)");
});
