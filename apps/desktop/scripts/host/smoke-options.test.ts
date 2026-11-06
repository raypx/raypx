import { expect, it } from "vite-plus/test";
import { nativeSmokeOptions } from "./smoke-options.ts";

it("defaults native smoke and its restart phases to quiet presentation", () => {
  expect(nativeSmokeOptions([], {})).toEqual({ phase: "shell", ui: "quiet" });
  expect(nativeSmokeOptions(["restore"], {})).toEqual({ phase: "restore", ui: "quiet" });
  expect(nativeSmokeOptions([], { RAYPX_NATIVE_SMOKE_PHASE: "write" })).toEqual({
    phase: "write",
    ui: "quiet",
  });
});

it("requires an explicit choice for interactive acceptance", () => {
  expect(nativeSmokeOptions(["--interactive"], {})).toEqual({ phase: "shell", ui: "interactive" });
  expect(nativeSmokeOptions(["write", "--interactive"], {})).toEqual({
    phase: "write",
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
