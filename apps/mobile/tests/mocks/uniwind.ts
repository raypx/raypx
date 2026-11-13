import type { ComponentType } from "react";

export function withUniwind<T extends ComponentType<never>>(component: T): T {
  return component;
}
export const useCSSVariable = () => "#fff";
export const useUniwind = () => ({ theme: "light" });
