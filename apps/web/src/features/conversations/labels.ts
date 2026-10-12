import type { CloudRunLabels } from "@voidmix/agent-ui/runs";
import type { WebTranslator } from "../../i18n/client";
export function runLabels(t: WebTranslator<"cloud">): CloudRunLabels {
  return {
    status: {
      queued: t("queued"),
      running: t("running"),
      needs_input: t("needs_input"),
      succeeded: t("succeeded"),
      failed: t("failedStatus"),
      cancelled: t("cancelled"),
    },
    cancel: t("cancel"),
    pending: t("pending"),
    retry: t("retry"),
    loading: t("loading"),
    failed: t("failed"),
    input: t("toolInput"),
    output: t("toolOutput"),
    execution: t("execution"),
  };
}
export function taskLabels(t: WebTranslator<"cloud">) {
  return {
    open: t("open"),
    in_progress: t("in_progress"),
    waiting_input: t("waiting_input"),
    review: t("review"),
    completed: t("completed"),
    cancelled: t("cancelled"),
  };
}

/** Only stable host failure codes cross the display boundary; unknown provider text stays private. */
export function runFailureLabel(code: string, t: WebTranslator<"cloud">): string {
  const labels = {
    MODEL_UNAVAILABLE: "modelUnavailable",
    SEARCH_UNAVAILABLE: "searchUnavailable",
    STORAGE_UNAVAILABLE: "storageUnavailable",
    DOCUMENT_RENDERER_UNAVAILABLE: "documentUnavailable",
    SOURCE_EVIDENCE_INVALID: "sourceInvalid",
    BUDGET_EXCEEDED: "budgetExceeded",
    EXECUTION_FAILED: "failed",
    interrupted: "interrupted",
    access_revoked: "accessRevoked",
  } as const;
  const key = Object.hasOwn(labels, code) ? labels[code as keyof typeof labels] : undefined;
  return t(key ?? "failed");
}
