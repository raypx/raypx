import manifest from "./package.json" with { type: "json" };

const smoke = process.env.RAYPX_NATIVE_SMOKE_PACKAGE === "1";
const updateKey = process.env.RAYPX_MYGO_UPDATER_PUBLIC_KEY;
const updateURL = process.env.RAYPX_MYGO_UPDATER_URL;
if (!smoke && Boolean(updateKey) !== Boolean(updateURL))
  throw new Error("Configure the MyGo update public key and URL together");
if (!smoke && updateURL && !updateURL.startsWith("https://"))
  throw new Error("MyGo updates require HTTPS");
export default {
  name: smoke ? "Raypx Test" : "Raypx",
  slug: smoke ? "raypx-test" : "raypx-desktop",
  identifier: smoke ? "com.raypx.desktop.native-smoke" : "com.raypx.desktop",
  version: manifest.version,
  icon: "resources/icon.png",
  main: ".",
  out: smoke ? "build/native-smoke" : "build",
  // DesktopBridge uses the raw runtime; keep the generated SDK outside source.
  bindings: "build/bindings/mygo.ts",
  devUrl: "http://localhost:1420",
  devCommand: "bun --bun vp dev --config vite.app.config.ts",
  // main.go embeds generated/frontend; MyGo copies resources/ by default.
  ...(!smoke && updateKey && updateURL
    ? { updates: { publicKey: updateKey, url: updateURL } }
    : {}),
  windows:
    !smoke && process.env.RAYPX_DESKTOP_SIGNING_THUMBPRINT
      ? {
          signCommand: `"${process.env.RAYPX_WINDOWS_SIGNTOOL ?? "signtool"}" sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /sha1 ${process.env.RAYPX_DESKTOP_SIGNING_THUMBPRINT} %1`,
        }
      : {},
  macos: {
    ...(!smoke && process.env.APPLE_SIGNING_IDENTITY
      ? { signingIdentity: process.env.APPLE_SIGNING_IDENTITY }
      : {}),
    ...(!smoke && process.env.RAYPX_NOTARY_PROFILE
      ? { notarize: { keychainProfile: process.env.RAYPX_NOTARY_PROFILE } }
      : {}),
    minimumSystemVersion: "13.0",
    entitlements: "resources/Entitlements.plist",
    helperEntitlements: { "bin/raypx": "resources/Entitlements.plist" },
  },
};
