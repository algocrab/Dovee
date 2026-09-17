"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "node_modules", "monaco-editor", "package.json");
const src = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const outDir = path.join(root, "public", "monaco");
const dest = path.join(outDir, "vs");
const marker = path.join(outDir, ".version");

if (!fs.existsSync(pkgPath) || !fs.existsSync(src)) {
  console.error("Missing node_modules/monaco-editor. Run `npm install` first.");
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
const current = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : "";

if (current === version && fs.existsSync(path.join(dest, "loader.js"))) {
  console.log(`Monaco ${version} already synced to public/monaco/vs`);
  process.exit(0);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
fs.writeFileSync(marker, `${version}\n`);

console.log(`Synced Monaco ${version} -> public/monaco/vs`);
