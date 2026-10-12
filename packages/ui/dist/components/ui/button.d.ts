import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
declare const buttonVariants: any;
export interface ButtonProps extends ComponentProps<typeof BaseButton> {
    variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
    size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
    type?: "button" | "submit" | "reset";
}
declare function Button({ className, variant, size, type, ...props }: ButtonProps): any;
export { Button, buttonVariants };
//# sourceMappingURL=button.d.ts.map