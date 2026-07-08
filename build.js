#!/usr/bin/env node
// Assembles loadable extensions from the single source tree:
//   dist/mv3/  (Chrome, Edge, Firefox 109+)   ← manifest.v3.json
//   dist/mv2/  (Firefox, older Chromium)       ← manifest.v2.json
// Shared code (src/, options/, icons/) is copied verbatim into each; the chosen
// manifest is written as manifest.json. No dependencies.
//
//   node build.js         # build both
//   node build.js --zip   # also produce dist/nile-mv3.zip / nile-mv2.zip (needs `zip`)

"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var ROOT = __dirname;
var DIST = path.join(ROOT, "dist");
var SHARED = ["src", "options", "icons"];
var TARGETS = [
  { dir: "mv3", manifest: "manifest.v3.json" },
  { dir: "mv2", manifest: "manifest.v2.json" }
];

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach(function (ent) {
    var s = path.join(src, ent.name), d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}

function build() {
  rmrf(DIST);
  TARGETS.forEach(function (t) {
    var out = path.join(DIST, t.dir);
    fs.mkdirSync(out, { recursive: true });
    SHARED.forEach(function (dir) { copyDir(path.join(ROOT, dir), path.join(out, dir)); });
    var manifest = fs.readFileSync(path.join(ROOT, t.manifest), "utf8");
    JSON.parse(manifest); // fail loudly on malformed manifest
    fs.writeFileSync(path.join(out, "manifest.json"), manifest);
    console.log("built dist/" + t.dir + "  (" + t.manifest + ")");
  });

  if (process.argv.indexOf("--zip") !== -1) {
    TARGETS.forEach(function (t) {
      var out = path.join(DIST, t.dir);
      var zip = path.join(DIST, "nile-" + t.dir + ".zip");
      try {
        cp.execSync("cd " + JSON.stringify(out) + " && zip -qr " + JSON.stringify(zip) + " .");
        console.log("zipped " + path.relative(ROOT, zip));
      } catch (e) { console.warn("zip skipped for " + t.dir + " (" + e.message + ")"); }
    });
  }
}

build();
