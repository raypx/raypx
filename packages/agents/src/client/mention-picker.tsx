import type { RefObject } from "react";
import type { Agent } from "@raypx/core/agents";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@raypx/ui/components/ui/combobox";
import { Avatar, AvatarFallback } from "@raypx/ui/components/ui/avatar";
import { useTranslations } from "./i18n.js";

/** The composer remains the opener; Base UI owns option keyboard navigation. */
export function MentionPicker({
  agents,
  query,
  editor,
  onSelect,
  onClose,
}: {
  agents: readonly Agent[];
  query: string;
  editor: RefObject<HTMLTextAreaElement | null>;
  onSelect: (agent: Agent) => void;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  return (
    <Combobox<Agent>
      open
      defaultInputValue={query}
      items={[...agents]}
      itemToStringLabel={(agent) => agent.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onValueChange={(agent) => {
        if (agent) onSelect(agent);
      }}
      autoHighlight
    >
      <ComboboxContent anchor={editor} side="top" initialFocus finalFocus={editor}>
        <ComboboxInput
          autoFocus
          aria-label={t("mentions.picker")}
          placeholder={t("mentions.search")}
        />
        <ComboboxEmpty>{t("mentions.empty")}</ComboboxEmpty>
        <ComboboxList>
          {(agent: Agent) => (
            <ComboboxItem key={agent.id} value={agent} data-value={agent.id}>
              <Avatar size="sm" aria-hidden="true">
                <AvatarFallback>{agent.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate">{agent.name}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
