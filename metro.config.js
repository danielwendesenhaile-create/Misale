const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Polyfill Node.js built-ins that ws (used by Supabase Realtime) requires
config.resolver.extraNodeModules = {
  stream: require.resolve("stream-browserify"),
};

module.exports = config;
