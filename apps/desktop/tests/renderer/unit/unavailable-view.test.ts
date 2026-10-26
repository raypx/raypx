import { expect, it } from "vite-plus/test";
import { Electroview } from "../../../src/lib/unavailable-view";
it("keeps browser acceptance incapable of claiming a Native transport", () => {
  expect(() => Electroview.defineRPC()).toThrow("DESKTOP_REQUIRED");
  expect(() => new Electroview()).toThrow("DESKTOP_REQUIRED");
});
