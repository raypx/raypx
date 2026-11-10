import { expect, it } from "vite-plus/test";
import { assertProduction } from "./check-release";

const metadata =
  "\tdep\tgithub.com/egoist/mygo\tv0.8.3\th1:fixture\n\tbuild -tags=mygo_noinspector\n";
it("accepts a production MyGo executable with its inspector excluded", () => {
  expect(() => assertProduction(Buffer.from("production renderer"), metadata)).not.toThrow();
});
it.each(["RAYPX_NATIVE_SMOKE_SOCKET", "raypx-smoke-local-event"])(
  "rejects shipped test control %s",
  (marker) => {
    expect(() => assertProduction(Buffer.from(marker), metadata)).toThrow("smoke controls");
  },
);
it("rejects a smoke build even when its socket strings are stripped", () => {
  expect(() =>
    assertProduction(
      Buffer.from("clean"),
      metadata.replace("mygo_noinspector", "native_smoke,mygo_noinspector"),
    ),
  ).toThrow("smoke controls");
});
it("requires the pinned framework and production inspector policy", () => {
  expect(() =>
    assertProduction(Buffer.from("clean"), metadata.replace("v0.8.3", "v0.7.4")),
  ).toThrow("pinned MyGo");
  expect(() =>
    assertProduction(Buffer.from("clean"), metadata.replace("mygo_noinspector", "")),
  ).toThrow("inspector");
});
