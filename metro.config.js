const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Replace `ws` with a React Native shim — RN has WebSocket built-in globally,
// so we never need the Node.js `ws` package or any of its Node-only dependencies.
config.resolver.extraNodeModules = {
  ws: path.resolve(__dirname, "src/lib/ws-native.js"),
};

module.exports = config;
