import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
declare function Popover({ ...props }: PopoverPrimitive.Root.Props): any;
declare function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props): any;
declare function PopoverContent({ className, align, alignOffset, side, sideOffset, ...props }: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">): any;
declare function PopoverHeader({ className, ...props }: React.ComponentProps<"div">): any;
declare function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props): any;
declare function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props): any;
export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
//# sourceMappingURL=popover.d.ts.map