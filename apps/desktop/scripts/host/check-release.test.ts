import { expect, it } from "vite-plus/test";
import { assertProduction } from "./check-release.ts";
it("accepts a production Tauri host", () => {
  expect(() =>
    assertProduction(Buffer.from("raypx-tauri/2.12.5 production renderer")),
  ).not.toThrow();
});
it.each(["RAYPX_NATIVE_SMOKE_SOCKET", "raypx-smoke-local-event"])(
  "rejects shipped test control %s",
  (marker) => {
    expect(() => assertProduction(Buffer.from("raypx-tauri/2.12.5 " + marker))).toThrow(
      "smoke controls",
    );
  },
);
it("requires the pinned host marker", () => {
  expect(() => assertProduction(Buffer.from("raypx-tauri/2.12.4"))).toThrow("pinned Tauri");
});
