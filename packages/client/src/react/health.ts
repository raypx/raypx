import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { healthQueryOptions } from "./query.js";

export type HealthCheckStatus = "loading" | "connected" | "error";

/** Uses the provider's shared cache; retry revalidates without duplicating a pending check. */
export function useHealthCheck() {
  const query = useQuery(healthQueryOptions());
  const { isFetching, refetch } = query;
  const status: HealthCheckStatus = query.isFetching
    ? "loading"
    : query.isError
      ? "error"
      : query.isSuccess
        ? "connected"
        : "loading";
  const retry = useCallback(() => {
    if (!isFetching) void refetch({ cancelRefetch: false });
  }, [isFetching, refetch]);
  return { status, retry };
}
