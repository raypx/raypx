import { useEffect, useState } from "react";
import { FileTextIcon } from "@raypx/icons/file-text";
import { CloseIcon } from "@raypx/icons/close";
import { Button } from "@raypx/ui/components/ui/button";
import { InputGroupAddon } from "@raypx/ui/components/ui/input-group";
import { IconButton } from "@raypx/ui/icon-button";
import { pageIdSchema } from "@raypx/core/pages";
import type { SpaceId, SpaceEvent } from "@raypx/core/spaces";
import type { AgentsWorkspacePort } from "../model/port.js";
import { memberTextParts, type MemberTextPart } from "../model/page-reference.js";
import { useTranslations } from "./i18n.js";

type Titles = ReadonlyMap<string, string>;
const emptyTitles: Titles = new Map();
export type PageReferenceSubscription = (listener: (event: SpaceEvent) => void) => () => void;

/** Retain titles only; the existing Page read still authorizes each same-Space request. */
export function usePageReferenceTitles(
  pages: AgentsWorkspacePort["pages"],
  spaceId: SpaceId,
  referenceIds: string,
  subscribe?: PageReferenceSubscription,
): Titles {
  const [value, setValue] = useState<{ pages: typeof pages; spaceId: SpaceId; titles: Titles }>();
  useEffect(() => {
    if (!pages) return;
    const source = pages;
    const ids = pageIdSchema.array().parse(JSON.parse(referenceIds));
    if (!ids.length) return;
    let current = true;
    let revision = 0;
    async function refresh() {
      const requested = ++revision;
      const result = await Promise.allSettled(ids.map((id) => source.get({ spaceId, id })));
      if (!current || requested !== revision) return;
      const titles = new Map<string, string>();
      for (const [index, item] of result.entries()) {
        if (
          item.status === "fulfilled" &&
          item.value.spaceId === spaceId &&
          item.value.id === ids[index]
        )
          titles.set(item.value.id, item.value.title);
      }
      setValue({ pages: source, spaceId, titles });
    }
    void refresh();
    const unsubscribe = subscribe?.((event) => {
      if (event.spaceId === spaceId) void refresh();
    });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      current = false;
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [pages, spaceId, referenceIds, subscribe]);
  return value?.spaceId === spaceId && value.pages === pages ? value.titles : emptyTitles;
}

function PageReference({
  id,
  title,
  onOpenPage,
}: {
  id: string;
  title: string;
  onOpenPage: ((id: string) => void) | undefined;
}) {
  const t = useTranslations("agents");
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-w-0 max-w-full shrink align-middle"
      aria-label={t("pageReference.open", { title })}
      title={title}
      onClick={() => onOpenPage?.(id)}
    >
      <FileTextIcon aria-hidden="true" data-icon="inline-start" />
      <span className="max-w-64 truncate">{title}</span>
    </Button>
  );
}

export function MemberMessageText({
  text,
  origin,
  spaceId,
  titles = emptyTitles,
  onOpenPage,
}: {
  text: string;
  origin: string;
  spaceId: string;
  titles?: Titles;
  onOpenPage?: ((id: string) => void) | undefined;
}) {
  const t = useTranslations("agents");
  return memberTextParts(text, origin, spaceId).map((part) => {
    if (part.kind === "text") return part.text;
    return (
      <PageReference
        key={part.start}
        id={part.id}
        title={titles.get(part.id)?.trim() || t("pageReference.page")}
        onOpenPage={onOpenPage}
      />
    );
  });
}

export function ComposerPageReferences({
  references,
  titles,
  disabled,
  onRemove,
  onOpenPage,
}: {
  references: readonly Extract<MemberTextPart, { kind: "page" }>[];
  titles: Titles;
  disabled: boolean;
  onRemove: (start: number) => void;
  onOpenPage: ((id: string) => void) | undefined;
}) {
  const t = useTranslations("agents");
  if (!references.length) return null;
  return (
    <InputGroupAddon align="block-start" className="px-3 pt-3 pb-0">
      <ul aria-label={t("pageReference.references")} className="flex min-w-0 flex-wrap gap-2">
        {references.map((reference) => {
          const title = titles.get(reference.id)?.trim() || t("pageReference.page");
          return (
            <li key={reference.start} className="flex min-w-0 max-w-full items-center gap-1">
              <PageReference id={reference.id} title={title} onOpenPage={onOpenPage} />
              <IconButton
                size="icon-xs"
                label={t("pageReference.remove", { title })}
                disabled={disabled}
                onClick={() => onRemove(reference.start)}
              >
                <CloseIcon aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </InputGroupAddon>
  );
}
