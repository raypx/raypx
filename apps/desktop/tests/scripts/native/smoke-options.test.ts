import { expect, it } from "vite-plus/test";
import { nativeSmokeOptions } from "../../../scripts/native/smoke-options";

it("defaults native smoke and its restart phases to quiet presentation", () => {
  expect(nativeSmokeOptions([], {})).toEqual({ phase: "shell", ui: "quiet" });
  expect(nativeSmokeOptions(["restore"], {})).toEqual({ phase: "restore", ui: "quiet" });
  expect(nativeSmokeOptions([], { RAYPX_NATIVE_SMOKE_PHASE: "beta" })).toEqual({
    phase: "beta",
    ui: "quiet",
  });
});

it("requires an explicit choice for interactive acceptance", () => {
  expect(nativeSmokeOptions(["--interactive"], {})).toEqual({ phase: "shell", ui: "interactive" });
  expect(nativeSmokeOptions(["beta", "--interactive"], {})).toEqual({
    phase: "beta",
    ui: "interactive",
  });
  expect(nativeSmokeOptions(["restore"], { RAYPX_NATIVE_SMOKE_UI: "interactive" }).ui).toBe(
    "interactive",
  );
});

it("rejects invalid phases or modes before opening an application", () => {
  expect(() => nativeSmokeOptions(["--headed"], {})).toThrow("native smoke phase");
  expect(() => nativeSmokeOptions(["shell", "restore"], {})).toThrow("native smoke phase");
  expect(() => nativeSmokeOptions([], { RAYPX_NATIVE_SMOKE_UI: "typo" })).toThrow(
    "quiet or interactive",
  );
});
