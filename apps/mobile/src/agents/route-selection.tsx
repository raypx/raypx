import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { parseAgentSelection } from "@raypx/agents/model";
import { useWorkspace, useWorkspaceView } from "./provider.js";

/** Route selectors are validated then reconciled against fresh server membership. */
export function useRouteSelection() {
  const params = useLocalSearchParams();
  const selected = parseAgentSelection(params);
  const workspace = useWorkspace();
  const view = useWorkspaceView();
  useEffect(() => {
    if (selected.spaceId) void workspace.refresh(selected.spaceId);
  }, [workspace, selected.spaceId]);
  const current = selected.spaceId === view.page.spaceId;
  const item = current
    ? view.page.agents.find((entry) => entry.agent.id === selected.agentId)
    : undefined;
  return { workspace, view, selected, current, item };
}
