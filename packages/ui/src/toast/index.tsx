import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

export type ToastModule = typeof import("#components/ui/toast");
type ToastOptions = Parameters<ToastModule["toast"]["add"]>[0];
type ToastModuleLoader = () => Promise<ToastModule>;
type ToastListener = () => void;

const defaultLoader: ToastModuleLoader = () => import("#components/ui/toast");

export function createToastBridge(loader: ToastModuleLoader = defaultLoader) {
  let modulePromise: Promise<ToastModule> | undefined;
  let loadedModule: ToastModule | undefined;
  const pendingToasts: ToastOptions[] = [];
  const listeners = new Set<ToastListener>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function flush(module: ToastModule) {
    const queued = pendingToasts.splice(0);
    for (const options of queued) module.toast.add(options);
  }

  function load(): Promise<ToastModule> {
    if (loadedModule) return Promise.resolve(loadedModule);

    modulePromise ??= loader()
      .then((module) => {
        loadedModule = module;
        flush(module);
        notify();
        return module;
      })
      .catch((error: unknown) => {
        modulePromise = undefined;
        pendingToasts.splice(0);
        notify();
        throw error;
      });

    return modulePromise;
  }

  const toast = {
    add(options: ToastOptions): void {
      if (loadedModule) {
        loadedModule.toast.add(options);
        return;
      }

      pendingToasts.push(options);
      void load().catch(() => undefined);
    },
  };

  function subscribe(listener: ToastListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function AsyncToaster({ children }: { children?: ReactNode }) {
    const module = useSyncExternalStore(
      subscribe,
      () => loadedModule,
      () => undefined,
    );

    if (!module) return children ?? null;

    const { Toaster } = module;
    return <Toaster>{children}</Toaster>;
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
