import { cva } from "class-variance-authority";

export type ControlSize = "sm" | "default" | "lg" | "xl";

/** Shared heights and corners for controls that sit on the same row. */
export const controlSizeVariants = cva("", {
  variants: {
    size: {
      sm: "h-control-sm rounded-md",
      default: "h-control rounded-lg",
      lg: "h-control-lg rounded-lg",
      xl: "h-control-xl rounded-lg",
    },
  },
  defaultVariants: { size: "default" },
});
