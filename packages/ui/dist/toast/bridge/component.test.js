import { jsx as _jsx } from "react/jsx-runtime";
/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createToastBridge } from "..";
afterEach(() => cleanup());
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}
function createModule() {
    const add = vi.fn();
    const module = {
        Toaster({ children }) {
            return _jsx("div", { "data-testid": "async-toaster", children: children });
        },
        toast: { add },
    };
    return { add, module: module };
}
describe("UI toast bridge", () => {
    it("does not load the UI module until the first toast is added", async () => {
        const load = vi.fn(async () => createModule().module);
        const bridge = createToastBridge(load);
        expect(load).not.toHaveBeenCalled();
        bridge.toast.add({ title: "Saved" });
        await Promise.resolve();
        expect(load).toHaveBeenCalledOnce();
    });
    it("forwards queued toasts and deduplicates concurrent loads", async () => {
        const pending = deferred();
        const { add, module } = createModule();
        const load = vi.fn(() => pending.promise);
        const bridge = createToastBridge(load);
        const first = { title: "Saved", type: "success" };
        const second = { title: "Published", priority: "high" };
        bridge.toast.add(first);
        bridge.toast.add(second);
        expect(load).toHaveBeenCalledOnce();
        pending.resolve(module);
        await pending.promise;
        await Promise.resolve();
        expect(add).toHaveBeenNthCalledWith(1, first);
        expect(add).toHaveBeenNthCalledWith(2, second);
        const third = { title: "Ready" };
        bridge.toast.add(third);
        expect(load).toHaveBeenCalledOnce();
        expect(add).toHaveBeenLastCalledWith(third);
    });
    it("clears failed loads so the next toast can retry", async () => {
        const firstFailure = deferred();
        const { module } = createModule();
        const load = vi
            .fn()
            .mockReturnValueOnce(firstFailure.promise)
            .mockResolvedValueOnce(module);
        const bridge = createToastBridge(load);
        bridge.toast.add({ title: "First attempt" });
        firstFailure.reject(new Error("chunk unavailable"));
        await expect(firstFailure.promise).rejects.toThrow("chunk unavailable");
        await Promise.resolve();
        bridge.toast.add({ title: "Retry" });
        await Promise.resolve();
        await Promise.resolve();
        expect(load).toHaveBeenCalledTimes(2);
    });
    it("mounts the async toaster only after the module is ready", async () => {
        const pending = deferred();
        const { module } = createModule();
        const bridge = createToastBridge(() => pending.promise);
        render(_jsx(bridge.AsyncToaster, {}));
        expect(screen.queryByTestId("async-toaster")).not.toBeInTheDocument();
        act(() => {
            bridge.toast.add({ title: "Loaded on demand" });
        });
        expect(screen.queryByTestId("async-toaster")).not.toBeInTheDocument();
        await act(async () => {
            pending.resolve(module);
            await pending.promise;
        });
        expect(screen.getByTestId("async-toaster")).toBeVisible();
    });
});
//# sourceMappingURL=component.test.js.map