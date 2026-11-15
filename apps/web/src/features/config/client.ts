import { createApiClient, type ApiClient } from "@raypx/client/api";
import { apiUrl } from "../auth/client.js";

const client = createApiClient({
  baseUrl: apiUrl,
  fetch: (input, init) =>
    globalThis.fetch(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(10_000),
      ]),
    }),
});
export const configurationClient = client.configuration;
export const setupChecklistPort: import("@raypx/account/model").SetupChecklistPort = {
  access: (options) => client.account.access({}, options),
  status: (options) => configurationClient.setupStatus({}, options),
};
export type Configuration = Awaited<ReturnType<ApiClient["configuration"]["get"]>>;

export function publicConfigurationQuery() {
  return {
    queryKey: ["configuration", "public"],
    queryFn: ({ signal }: { signal: AbortSignal }) => configurationClient.public({}, { signal }),
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
  };
}
/** Product copy only consumes known codes, never server diagnostic messages. */
export function configurationError(error: unknown): "forbidden" | "conflict" | "unavailable" {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "FORBIDDEN" || code === "UNAUTHORIZED"
    ? "forbidden"
    : code === "CONFLICT"
      ? "conflict"
      : "unavailable";
}
