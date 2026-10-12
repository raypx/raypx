import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const alertVariants: any;
declare function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>): any;
declare function AlertTitle({ className, ...props }: React.ComponentProps<"div">): any;
declare function AlertDescription({ className, ...props }: React.ComponentProps<"div">): any;
declare function AlertAction({ className, ...props }: React.ComponentProps<"div">): any;
export { Alert, AlertTitle, AlertDescription, AlertAction };
//# sourceMappingURL=alert.d.ts.map