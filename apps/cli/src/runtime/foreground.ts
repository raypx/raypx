import { createHost } from "./host";

/** Direct stdio owns execution until EOF; Desktop connects to the independent daemon. */
export function createForegroundHost(options: Omit<Parameters<typeof createHost>[0], "owner">) {
  const host = createHost({ ...options, owner: "foreground" });
  host.restore();
  return host;
}
