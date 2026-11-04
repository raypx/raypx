import { useQuery } from "@tanstack/react-query";
import { useDesktopPlatform } from "../../lib/platform-context";
import { createLocalTaskClient } from "./local-client";

export const projectCatalogKey = ["desktop-project-navigation"] as const;
export function useProjectCatalog(enabled = true) {
  const platform = useDesktopPlatform();
  return useQuery({
    queryKey: projectCatalogKey,
    queryFn: ({ signal }) =>
      createLocalTaskClient(platform.localRequest, platform.onLocalEvent).devices.list(
        {},
        { signal },
      ),
    enabled: enabled && platform.isDesktop(),
    staleTime: 30_000,
    retry: false,
  });
}
