import type { ComponentProps } from "react";
export type InputGroupAddonAlign = "inline-start" | "inline-end" | "block-start" | "block-end";
declare function InputGroup({ className, ...props }: ComponentProps<"div">): any;
declare function InputGroupAddon({ align, className, onClick, ...props }: ComponentProps<"div"> & {
    align?: InputGroupAddonAlign;
}): any;
declare const InputGroupInput: any;
export { InputGroup, InputGroupAddon, InputGroupInput };
//# sourceMappingURL=input-group.d.ts.map