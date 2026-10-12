import type { ElectrobunConfig } from "./.hutch/devkit/api/config/ElectrobunConfig";

const nativeSmoke = process.env.RAYPX_NATIVE_SMOKE === "1";

export default {
  app: {
    name: nativeSmoke ? "Raypx Native Smoke" : "Raypx",
    identifier: nativeSmoke ? "com.raypx.desktop.native-smoke" : "com.raypx.desktop",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: nativeSmoke ? "native/smoke.ts" : "native/main.ts" },
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
      "native/close.html": "views/close/index.html",
      "native/icons/icon.png": "views/assets/tray-icon.png",
    },
  },
  runtime: { exitOnLastWindowClosed: false },
  release: { generatePatch: false },
} satisfies ElectrobunConfig;
