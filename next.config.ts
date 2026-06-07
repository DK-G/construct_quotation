import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/tools/construct-quotation',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    // Expand Turbopack boundary to parent D:\dev directory
    root: path.join(__dirname, "../../../"),
  },
  // Expand tracing root to parent D:\dev directory
  outputFileTracingRoot: path.join(__dirname, "../../../"),
};

export default nextConfig;

