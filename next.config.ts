import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The engineering core keeps Node-compatible ESM ".js" specifiers in TypeScript.
  // Next 16 Turbopack does not yet map those explicit specifiers to .ts source files.
  // The supported Webpack mode plus extensionAlias preserves source imports and avoids
  // mass-rewriting the reusable, tested engineering core just for the app bundler.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
      ".jsx": [".tsx", ".jsx"]
    };
    return config;
  }
};

export default nextConfig;
