import { useTranslations } from "./i18n.js";
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Bounded Diff tables need keyboard focus for horizontal and vertical scrolling. */
import { useMemo } from "react";
import type { HumanRequest } from "@raypx/core/tasks";

import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { FileTextIcon } from "@raypx/icons/file-text";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { HelpHint } from "@raypx/ui/help-hint";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { approvalChanges, type DiffFile } from "./approval-changes.js";
import { TaskMarkdown } from "./markdown.js";

const rawContentClassName =
  "max-h-112 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-[1.7] whitespace-pre-wrap wrap-anywhere";
const lineNumberClassName = "min-w-[3em] px-[0.5em] text-right text-muted-foreground select-none";
const lineMarkers = { add: "+", remove: "−", context: " ", hunk: " " };

function DiffPreview({ file }: { file: DiffFile }) {
  const t = useTranslations("tasks");
  const added = file.lines.filter((line) => line.kind === "add").length;
  const removed = file.lines.filter((line) => line.kind === "remove").length;
  return (
    <Collapsible defaultOpen className="overflow-hidden rounded-lg border border-border">
      <h4>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="group h-auto min-h-11 w-full justify-start gap-2 rounded-none bg-muted/40 px-3 py-2 text-left text-xs whitespace-normal"
            />
          }
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 group-data-panel-open:rotate-90 motion-safe:transition-transform motion-safe:duration-200 group-focus-visible:transition-none"
          />
          <FileTextIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 font-mono break-all">
            {file.previousPath && (
              <span className="mb-1 block text-muted-foreground">
                {t("renamedFrom", { path: file.previousPath })}
              </span>
            )}
            {file.path}
          </span>
          {(added > 0 || removed > 0) && (
            <span
              className="flex shrink-0 gap-2 font-mono tabular-nums"
              aria-label={t("previewLineCounts", {
                added: String(added),
                removed: String(removed),
              })}
            >
              <span>+{added}</span>
              <span className="text-destructive-text">−{removed}</span>
            </span>
          )}
        </CollapsibleTrigger>
      </h4>
      <CollapsibleContent animated>
        <div className="border-t border-border">
          {file.originalUnknown && (
            <p className="p-3 text-xs text-muted-foreground">{t("writeOriginalUnknown")}</p>
          )}
          <div
            className="max-h-96 overflow-auto font-mono text-xs leading-[1.7] focus-visible:-outline-offset-2 [&_td]:align-top"
            role="region"
            aria-label={file.path}
            tabIndex={0}
          >
            <table className="w-full border-collapse">
              <tbody>
                {file.lines.map((line, index) => (
                  <tr
                    key={index}
                    data-change={line.kind}
                    className="data-[change=add]:bg-chart-2/[14%] data-[change=remove]:bg-destructive/[12%] data-[change=hunk]:bg-muted data-[change=hunk]:text-muted-foreground"
                  >
                    <td className={lineNumberClassName}>{line.old ?? ""}</td>
                    <td className={lineNumberClassName}>{line.next ?? ""}</td>
                    <td className="w-[1.5em] text-center select-none">{lineMarkers[line.kind]}</td>
                    <td className="pr-4 whitespace-pre">{line.text || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {file.truncated && (
            <p role="status" className="border-t border-border p-3 text-xs text-muted-foreground">
              {t("diffTruncated")}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ApprovalBody({ request }: { request: Pick<HumanRequest, "kind" | "body"> }) {
  const t = useTranslations("tasks");
  const files = useMemo(() => approvalChanges(request.body), [request.body]);
  const fileCount = new Set(files.map((file) => file.path)).size;
  if (request.kind === "plan") return <TaskMarkdown>{request.body}</TaskMarkdown>;
  if (!files.length) return <pre className={rawContentClassName}>{request.body}</pre>;
  return (
    <Tabs defaultValue="diff">
      <div className="flex flex-wrap items-center gap-1">
        <TabsList aria-label={t("requestView")}>
          <TabsTrigger value="diff">{t("changes")}</TabsTrigger>
          <TabsTrigger value="raw">{t("rawRequest")}</TabsTrigger>
        </TabsList>
        <HelpHint label={t("changesHelp")} description={t("diffHint")} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("previewFiles", { count: String(fileCount) })}
        </span>
      </div>
      <TabsContent value="diff" className="flex flex-col gap-3">
        {files.map((file, index) => (
          <DiffPreview key={`${file.path}:${index}`} file={file} />
        ))}
      </TabsContent>
      <TabsContent value="raw">
        <pre className={rawContentClassName}>{request.body}</pre>
      </TabsContent>
    </Tabs>
  );
}
