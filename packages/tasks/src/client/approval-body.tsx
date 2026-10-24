/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Bounded Diff tables need keyboard focus for horizontal and vertical scrolling. */
import { useMemo } from "react";
import type { HumanRequest } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { approvalChanges } from "./approval-changes.js";
import { TaskMarkdown } from "./markdown.js";

export function ApprovalBody({ request }: { request: HumanRequest }) {
  const t = useTranslations("tasks");
  const files = useMemo(() => approvalChanges(request.body), [request.body]);
  if (request.kind === "plan") return <TaskMarkdown>{request.body}</TaskMarkdown>;
  if (!files.length) return <pre className="task-content">{request.body}</pre>;
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
              {file.path}
            </h4>
            <div className="task-diff" role="region" aria-label={file.path} tabIndex={0}>
              <table>
                <tbody>
                  {file.lines.map((line, i) => (
                    <tr key={i} data-change={line.kind}>
                      <td className="task-diff-number">{line.old ?? ""}</td>
                      <td className="task-diff-number">{line.next ?? ""}</td>
                      <td className="task-diff-sign">
                        {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
                      </td>
                      <td className="task-diff-code">{line.text || " "}</td>
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
        <pre className="task-content">{request.body}</pre>
      </TabsContent>
    </Tabs>
  );
}
