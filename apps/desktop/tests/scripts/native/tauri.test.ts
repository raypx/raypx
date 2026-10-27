import { expect, it } from "vite-plus/test";
import { tauriSigningEnvironment } from "../../../scripts/native/tauri";

it("omits absent CI secrets instead of passing Some(empty) to Tauri", () => {
  const env = tauriSigningEnvironment(
    {
      APPLE_CERTIFICATE: "",
      APPLE_CERTIFICATE_PASSWORD: "",
      APPLE_SIGNING_IDENTITY: "",
      APPLE_ID: "",
      APPLE_PASSWORD: "",
      APPLE_TEAM_ID: "",
      TAURI_SIGNING_PRIVATE_KEY: "",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
      PATH: "preserved",
    },
    { platform: "darwin" },
  );
  expect(env).toEqual({ PATH: "preserved" });
  expect(Object.hasOwn(env, "APPLE_CERTIFICATE")).toBe(false);
  expect(Object.hasOwn(env, "APPLE_CERTIFICATE_PASSWORD")).toBe(false);
});

it("uses CI's imported certificate once while retaining identity and notarization", () => {
  const source = {
    APPLE_CERTIFICATE: "private-certificate",
    APPLE_CERTIFICATE_PASSWORD: "private-password",
    APPLE_SIGNING_IDENTITY: "Developer ID Application: Raypx",
    RAYPX_DESKTOP_SIGNING_KEYCHAIN: "/tmp/owned-ci.keychain-db",
    APPLE_ID: "release@example.test",
    APPLE_PASSWORD: "private-app-password",
    APPLE_TEAM_ID: "TEAM",
  };
  const env = tauriSigningEnvironment(source, { platform: "darwin" });
  expect(env.APPLE_CERTIFICATE).toBeUndefined();
  expect(env.APPLE_CERTIFICATE_PASSWORD).toBeUndefined();
  expect(env.APPLE_SIGNING_IDENTITY).toBe(source.APPLE_SIGNING_IDENTITY);
  expect(env.APPLE_PASSWORD).toBe(source.APPLE_PASSWORD);
  expect(source.APPLE_CERTIFICATE).toBe("private-certificate");
});

it("preserves explicit empty passwords only when their real key is configured", () => {
  const env = tauriSigningEnvironment(
    {
      APPLE_CERTIFICATE: "certificate",
      APPLE_CERTIFICATE_PASSWORD: "",
      APPLE_SIGNING_IDENTITY: "identity",
      TAURI_SIGNING_PRIVATE_KEY: "updater-key",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
      RAYPX_UPDATER_PUBLIC_KEY: "public",
      RAYPX_UPDATER_ENDPOINT: "https://updates.example.test/latest.json",
    },
    { platform: "darwin" },
  );
  expect(env.APPLE_CERTIFICATE_PASSWORD).toBe("");
  expect(env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD).toBe("");
});

it.each([
  { APPLE_CERTIFICATE: "certificate", APPLE_CERTIFICATE_PASSWORD: "password" },
  { APPLE_ID: "account", APPLE_PASSWORD: "password" },
  { APPLE_API_KEY: "key", APPLE_API_ISSUER: "issuer" },
  { APPLE_CERTIFICATE_PASSWORD: "orphan" },
  { TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "orphan" },
  { TAURI_SIGNING_PRIVATE_KEY: "key" },
])("fails closed for partially configured signing credentials", (env) => {
  expect(() => tauriSigningEnvironment(env, { platform: "darwin" })).toThrow(
    /required|requires|Incomplete/,
  );
});

it("keeps all distribution secrets away from smoke builds without removing provider authentication", () => {
  expect(
    tauriSigningEnvironment(
      {
        APPLE_CERTIFICATE: "private",
        APPLE_CERTIFICATE_PASSWORD: "private",
        APPLE_SIGNING_IDENTITY: "identity",
        APPLE_ID: "account",
        APPLE_PASSWORD: "private",
        APPLE_TEAM_ID: "TEAM",
        WINDOWS_CERTIFICATE: "private",
        WINDOWS_CERTIFICATE_PASSWORD: "private",
        TAURI_SIGNING_PRIVATE_KEY: "private",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "private",
        ANTHROPIC_API_KEY: "provider-key",
        CARGO_TARGET_DIR: "target/native-smoke",
      },
      { smoke: true },
    ),
  ).toEqual({ ANTHROPIC_API_KEY: "provider-key", CARGO_TARGET_DIR: "target/native-smoke" });
});

it("requires the Windows certificate to be imported and passes only its configured thumbprint", () => {
  expect(() =>
    tauriSigningEnvironment({ WINDOWS_CERTIFICATE: "private" }, { platform: "win32" }),
  ).toThrow("Import the Windows signing certificate");
  const env = tauriSigningEnvironment(
    {
      WINDOWS_CERTIFICATE: "private",
      WINDOWS_CERTIFICATE_PASSWORD: "private",
      RAYPX_DESKTOP_SIGNING_THUMBPRINT: "public-thumbprint",
      APPLE_CERTIFICATE: "irrelevant-other-platform",
    },
    { platform: "win32" },
  );
  expect(env).toEqual({ RAYPX_DESKTOP_SIGNING_THUMBPRINT: "public-thumbprint" });
});
