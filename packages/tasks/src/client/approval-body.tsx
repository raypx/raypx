/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Bounded Diff tables need keyboard focus for horizontal and vertical scrolling. */
import { useMemo } from "react";
import type { HumanRequest } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { approvalChanges } from "./approval-changes.js";
import { TaskMarkdown } from "./markdown.js";

const rawContentClassName =
  "max-h-112 overflow-auto rounded-md bg-muted p-4 font-mono text-xs leading-[1.7] whitespace-pre-wrap wrap-anywhere";
const lineNumberClassName = "min-w-[3em] px-[0.5em] text-right text-muted-foreground select-none";

export function ApprovalBody({ request }: { request: Pick<HumanRequest, "kind" | "body"> }) {
  const t = useTranslations("tasks");
  const files = useMemo(() => approvalChanges(request.body), [request.body]);
  if (request.kind === "plan") return <TaskMarkdown>{request.body}</TaskMarkdown>;
  if (!files.length) return <pre className={rawContentClassName}>{request.body}</pre>;
  return (
    <Tabs defaultValue="diff">
      <TabsList aria-label={t("requestView")}>
        <TabsTrigger value="diff">{t("changes")}</TabsTrigger>
        <TabsTrigger value="raw">{t("rawRequest")}</TabsTrigger>
      </TabsList>
      <TabsContent value="diff" className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("diffHint")}</p>
        {files.map((file, index) => (
          <section
            key={`${file.path}:${index}`}
            className="overflow-hidden rounded-md border border-border"
          >
            <h4 className="break-all border-b border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              {file.previousPath && (
                <span className="mb-1 block text-muted-foreground">
                  {t("renamedFrom", { path: file.previousPath })}
                </span>
              )}
              {file.path}
            </h4>
            {file.originalUnknown && (
              <p className="p-3 text-xs text-muted-foreground">{t("writeOriginalUnknown")}</p>
            )}
            <div
              className="max-h-96 overflow-auto font-mono text-xs leading-[1.7] [&_td]:align-top"
              role="region"
              aria-label={file.path}
              tabIndex={0}
            >
              <table className="w-full border-collapse">
                <tbody>
                  {file.lines.map((line, i) => (
                    <tr
                      key={i}
                      data-change={line.kind}
                      className="data-[change=add]:bg-chart-2/[14%] data-[change=remove]:bg-destructive/[12%] data-[change=hunk]:bg-muted data-[change=hunk]:text-muted-foreground"
                    >
                      <td className={lineNumberClassName}>{line.old ?? ""}</td>
                      <td className={lineNumberClassName}>{line.next ?? ""}</td>
                      <td className="w-[1.5em] text-center select-none">
                        {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
                      </td>
                      <td className="pr-4 whitespace-pre">{line.text || " "}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {file.truncated && (
              <p role="status" className="p-3 text-xs text-muted-foreground">
                {t("diffTruncated")}
              </p>
            )}
          </section>
        ))}
      </TabsContent>
      <TabsContent value="raw">
        <pre className={rawContentClassName}>{request.body}</pre>
      </TabsContent>
    </Tabs>
  );
}
