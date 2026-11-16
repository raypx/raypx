import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { structuredPatch } from "diff";
import { ReplyMarkdown } from "@raypx/blocks/markdown";
import type { PageId, PageVersion } from "@raypx/core/pages";
import type { SpaceId } from "@raypx/core/spaces";
import { CloseIcon } from "@raypx/icons/close";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@raypx/ui/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { IconButton } from "@raypx/ui/icon-button";
import { cn } from "@raypx/ui/lib/utils";
import { pageDocumentUrl, pageFailure, type PagesClientPort } from "../model.js";
import { PageDocumentPreview } from "./detail.js";
import { PageDocumentLink } from "./document-link.js";
import { useTranslations } from "./i18n.js";

type PageReader = PagesClientPort["get"];
type VersionState = { page: PageVersion } | { error: ReturnType<typeof pageFailure> } | null;

function usePageVersion(
  read: PageReader,
  spaceId: SpaceId,
  id: PageId,
  version: number | null | undefined,
) {
  const [state, setState] = useState<VersionState>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (version === null) return;
    let active = true;
    void read({ spaceId, id, ...(version === undefined ? {} : { version }) }).then(
      (page) => {
        if (active) setState({ page });
      },
      (error: unknown) => {
        if (active) setState({ error: pageFailure(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [read, spaceId, id, version, attempt]);
  return {
    state,
    retry: () => {
      setState(null);
      setAttempt((value) => value + 1);
    },
  };
}

interface PageResultPreviewProps {
  open: boolean;
  docked: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | false;
  spaceId: SpaceId;
  page: { id: PageId; version?: number };
  read: PageReader;
  apiOrigin: string;
  canEmbedAuthenticatedDocuments: boolean;
}

export function PageResultPreview({ open, onClose, ...props }: PageResultPreviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const headingId = useId();
  const { docked, page } = props;
  useLayoutEffect(() => {
    if (open && docked) heading.current?.focus({ preventScroll: true });
  }, [open, docked, page.id, page.version]);
  const closeFromKeyboard = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  });
  useEffect(() => {
    const node = sidebar.current;
    if (!node) return;
    node.addEventListener("keydown", closeFromKeyboard);
    return () => node.removeEventListener("keydown", closeFromKeyboard);
  }, [open, docked]);
  const panel = open && (
    <PageResultPanel
      key={JSON.stringify([props.spaceId, page.id, page.version])}
      {...props}
      heading={heading}
      headingId={headingId}
      onClose={onClose}
    />
  );
  if (docked)
    return (
      open && (
        <aside
          ref={sidebar}
          aria-labelledby={headingId}
          className="flex min-h-0 min-w-0 w-[clamp(24rem,40%,36rem)] shrink-0 flex-col overflow-hidden border-l bg-background text-sm"
        >
          {panel}
        </aside>
      )
    );
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        showCloseButton={false}
        initialFocus={heading}
        finalFocus={props.finalFocus}
        className="gap-0 overflow-hidden data-[side=right]:w-full sm:data-[side=right]:max-w-2xl motion-reduce:transform-none motion-reduce:transition-none"
      >
        {panel}
      </SheetContent>
    </Sheet>
  );
}

function PageResultPanel({
  spaceId,
  page: { id, version },
  read,
  apiOrigin,
  canEmbedAuthenticatedDocuments,
  docked,
  heading,
  headingId,
  onClose,
}: Omit<PageResultPreviewProps, "open" | "finalFocus"> & {
  heading: RefObject<HTMLHeadingElement | null>;
  headingId: string;
}) {
  const t = useTranslations("pages");
  const current = usePageVersion(read, spaceId, id, version);
  const comparesVersions = version !== undefined && version > 1;
  const previous = usePageVersion(read, spaceId, id, comparesVersions ? version - 1 : null);
  const page = current.state && "page" in current.state ? current.state.page : null;
  const base = previous.state && "page" in previous.state ? previous.state.page : null;
  const htmlSource = page?.kind === "html" && !canEmbedAuthenticatedDocuments;
  const displayVersion = version ?? page?.version;
  const Title = docked ? "h2" : SheetTitle;
  return (
    <>
      <SheetHeader className="flex-row items-start justify-between gap-3 border-b">
        <div className="min-w-0">
          <Title
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="truncate rounded-md font-heading text-base font-medium text-foreground outline-none focus-visible:focus-control"
          >
            {page?.title ?? t("result.title")}
          </Title>
          {displayVersion !== undefined && (
            <p className="text-xs text-muted-foreground">
              {t("version", { version: displayVersion })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {page && canEmbedAuthenticatedDocuments && (
            <PageDocumentLink
              href={pageDocumentUrl(apiOrigin, {
                spaceId,
                id,
                ...(version === undefined ? {} : { version }),
              })}
            />
          )}
          <IconButton size="icon-sm" label={t("close")} onClick={onClose}>
            <CloseIcon aria-hidden="true" />
          </IconButton>
        </div>
      </SheetHeader>
      {page ? (
        <Tabs defaultValue={comparesVersions ? "changes" : "preview"} className="min-h-0 flex-1">
          <TabsList aria-label={t("result.title")} variant="line" className="mx-4 mt-2 shrink-0">
            {comparesVersions && <TabsTrigger value="changes">{t("result.changes")}</TabsTrigger>}
            <TabsTrigger value="preview">{t(htmlSource ? "source" : "preview")}</TabsTrigger>
          </TabsList>
          {comparesVersions && (
            <TabsContent value="changes" className="min-h-0 overflow-y-auto overscroll-contain p-4">
              {base ? <PageChanges before={base} after={page} /> : <VersionStatus {...previous} />}
            </TabsContent>
          )}
          <TabsContent value="preview" className="min-h-0 overflow-y-auto overscroll-contain p-4">
            {page.kind === "document" && (
              <ReplyMarkdown
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
                copyErrorLabel={t("copyError")}
              >
                {page.body}
              </ReplyMarkdown>
            )}
            {page.kind === "html" &&
              (htmlSource ? (
                <PageSource body={page.body} />
              ) : (
                <PageDocumentPreview
                  available
                  onOpenWebPreview={undefined}
                  title={page.title}
                  src={pageDocumentUrl(apiOrigin, page)}
                  className="h-full min-h-48 w-full rounded-lg border bg-background"
                />
              ))}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="p-4">
          <VersionStatus {...current} />
        </div>
      )}
    </>
  );
}

function VersionStatus({ state, retry }: { state: VersionState; retry: () => void }) {
  const t = useTranslations("pages");
  if (!state) return <p role="status">{t("loading")}</p>;
  if (!("error" in state)) return null;
  if (state.error === "PAGE_NOT_FOUND") return <p role="status">{t("result.unavailable")}</p>;
  return (
    <Alert>
      <AlertDescription className="flex flex-col items-start gap-2">
        {t("result.error")}
        <Button size="sm" variant="outline" onClick={retry}>
          {t("retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function PageSource({ body }: { body: string }) {
  return (
    <pre className="rounded-lg border bg-background p-3 font-mono text-xs leading-5 whitespace-pre-wrap wrap-anywhere">
      {body}
    </pre>
  );
}

const diffStyles = {
  "+": "bg-success-bg text-success-text",
  "-": "bg-danger-bg text-danger-text",
  " ": "text-muted-foreground",
  "\\": "text-muted-foreground",
} as const;

function groupDiffLines(lines: readonly string[]) {
  const groups: { prefix: keyof typeof diffStyles; lines: string[] }[] = [];
  for (const line of lines) {
    const prefix = line[0] as keyof typeof diffStyles;
    const last = groups.at(-1);
    if (last?.prefix === prefix) last.lines.push(line);
    else groups.push({ prefix, lines: [line] });
  }
  return groups;
}

function PageChanges({ before, after }: { before: PageVersion; after: PageVersion }) {
  const t = useTranslations("pages");
  const patch = useMemo(
    () =>
      structuredPatch("", "", before.body, after.body, undefined, undefined, {
        context: 2,
        maxEditLength: 1_500,
        timeout: 75,
      }),
    [before.body, after.body],
  );
  const from = t("version", { version: before.version });
  const to = t("version", { version: after.version });
  const titleChanged = before.title !== after.title;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("result.comparison", { from, to })}</p>
      {titleChanged && (
        <div className="flex flex-wrap items-baseline gap-x-2 wrap-anywhere">
          <span>{t("name")}</span>
          <del className="text-danger-text">{before.title}</del>
          <ins className="text-success-text">{after.title}</ins>
        </div>
      )}
      {patch?.hunks.length === 0 && !titleChanged && <p>{t("result.noChanges")}</p>}
      {patch?.hunks.map((hunk) => (
        <div
          key={hunk.oldStart}
          className="min-w-0 overflow-hidden rounded-lg border bg-background"
        >
          <p className="border-b bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
            {t("result.lines", { before: hunk.oldStart, after: hunk.newStart })}
          </p>
          {groupDiffLines(hunk.lines).map(({ prefix, lines }, index) => (
            <pre
              key={index}
              className={cn(
                "px-3 font-mono text-xs leading-5 whitespace-pre-wrap wrap-anywhere",
                diffStyles[prefix],
              )}
            >
              {lines.join("\n")}
            </pre>
          ))}
        </div>
      ))}
      {!patch && (
        <>
          <p>{t("result.fullSources")}</p>
          <h3 className="text-sm font-medium">{from}</h3>
          <PageSource body={before.body} />
          <h3 className="text-sm font-medium">{to}</h3>
          <PageSource body={after.body} />
        </>
      )}
    </div>
  );
}
