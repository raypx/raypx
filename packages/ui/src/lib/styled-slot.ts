import { createElement, type ComponentProps, type ElementType } from "react";
import { cn } from "./utils";

/** A styled element that keeps its native props, ref and data-slot override behavior. */
export function styledSlot<T extends ElementType>(element: T, slot: string, ...classes: string[]) {
  function StyledSlot({ className, ...props }: ComponentProps<T>) {
    return createElement(element, {
      "data-slot": slot,
      className: cn(...classes, className),
      ...props,
    });
  }
  StyledSlot.displayName = slot;
  return StyledSlot;
}
