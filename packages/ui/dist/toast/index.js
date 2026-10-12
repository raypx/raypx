import { jsx as _jsx } from "react/jsx-runtime";
import { useSyncExternalStore } from "react";
const defaultLoader = () => import("#components/ui/toast");
export function createToastBridge(loader = defaultLoader) {
    let modulePromise;
    let loadedModule;
    const pendingToasts = [];
    const listeners = new Set();
    function notify() {
        for (const listener of listeners)
            listener();
    }
    function flush(module) {
        const queued = pendingToasts.splice(0);
        for (const options of queued)
            module.toast.add(options);
    }
    function load() {
        if (loadedModule)
            return Promise.resolve(loadedModule);
        modulePromise ??= loader()
            .then((module) => {
            loadedModule = module;
            flush(module);
            notify();
            return module;
        })
            .catch((error) => {
            modulePromise = undefined;
            pendingToasts.splice(0);
            notify();
            throw error;
        });
        return modulePromise;
    }
    const toast = {
        add(options) {
            if (loadedModule) {
                loadedModule.toast.add(options);
                return;
            }
            pendingToasts.push(options);
            void load().catch(() => undefined);
        },
    };
    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
    function AsyncToaster({ children }) {
        const module = useSyncExternalStore(subscribe, () => loadedModule, () => undefined);
        if (!module)
            return children ?? null;
        const { Toaster } = module;
        return _jsx(Toaster, { children: children });
    }
    function resetForTests() {
        modulePromise = undefined;
        loadedModule = undefined;
        pendingToasts.splice(0);
        notify();
    }
    return { AsyncToaster, resetForTests, toast };
}
const defaultBridge = createToastBridge();
export const { AsyncToaster, resetForTests: resetToastForTests, toast } = defaultBridge;
//# sourceMappingURL=index.js.map