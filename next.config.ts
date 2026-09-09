import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["openai"],
};

export default nextConfig;
