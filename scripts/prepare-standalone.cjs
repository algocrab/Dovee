"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error("Missing .next/standalone/server.js. Run `next build` with output: 'standalone' first.");
  process.exit(1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(standalone, "public"));
}

const staticDir = path.join(root, ".next", "static");
if (fs.existsSync(staticDir)) {
  copyDir(staticDir, path.join(standalone, ".next", "static"));
}

const scriptsDest = path.join(standalone, "scripts");
fs.mkdirSync(scriptsDest, { recursive: true });
const picker = path.join(root, "scripts", "pick-folder.ps1");
if (fs.existsSync(picker)) {
  fs.copyFileSync(picker, path.join(scriptsDest, "pick-folder.ps1"));
}

if (!fs.existsSync(path.join(standalone, "node_modules", "next", "package.json"))) {
  console.error("Missing .next/standalone/node_modules/next.");
  process.exit(1);
}

let serverSource = fs.readFileSync(serverJs, "utf8");
if (!serverSource.includes("nextConfig.outputFileTracingRoot = dir")) {
  serverSource = serverSource.replace(
    "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)",
    [
      "nextConfig.outputFileTracingRoot = dir",
      "nextConfig.repoRoot = dir",
      "if (nextConfig.turbopack) nextConfig.turbopack.root = dir",
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)",
    ].join("\n"),
  );
  fs.writeFileSync(serverJs, serverSource);
}

  fs.writeFileSync(path.join(standalone, ".dovee-desktop"), "1");

console.log("Standalone runtime files copied.");
