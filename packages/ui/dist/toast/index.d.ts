import type { ReactNode } from "react";
export type ToastModule = typeof import("#components/ui/toast");
type ToastOptions = Parameters<ToastModule["toast"]["add"]>[0];
type ToastModuleLoader = () => Promise<ToastModule>;
export declare function createToastBridge(loader?: ToastModuleLoader): {
    AsyncToaster: ({ children }: {
        children?: ReactNode;
    }) => any;
    resetForTests: () => void;
    toast: {
        add(options: ToastOptions): void;
    };
};
export declare const AsyncToaster: ({ children }: {
    children?: ReactNode;
}) => any, resetToastForTests: () => void, toast: {
    add(options: ToastOptions): void;
};
export {};
//# sourceMappingURL=index.d.ts.map