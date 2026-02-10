export { Spinner } from "@phosphor-icons/react";
export type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";

import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import * as React from "react";

export type PhosphorIcon = ForwardRefExoticComponent<
  PhosphorIconProps & RefAttributes<SVGSVGElement>
>;

export type IconProps = PhosphorIconProps & {
  icon: PhosphorIcon;
};

export const Icon = (props: IconProps) => {
  if (!props.icon) return null;
  const { icon, ...rest } = props;
  return React.createElement(icon, rest);
};
