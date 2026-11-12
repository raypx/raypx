import { describe, expect, it } from "vite-plus/test";
import { readStaticCatalog } from "./catalogs.js";

describe("static catalogs", () => {
  it("reads nested default exports, as const and satisfies without executing modules", () => {
    expect(
      readStaticCatalog(
        "en.ts",
        'throw new Error("must not execute"); export default { auth: { "sign-in": "Sign in", hello: "Hi {name}" } } as const satisfies object;',
      ),
    ).toEqual({ auth: { "sign-in": "Sign in", hello: "Hi {name}" } });
  });

  it("reads JSON catalogs", () => {
    expect(readStaticCatalog("zh.json", JSON.stringify({ hello: "你好" }))).toEqual({
      hello: "你好",
    });
    expect(() => readStaticCatalog("zh.json", JSON.stringify({ list: ["a"] }))).toThrow(
      "zh.json: expected static string objects",
    );
  });

  it.each([
    ['export default { nested: (() => "x")() };', "catalogs must contain static string objects"],
    ['const key = "a"; export default { [key]: "x" };', "dynamic catalog keys are unsupported"],
    ["export default { ...other };", "dynamic catalog keys are unsupported"],
    ['export const value = { a: "x" };', "expected a default static catalog"],
    ['export default "text";', "expected a catalog object"],
    ["export default {", "en.ts:"],
  ])("rejects %s", (source, message) => {
    expect(() => readStaticCatalog("en.ts", source)).toThrow(message);
  });
});
