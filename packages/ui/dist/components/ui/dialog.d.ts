import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
declare function Dialog({ ...props }: DialogPrimitive.Root.Props): any;
declare function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props): any;
declare function DialogPortal({ ...props }: DialogPrimitive.Portal.Props): any;
declare function DialogClose({ ...props }: DialogPrimitive.Close.Props): any;
declare function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props): any;
declare function DialogContent({ className, children, showCloseButton, ...props }: DialogPrimitive.Popup.Props & {
    showCloseButton?: boolean;
}): any;
declare function DialogHeader({ className, ...props }: React.ComponentProps<"div">): any;
declare function DialogFooter({ className, showCloseButton, children, ...props }: React.ComponentProps<"div"> & {
    showCloseButton?: boolean;
}): any;
declare function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props): any;
declare function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props): any;
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger, };
//# sourceMappingURL=dialog.d.ts.map