import { expect, it } from "vite-plus/test";
import { safeSourceUrl } from "../model/cloud";
it("limits cited links to http and https", () => {
  expect(safeSourceUrl("javascript:alert(1)")).toBeUndefined();
  expect(safeSourceUrl("file:///private/report")).toBeUndefined();
  expect(safeSourceUrl("https://example.com/source")).toBe("https://example.com/source");
});
