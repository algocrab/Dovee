import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [],
  outputFileTracingIncludes: {
    "/*": ["./scripts/pick-folder.ps1"],
  },
};

export default nextConfig;
