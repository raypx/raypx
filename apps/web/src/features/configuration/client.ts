import { createApiClient, type ApiClient } from "@raypx/client";
import { apiUrl } from "../auth/client";

export const configurationClient = createApiClient({
  baseUrl: apiUrl,
  fetch: (input, init) =>
    globalThis.fetch(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(10_000),
      ]),
    }),
}).configuration;
export type Configuration = Awaited<ReturnType<ApiClient["configuration"]["get"]>>;

export function configurationAccessQuery(accountId: string | null) {
  return {
    queryKey: ["configuration", "access", accountId],
    queryFn: ({ signal }: { signal: AbortSignal }) => configurationClient.access({}, { signal }),
    enabled: Boolean(accountId),
    retry: false,
    staleTime: 30_000,
  };
}
export function publicConfigurationQuery() {
  return {
    queryKey: ["configuration", "public"],
    queryFn: ({ signal }: { signal: AbortSignal }) => configurationClient.public({}, { signal }),
    retry: false,
    staleTime: 30_000,
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
