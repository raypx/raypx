import { useRender } from "@base-ui/react/use-render";
declare const badgeVariants: any;
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
export type BadgeProps = useRender.ComponentProps<"span"> & {
    variant?: BadgeVariant;
};
declare function Badge({ className, variant, render, ...props }: BadgeProps): any;
export { Badge, badgeVariants };
//# sourceMappingURL=badge.d.ts.map