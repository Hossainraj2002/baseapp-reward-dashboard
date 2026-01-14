import path from "path";

const config = {
  // Next.js 16 uses Turbopack by default. Add an empty turbopack config to
  // allow a custom webpack config without build errors.
  turbopack: {},

  webpack: (webpackConfig: any) => {
    // Keep your existing externals
    webpackConfig.externals = webpackConfig.externals || [];
    webpackConfig.externals.push("pino-pretty", "lokijs", "encoding");

    // Fix MetaMask SDK async-storage issue on web
    webpackConfig.resolve = webpackConfig.resolve || {};
    webpackConfig.resolve.alias = {
      ...(webpackConfig.resolve.alias || {}),
      "@react-native-async-storage/async-storage": path.resolve(
        process.cwd(),
        "shims/async-storage.ts"
      ),
    };

    return webpackConfig;
  },
};

export default config;
