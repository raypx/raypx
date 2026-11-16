import type { ToolActivity, ToolPage } from "@raypx/core/conversation";
import type { SpaceId } from "@raypx/core/spaces";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { FileTextIcon } from "@raypx/icons/file-text";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "./i18n.js";

export interface PageResultMountProps {
  open: boolean;
  docked: boolean;
  spaceId: SpaceId;
  page: { id: ToolPage["id"]; version?: number };
  onClose: () => void;
  finalFocus: () => HTMLElement | false;
}

export function PageResultCards({
  activity,
  delegated,
  onOpen,
  docked,
}: {
  activity: readonly ToolActivity[];
  delegated: readonly { activity: readonly ToolActivity[] }[];
  onOpen: (page: ToolPage, opener: HTMLButtonElement) => void;
  docked: boolean;
}) {
  const t = useTranslations("agents");
  const cards = [...activity, ...delegated.flatMap((work) => work.activity)].flatMap((call) => {
    const { page, outcome, toolName } = call;
    if (
      outcome !== "succeeded" ||
      !page ||
      (toolName !== "agent_page_create" && toolName !== "agent_page_update")
    )
      return [];
    return [{ page, toolName }];
  });
  if (!cards.length) return null;
  return (
    <ul aria-label={t("pageResult.label")} className="flex min-w-0 flex-wrap gap-2">
      {cards.map(({ page, toolName }) => (
        <li key={JSON.stringify([page.id, page.version])} className="min-w-0 max-w-full">
          <Button
            size="sm"
            variant="outline"
            aria-haspopup={docked ? undefined : "dialog"}
            className="h-auto min-h-11 max-w-full gap-2.5 py-2"
            onClick={(event) => onOpen(page, event.currentTarget)}
          >
            <FileTextIcon data-icon="inline-start" aria-hidden="true" />
            <span className="flex min-w-0 flex-col items-start gap-0.5 text-left whitespace-normal">
              <span>
                {t(toolName === "agent_page_create" ? "pageResult.created" : "pageResult.updated")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("pageResult.version", { version: page.version })}
              </span>
            </span>
            <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
