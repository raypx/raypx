import { vi } from "vite-plus/test";

// happy-dom has no layout; keep the real virtualizer with measurable rows/viewport.
export function mockTaskLayout(scope: "all" | "list") {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return scope === "all" || this.hasAttribute("data-task-list") ? 480 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
}
