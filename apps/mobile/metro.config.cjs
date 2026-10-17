const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { realpathSync } = require("node:fs");
const { resolve } = require("node:path");
const withTypeScriptSourceResolution = require("./scripts/metro-resolver.cjs");

const config = withTypeScriptSourceResolution(
  getDefaultConfig(__dirname),
  realpathSync(resolve(__dirname, "../..")),
);
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
