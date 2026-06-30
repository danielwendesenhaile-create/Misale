const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const wsShim = path.resolve(__dirname, "src/lib/ws-native.js");

// On native (iOS/Android): replace ws with our RN WebSocket shim so Node.js
// built-ins (http, zlib, stream, crypto) are never bundled.
// On web: browsers have native WebSocket so no shim needed.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== "web") {
    const fromWs = context.originModulePath &&
      context.originModulePath.includes("/node_modules/ws/");

    if (moduleName === "ws" || moduleName.startsWith("ws/") || fromWs) {
      return { filePath: wsShim, type: "sourceFile" };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
