import { createApiClient, type ApiClient, type CreateApiClientOptions } from "@voidmix/client";
import { env } from "../env";

export type { ApiClient } from "@voidmix/client";

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
