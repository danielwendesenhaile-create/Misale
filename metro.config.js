const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Force ALL requires of `ws` or `ws/*` to our React Native shim.
// extraNodeModules alone is not enough when ws is present in node_modules —
// resolveRequest takes priority and intercepts before the normal resolver.
const wsShim = path.resolve(__dirname, "src/lib/ws-native.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "ws" || moduleName.startsWith("ws/")) {
    return { filePath: wsShim, type: "sourceFile" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
