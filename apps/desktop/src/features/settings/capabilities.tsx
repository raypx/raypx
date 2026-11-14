import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { SkillsSettings } from "@raypx/skills/client";
import type { SkillsPort } from "@raypx/skills/model";
import { LoadingState } from "@raypx/ui/loading-state";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../i18n.js";
import { agentsClient } from "../agents/client.js";
import { apiUrl } from "../auth/client.js";

export function AccountSkills({ accountId }: { accountId: string }) {
  const c = useTranslations("common");
  const requestedSpace = useLocation({
    select: (location) => (location.search as { spaceId?: string }).spaceId,
  });
  const query = useQuery({
    queryKey: ["account-skills-spaces", apiUrl, accountId],
    queryFn: () => agentsClient.spaces.list({}),
    retry: false,
  });
  if (query.isPending) return <LoadingState label={c("loading")} />;
  if (query.isError)
    return (
      <div role="alert">
        <p>{c("networkError")}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  const spaces = query.data.map(({ space }) => ({ id: space.id, name: space.name }));
  const selected = spaces.find((space) => space.id === requestedSpace) ?? spaces[0];
  if (!selected) return <p className="text-sm text-muted-foreground">{c("empty")}</p>;
  const port: SkillsPort = agentsClient.skills;
  return <SkillsSettings key={selected.id} spaceId={selected.id} spaces={spaces} port={port} />;
}
