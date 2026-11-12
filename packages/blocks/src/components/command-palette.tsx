import { useTranslations } from "../i18n.js";
import { useEffect, useEffectEvent, useSyncExternalStore, type ReactNode } from "react";
import { normalizeSearchText } from "@raypx/i18n";
import { useLocale } from "@raypx/i18n/browser";

import { SearchIcon } from "@raypx/icons/search";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@raypx/ui/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@raypx/ui/components/ui/dialog";

export interface CommandItem {
  id: string;
  label: string;
  /** Secondary text such as a session's project; the search matches it too. */
  detail?: string | undefined;
  icon?: ReactNode;
  onSelect: () => void;
}

export interface CommandGroup {
  label: string;
  items: readonly CommandItem[];
}

interface ListGroup {
  value: string;
  items: readonly CommandItem[];
}

const subscribeNever = () => () => {};
function applePlatform() {
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/** The palette shortcut as this platform writes it; servers render the Ctrl form. */
export function useCommandShortcut() {
  const apple = useSyncExternalStore(subscribeNever, applePlatform, () => false);
  return apple ? { label: "⌘K", keys: "Meta+K" } : { label: "Ctrl K", keys: "Control+K" };
}

/**
 * A ⌘K / Ctrl+K search over application commands: the host supplies grouped items
 * (pages, actions, projects, sessions) and owns the open state so other controls can
 * open it too. Selecting an item closes the palette before running it.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly CommandGroup[];
}) {
  const c = useTranslations("common");
  const locale = useLocale();
  const toggle = useEffectEvent((event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
    if (!(event.metaKey || event.ctrlKey) || event.isComposing) return;
    event.preventDefault();
    onOpenChange(!open);
  });
  useEffect(() => {
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);
  const items: ListGroup[] = groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({ value: group.label, items: group.items }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[max(1rem,14dvh)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{c("search")}</DialogTitle>
        <Combobox<CommandItem>
          inline
          open={open}
          onOpenChange={onOpenChange}
          items={items}
          value={null}
          autoHighlight
          itemToStringLabel={(item) => item.label}
          filter={(item, query) =>
            normalizeSearchText(`${item.label} ${item.detail ?? ""}`, locale).includes(
              normalizeSearchText(query, locale),
            )
          }
          onValueChange={(item) => {
            if (!item) return;
            onOpenChange(false);
            item.onSelect();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-4">
            <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <ComboboxInput
              aria-label={c("search")}
              placeholder={c("searchHint")}
              className="h-12 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 md:text-sm"
            />
          </div>
          <ComboboxEmpty>{c("noResults")}</ComboboxEmpty>
          <ComboboxList className="max-h-[min(60dvh,26rem)] p-1.5 empty:hidden">
            {(group: ListGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: CommandItem) => (
                    <ComboboxItem key={item.id} value={item} className="gap-2.5 pr-2">
                      {item.icon !== undefined && (
                        <span
                          aria-hidden="true"
                          className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4"
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.detail && (
                        <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                          {item.detail}
                        </span>
                      )}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </Combobox>
      </DialogContent>
    </Dialog>
  );
}
