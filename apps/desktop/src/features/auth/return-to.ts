import { resumablePath } from "@raypx/core/auth";

const paths = new Set([
  "/",
  "/files",
  "/tasks",
  "/approvals",
  "/account",
  "/automations",
  "/memory",
  "/terminal",
  "/welcome",
]);

export function desktopReturnTo(input: unknown): string {
  return resumablePath(input, paths);
}
