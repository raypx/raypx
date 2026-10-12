import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
declare function Sheet({ ...props }: SheetPrimitive.Root.Props): any;
declare function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props): any;
declare function SheetClose({ ...props }: SheetPrimitive.Close.Props): any;
declare function SheetContent({ className, children, side, showCloseButton, ...props }: SheetPrimitive.Popup.Props & {
    side?: "top" | "right" | "bottom" | "left";
    showCloseButton?: boolean;
}): any;
declare function SheetHeader({ className, ...props }: React.ComponentProps<"div">): any;
declare function SheetFooter({ className, ...props }: React.ComponentProps<"div">): any;
declare function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props): any;
declare function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props): any;
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, };
//# sourceMappingURL=sheet.d.ts.map