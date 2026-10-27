/** @vitest-environment happy-dom */
import { afterEach, expect, it } from "vite-plus/test";
import { CONNECTION_KEY } from "../../../../config";
import { readDesktopConnection } from "../../../../src/lib/connection";

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  Reflect.deleteProperty(window, CONNECTION_KEY);
});

it("uses native runtime config for auth, Web links and remote tasks instead of build variables", () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  Reflect.set(window, CONNECTION_KEY, {
    apiUrl: "https://own-api.example.test",
    webUrl: "https://own-web.example.test",
  });
  expect(readDesktopConnection()).toEqual({
    apiUrl: "https://own-api.example.test",
    webUrl: "https://own-web.example.test",
  });
});

it("refuses to start native authentication when preload config is absent or invalid", () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  expect(() => readDesktopConnection()).toThrow("Native connection settings unavailable");
  Reflect.set(window, CONNECTION_KEY, {
    apiUrl: "http://external.test",
    webUrl: "https://web.test",
  });
  expect(() => readDesktopConnection()).toThrow("Server URL");
});
