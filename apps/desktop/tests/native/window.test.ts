import { describe, expect, it, vi } from "vite-plus/test";
import { wireWindow } from "../../native/window";

function windowFixture() {
  const handlers = new Map<string, (event: unknown) => void>();
  const window = {
    on: vi.fn((name: string, handler: (event: unknown) => void) => handlers.set(name, handler)),
    hide: vi.fn(),
    show: vi.fn(),
    activate: vi.fn(),
    unminimize: vi.fn(),
    getSize: vi.fn(() => ({ width: 1120, height: 720 })),
    setSize: vi.fn(),
  };
  return { window, handlers };
}

describe("Desktop window lifecycle policy", () => {
  it("cancels native close before hiding a window when the tray is available", () => {
    const { window, handlers } = windowFixture();
    wireWindow(window, () => true, vi.fn());
    const event = { response: { allow: true } };
    handlers.get("will-close")!(event);
    expect(event.response.allow).toBe(false);
    expect(window.hide).toHaveBeenCalledOnce();
  });

  it("allows native close and quits the host when there is no tray", () => {
    const { window, handlers } = windowFixture();
    const quit = vi.fn();
    wireWindow(window, () => false, quit);
    const event = { response: { allow: true } };
    handlers.get("will-close")!(event);
    expect(event.response.allow).toBe(true);
    expect(window.hide).not.toHaveBeenCalled();
    handlers.get("close")!({});
    expect(quit).toHaveBeenCalledOnce();
  });

  it("restores a minimized hidden window before activating it", () => {
    const { window } = windowFixture();
    wireWindow(window, () => true, vi.fn()).show();
    expect(window.unminimize.mock.invocationCallOrder[0]).toBeLessThan(
      window.show.mock.invocationCallOrder[0]!,
    );
    expect(window.show.mock.invocationCallOrder[0]).toBeLessThan(
      window.activate.mock.invocationCallOrder[0]!,
    );
  });

  it("enforces minimum dimensions without recursively resizing", () => {
    const { window, handlers } = windowFixture();
    wireWindow(window, () => true, vi.fn());
    window.getSize.mockReturnValue({ width: 640, height: 480 });
    window.setSize.mockImplementation(() => handlers.get("resize")!({}));
    handlers.get("resize")!({});
    expect(window.setSize).toHaveBeenCalledExactlyOnceWith(800, 620);
    window.getSize.mockReturnValue({ width: 900, height: 700 });
    handlers.get("resize")!({});
    expect(window.setSize).toHaveBeenCalledOnce();
  });
});
