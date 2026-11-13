import type { ComputerProvider } from "@raypx/providers/computer";
import type { ApiEnvironment } from "../env.js";
/** Only this configured branch loads the HTTP adapter; no Engine transport enters API. */
export async function configuredComputerProvider(
  environment: ApiEnvironment,
): Promise<ComputerProvider | null> {
  if (environment.COMPUTER_PROVIDER === "none") return null;
  const { createDockerComputerProvider } = await import("@raypx/providers/computer/docker");
  return createDockerComputerProvider({
    url: environment.SANDBOX_SUPERVISOR_URL!,
    token: environment.SANDBOX_SUPERVISOR_TOKEN!,
  });
}
