/// <reference types="bun" />

import type { ElectrobunConfig } from "./.hutch/devkit/api/config/ElectrobunConfig";

const nativeSmoke = process.env.RAYPX_NATIVE_SMOKE === "1";

export default {
  app: {
    name: nativeSmoke ? "Raypx Test" : "Raypx",
    identifier: nativeSmoke ? "com.raypx.desktop.native-smoke" : "com.raypx.desktop",
    version: "0.1.0",
  },
  build: {
    // Test bundles are temporary and must not look like another installed release.
    buildFolder: nativeSmoke ? ".smoke-build.noindex" : "build",
    artifactFolder: nativeSmoke ? ".smoke-artifacts.noindex" : "artifacts",
    watchIgnore: [".smoke-build.noindex/**", ".smoke-artifacts.noindex/**"],
    mainProcess: "bun",
    bun: {
      entrypoint: nativeSmoke
        ? process.env.RAYPX_NATIVE_SMOKE_PHASE?.startsWith("beta")
          ? "tests/native/smoke/beta.ts"
          : "tests/native/smoke/scenario.ts"
        : "native/main.ts",
    },
    mac: { icons: "native/icons/icon.iconset" },
    win: {
      icon: "native/icons/icon.ico",
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        "disable-web-security": false,
        "allow-insecure-localhost": false,
      },
    },
    linux: { icon: "native/icons/icon.png" },
    copy: {
      "dist/client": "views/main",
      [`.hutch/bin/${process.platform === "win32" ? "raypx.exe" : "raypx"}`]: `bin/${process.platform === "win32" ? "raypx.exe" : "raypx"}`,
      "native/close.html": "views/close/index.html",
      "native/icons/icon.iconset/icon_16x16.png": "views/assets/tray-icon.png",
      "native/icons/icon.iconset/icon_16x16@2x.png": "views/assets/tray-icon@2x.png",
    },
  },
  runtime: { exitOnLastWindowClosed: false },
  release: { generatePatch: false },
} satisfies ElectrobunConfig;
