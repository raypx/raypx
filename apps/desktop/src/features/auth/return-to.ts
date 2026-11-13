import { resumablePath } from "@raypx/core/auth";

const paths = new Set(["/agents", "/account", "/memory"]);

export function desktopReturnTo(input: unknown): string {
  const destination = resumablePath(input, paths);
  return destination === "/" ? "/agents" : destination;
}
