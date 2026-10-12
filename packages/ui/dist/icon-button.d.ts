import { type ButtonProps } from "./components/ui/button";
export interface IconButtonProps extends Omit<ButtonProps, "size"> {
    label: string;
    hint?: string;
    size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}
export declare function IconButton({ label, hint, size, variant, children, ...props }: IconButtonProps): any;
//# sourceMappingURL=icon-button.d.ts.map