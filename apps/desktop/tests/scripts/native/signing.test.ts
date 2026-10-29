import { expect, it } from "vite-plus/test";
import { signingEnvironment } from "../../../scripts/native/signing";

it("removes signing and update credentials from test-package children", () => {
  const source = {
    PATH: "/bin",
    MYGO_UPDATER_PRIVATE_KEY: "private",
    APPLE_SIGNING_IDENTITY: "identity",
    RAYPX_DESKTOP_SIGNING_THUMBPRINT: "thumb",
    RAYPX_MYGO_UPDATER_URL: "https://updates.test",
    MYGO_WINDOWS_CERTIFICATE_PASSWORD: "password",
  };
  expect(signingEnvironment(source, { smoke: true })).toEqual({ PATH: "/bin" });
  expect(signingEnvironment(source)).toEqual(source);
});
