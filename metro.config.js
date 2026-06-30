const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const wsShim = path.resolve(__dirname, "src/lib/ws-native.js");

// Intercept:
// 1. Any direct require of `ws` or `ws/*`
// 2. Any require made FROM WITHIN the ws package (so its Node.js built-in
//    deps like http, zlib, stream, crypto never get bundled)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromWs = context.originModulePath &&
    context.originModulePath.includes("/node_modules/ws/");

  if (moduleName === "ws" || moduleName.startsWith("ws/") || fromWs) {
    return { filePath: wsShim, type: "sourceFile" };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
