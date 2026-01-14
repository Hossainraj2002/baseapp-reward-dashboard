import path from "path";

const config = {
  webpack: (webpackConfig: any) => {
    webpackConfig.externals = webpackConfig.externals || [];
    webpackConfig.externals.push("pino-pretty", "lokijs", "encoding");

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
