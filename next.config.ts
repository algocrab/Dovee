import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // node-pty is already in Next's built-in serverExternalPackages list, so the
  // server requires it from node_modules instead of bundling the .node binary.
  outputFileTracingIncludes: {
    "/*": [
      "./scripts/pick-folder.ps1",
      // node-pty resolves its prebuilt N-API binaries at runtime, which file
      // tracing cannot see — copy them explicitly for the standalone build.
      // *.pdb (20 MB of debug symbols) is deliberately left out.
      "./node_modules/node-pty/package.json",
      "./node_modules/node-pty/lib/**/*",
      "./node_modules/node-pty/prebuilds/**/*.node",
      "./node_modules/node-pty/prebuilds/**/*.dll",
      "./node_modules/node-pty/prebuilds/**/*.exe",
    ],
  },
};

export default nextConfig;
