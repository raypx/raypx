import type { ComponentPropsWithoutRef } from "react";
export interface AvatarProps extends ComponentPropsWithoutRef<"span"> {
    name: string;
    imageUrl?: string;
    size?: "small" | "medium" | "large";
}
export declare function Avatar({ name, imageUrl, size, className, ...props }: AvatarProps): any;
//# sourceMappingURL=avatar.d.ts.map