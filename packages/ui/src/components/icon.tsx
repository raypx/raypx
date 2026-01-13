import type { IconProps as TablerIconProps } from "@tabler/icons-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import * as React from "react";

export type TablerIcon = ForwardRefExoticComponent<TablerIconProps & RefAttributes<SVGSVGElement>>;

export type IconProps = TablerIconProps & {
  icon: TablerIcon;
};

export const Icon = (props: IconProps) => {
  if (!props.icon) return null;
  const { icon, ...rest } = props;
  return React.createElement(icon, rest);
};
