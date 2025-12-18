import type { useRender } from "@base-ui/react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type RenderParam<ElementType extends React.ElementType> =
  useRender.ComponentProps<ElementType>["render"];

export function useRenderParam<ElementType extends React.ElementType>(
  render: RenderParam<ElementType>,
  asChild: boolean,
  children?: React.ReactNode,
): [RenderParam<ElementType>, React.ReactNode | undefined] {
  if (render) {
    return [render, children];
  }

  if (asChild) {
    return [children as React.ReactElement<Record<string, unknown>>, undefined];
  }
  return [undefined, children];
}

/**
 * Extracts render prop from component props that support asChild pattern
 * @param props Component props with render, children, and asChild
 * @returns Tuple of [renderProp, restProps] where renderProp is ready to pass to useRender
 */
export function extractRenderProp<
  TProps extends { render?: any; children?: any; asChild?: boolean },
>(props: TProps): [RenderParam<any>, Omit<TProps, "render" | "children" | "asChild">] {
  const { render, children, asChild = false, ...rest } = props;
  const [renderProp] = useRenderParam(render, asChild, children);
  return [renderProp, rest as Omit<TProps, "render" | "children" | "asChild">];
}
