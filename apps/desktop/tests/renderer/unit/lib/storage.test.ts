/** @vitest-environment happy-dom */
import { afterEach, expect, it } from "vite-plus/test";
import { desktopStorageKey } from "../../../../src/lib/storage";

afterEach(() => {
  Reflect.deleteProperty(window, "__raypxConnection");
});
function select(apiUrl: string) {
  Object.defineProperty(window, "__raypxConnection", {
    value: { apiUrl, webUrl: apiUrl },
    configurable: true,
  });
}
it("isolates native renderer keys by normalized server origin including port", () => {
  select("https://api.example.test:443");
  const first = desktopStorageKey("recent");
  select("https://api.example.test");
  expect(desktopStorageKey("recent")).toBe(first);
  select("https://api.example.test:8443");
  expect(desktopStorageKey("recent")).not.toBe(first);
  expect(desktopStorageKey("other")).not.toBe(desktopStorageKey("recent"));
});
it("retains browser preview keys without a native preload", () => {
  expect(desktopStorageKey("recent")).toBe("recent");
});
