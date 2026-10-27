/** @vitest-environment happy-dom */
import { expect, it } from "vite-plus/test";
import { externalLinkTarget } from "../../../src/lib/external-links";
it("keeps dev-server router links inside Desktop and identifies only external HTTP links", () => {
  const target = (href: string, origin: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    const child = document.createElement("span");
    anchor.append(child);
    const event = new MouseEvent("click", { button: 0, cancelable: true });
    Object.defineProperty(event, "target", { value: child });
    return externalLinkTarget(event, origin);
  };
  expect(target("http://localhost:1420/tasks", "http://localhost:1420")).toBeNull();
  expect(target("views://main/#/tasks", "null")).toBeNull();
  expect(target("https://raypx.pro/docs", "http://localhost:1420")).toBe("https://raypx.pro/docs");
  expect(target("javascript:alert(1)", "http://localhost:1420")).toBeNull();
});
