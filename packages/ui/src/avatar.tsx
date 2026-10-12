import type { ComponentPropsWithoutRef } from "react";

import { Avatar as BaseAvatar, AvatarFallback, AvatarImage } from "#components/ui/avatar";

export interface AvatarProps extends ComponentPropsWithoutRef<"span"> {
  name: string;
  imageUrl?: string;
  size?: "small" | "medium" | "large";
}

export function Avatar({ name, imageUrl, size = "medium", className, ...props }: AvatarProps) {
  const { style, ...restProps } = props;
  const baseSize = {
    small: "sm",
    medium: "default",
    large: "lg",
  }[size] as "sm" | "default" | "lg";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return (
    <BaseAvatar
      aria-label={name}
      className={className}
      role="img"
      size={baseSize}
      {...restProps}
      {...(style === undefined ? {} : { style })}
    >
      {imageUrl ? <AvatarImage alt="" src={imageUrl} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </BaseAvatar>
  );
}
