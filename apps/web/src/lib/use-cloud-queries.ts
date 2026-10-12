import { useMemo } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { createWebApiClient } from "./api-client";
import { cloudQueries } from "./cloud-queries";

export function useCloudQueries() {
  const { actorId, accountId, queryClient, resources } = useRouteContext({ from: "/(app)" });
  const api = useMemo(() => createWebApiClient(), []);
  const identity = useMemo(() => ({ actorId, accountId }), [actorId, accountId]);
  const queries = useMemo(() => cloudQueries(identity, api), [identity, api]);
  return { api, identity, queries, queryClient, resources };
}
