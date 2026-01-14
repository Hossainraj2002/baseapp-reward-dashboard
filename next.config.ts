import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ✅ Prevent ESLint from failing Vercel builds
  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack: (config) => {
    // ✅ Keep your existing externals
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // ✅ Fix MetaMask SDK async-storage issue on web
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": path.resolve(
        process.cwd(),
        "shims/async-storage.ts"
      ),
    };

    return config;
  },
};

export default nextConfig;
