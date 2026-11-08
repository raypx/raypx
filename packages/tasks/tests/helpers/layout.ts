import { vi } from "vite-plus/test";

// happy-dom has no layout; keep the real virtualizer with measurable rows/viewport.
export function mockTaskLayout(scope: "all" | "list") {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return scope === "all" ||
      this.hasAttribute("data-task-list") ||
      this.hasAttribute("data-conversation")
      ? 480
      : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute("data-conversation"))
      return Number.parseFloat((this.firstElementChild as HTMLElement)?.style.height ?? "0") || 480;
    return 480;
  });
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    this.scrollTop = typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
    queueMicrotask(() => this.dispatchEvent(new Event("scroll")));
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
}
