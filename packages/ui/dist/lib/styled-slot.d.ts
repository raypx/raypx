import { type ComponentProps, type ElementType } from "react";
/** A styled element that keeps its native props, ref and data-slot override behavior. */
export declare function styledSlot<T extends ElementType>(element: T, slot: string, ...classes: string[]): {
    ({ className, ...props }: ComponentProps<T>): any;
    displayName: string;
};
//# sourceMappingURL=styled-slot.d.ts.map