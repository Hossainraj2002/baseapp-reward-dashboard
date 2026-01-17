import type { NextConfig } from "next";

const nextConfig = {
  turbopack: {},

  webpack: (config: any) => {
    config.externals = config.externals || [];
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
} satisfies NextConfig;

export default nextConfig;
