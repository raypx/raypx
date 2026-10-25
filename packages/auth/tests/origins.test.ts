import { expect, it } from "vite-plus/test";
import { normalizeTrustedOrigins } from "../src/origins.js";
it("normalizes explicit origins and ignores invalid or opaque entries without widening trust", () => {
  expect(
    normalizeTrustedOrigins([
      " https://web.example.test/ ",
      "https://web.example.test/path",
      "views://main/",
      "invalid",
      "null",
      "file:///tmp/x",
      "javascript:alert(1)",
      "https://user:password@example.test",
      "http://[::1]:1420/",
    ]),
  ).toEqual(["https://web.example.test", "views://main", "http://[::1]:1420"]);
});
