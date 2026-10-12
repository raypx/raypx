import type { ReactElement, ReactNode } from "react";
/** Application-facing dialog naming and busy-state dismissal policy. */
export declare function Modal({ title, description, closeLabel, trigger, children, open, onOpenChange, drawer, busy, }: {
    title: string;
    description?: string;
    closeLabel: string;
    trigger: ReactElement;
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    drawer?: boolean;
    busy?: boolean;
}): any;
//# sourceMappingURL=modal.d.ts.map