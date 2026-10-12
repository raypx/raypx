import type { ComponentProps } from "react";
export type FieldOrientation = "vertical" | "horizontal" | "responsive";
declare const FieldGroup: any;
declare function Field({ className, orientation, ...props }: ComponentProps<"div"> & {
    orientation?: FieldOrientation;
}): any;
declare const FieldLabel: any;
declare function FieldError({ className, children, ...props }: ComponentProps<"div">): any;
export { Field, FieldError, FieldGroup, FieldLabel };
//# sourceMappingURL=field.d.ts.map