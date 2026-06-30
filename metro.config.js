const { getDefaultConfig } = require("expo/metro-config");
const nodeLibs = require("node-libs-react-native");

const config = getDefaultConfig(__dirname);

// Polyfill all Node.js built-ins that ws (used by Supabase Realtime) requires
config.resolver.extraNodeModules = nodeLibs;

module.exports = config;
