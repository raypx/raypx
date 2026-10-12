import { styledSlot } from "#lib/styled-slot";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from "#lib/utils";

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg";
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className,
      )}
      {...props}
    />
  );
}

const AvatarImage = styledSlot(
  AvatarPrimitive.Image,
  "avatar-image",
  "aspect-square size-full rounded-full object-cover",
);

const AvatarFallback = styledSlot(
  AvatarPrimitive.Fallback,
  "avatar-fallback",
  "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
);

export { Avatar, AvatarImage, AvatarFallback };
