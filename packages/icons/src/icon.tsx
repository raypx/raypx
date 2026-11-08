import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ComponentPropsWithRef, FunctionComponent } from "react";

export type IconProps = Omit<ComponentPropsWithRef<"svg">, "children" | "strokeWidth" | "size"> & {
  size?: number | string;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
};

export type IconComponent = FunctionComponent<IconProps>;

/** Bind one selected glyph without exposing the vendor's data API to consumers. */
export function createIcon(icon: IconSvgElement, displayName: string): IconComponent {
  function Icon({
    size = 24,
    strokeWidth = 1.75,
    color = "currentColor",
    className = "",
    "aria-hidden": ariaHidden,
    ...props
  }: IconProps) {
    return (
      <HugeiconsIcon
        {...props}
        icon={icon}
        size={size}
        strokeWidth={strokeWidth}
        color={color}
        aria-hidden={
          ariaHidden ?? (props["aria-label"] || props["aria-labelledby"] ? undefined : true)
        }
        // Vendor paths set their own stroke width. Inherit the root so utilities
        // such as Sidebar's stroke-[1.75] still control the entire glyph.
        className={`[&>*]:[stroke-width:inherit] ${className}`}
      />
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
