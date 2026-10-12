import type { ReactNode } from "react";
import { CloudRunControls, CloudRunTimeline } from "@voidmix/agent-ui/runs";
import { SourceList } from "@voidmix/agent-ui/research";
import { Composer } from "@voidmix/agent-ui/composer";
import { MarkdownContent } from "@voidmix/agent-ui/content";
import { isCloudRunTerminal } from "@voidmix/agent-ui/model";
import { Button } from "@voidmix/ui/components/ui/button";
import { useTranslations } from "../../i18n/client";
import { runLabels, runFailureLabel } from "../conversations/labels";
import type { useCloudRunController } from "./use-cloud-run-controller";

export function CloudRunPanel({
  controller,
  writable,
  showOutput,
  files,
}: {
  controller: ReturnType<typeof useCloudRunController>;
  writable: boolean;
  showOutput: boolean;
  files: ReactNode;
}) {
  const t = useTranslations("cloud");
  const { snapshot, pending, commandPending, failed, guidance, setGuidance, capabilities, items } =
    controller;
  const data = snapshot.data;
  const labels = runLabels(t);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {snapshot.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>{t("connection")}</p>
          <Button variant="outline" onClick={controller.reconnect}>
            {t("reconnect")}
          </Button>
        </div>
      ) : null}
      {!data ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : (
        <>
          <CloudRunControls
            status={data.run.status}
            cancelPending={
              data.run.cancelRequested || controller.cancelPending || pending === "cancel"
            }
            pending={Boolean(pending)}
            {...(data.run.error ? { error: runFailureLabel(data.run.error, t) } : {})}
            {...(writable
              ? { onCancel: () => void controller.cancel(), onRetry: () => void controller.retry() }
              : {})}
            labels={labels}
          />
          {failed ? (
            <p role="alert" className="text-sm">
              {t("failed")}
            </p>
          ) : null}
          {showOutput && data.run.output ? <MarkdownContent text={data.run.output} /> : null}
          <SourceList
            sources={data.sources}
            labels={{ title: t("sources"), empty: t("noSources") }}
          />
          {data.historyCursor ? (
            <Button
              variant="outline"
              disabled={snapshot.historyLoading}
              onClick={() => void controller.loadHistory()}
            >
              {snapshot.historyLoading ? t("loading") : t("loadHistory")}
            </Button>
          ) : null}
          {snapshot.historyError ? <p role="alert">{t("failed")}</p> : null}
          <section aria-label={t("execution")}>
            <h3 className="mb-3 text-sm font-semibold">{t("execution")}</h3>
            <CloudRunTimeline items={items} capabilities={capabilities} labels={labels} />
          </section>
          {files}
          {commandPending &&
          data.commands.some(
            (command) => command.type === "steer" && command.status === "pending",
          ) ? (
            <p role="status" className="text-sm">
              {t("guidanceQueued")}
            </p>
          ) : null}
          {writable && !isCloudRunTerminal(data.run.status) && !data.run.cancelRequested ? (
            <Composer
              value={guidance}
              onValueChange={setGuidance}
              pending={pending === "steer" || commandPending}
              onSubmit={controller.steer}
              labels={{
                label: t("guidance"),
                placeholder: t("guidancePlaceholder"),
                submit: t("guide"),
                submitting: t("pending"),
                failed: t("failed"),
                hint: t("hint"),
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
