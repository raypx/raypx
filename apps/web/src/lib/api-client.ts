import { createApiClient, type ApiClient, type CreateApiClientOptions } from "@raypx/client";
import { env } from "../env";

export type { ApiClient } from "@raypx/client";

/** Browser/SSR transport configured for the standalone API origin. */
export function createWebApiClient(
  options: Omit<CreateApiClientOptions, "baseUrl"> = {},
): ApiClient {
  return createApiClient({
    ...options,
    ...(env.VITE_API_URL ? { baseUrl: env.VITE_API_URL } : {}),
    fetch: options.fetch ?? ((input, init) => fetch(input, { ...init, credentials: "include" })),
  });
}
