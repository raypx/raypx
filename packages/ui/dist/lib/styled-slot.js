import { createElement } from "react";
import { cn } from "./utils";
/** A styled element that keeps its native props, ref and data-slot override behavior. */
export function styledSlot(element, slot, ...classes) {
    function StyledSlot({ className, ...props }) {
        return createElement(element, {
            "data-slot": slot,
            className: cn(...classes, className),
            ...props,
        });
    }
    StyledSlot.displayName = slot;
    return StyledSlot;
}
//# sourceMappingURL=styled-slot.js.map