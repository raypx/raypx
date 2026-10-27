import { vi } from "vite-plus/test";

// jsdom has no layout; keep the real virtualizer with measurable rows/viewport.
export function mockTaskLayout(scope: "all" | "list") {
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return scope === "all" || this.hasAttribute("data-task-list") ? 480 : 0;
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
}
