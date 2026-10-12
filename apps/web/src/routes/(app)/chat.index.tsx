import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { cloudQueries } from "../../lib/cloud-queries";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { CloudAssetVersionDto } from "@voidmix/contracts";
import { InputAttachments } from "../../features/files/input-attachments";
import { uploadInputFile } from "../../features/files/upload";
import { Composer } from "@voidmix/agent-ui/composer";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { PageHeader } from "@voidmix/ui/page-header";
import { useTranslations } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import { createWebApiClient } from "../../lib/api-client";
import { captureProductEvent } from "../../lib/product-telemetry";
import {
  RouteError,
  RoutePending,
  PageNavigation,
  pageSearch,
} from "../../features/navigation/route-state";
export const Route = createFileRoute("/(app)/chat/")({
  validateSearch: pageSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const queries = cloudQueries(context, createRouteApiClient());
    await Promise.all([
      context.queryClient.ensureQueryData(queries.conversations(deps.cursor)),
      context.queryClient.ensureQueryData(queries.capabilities()),
      context.queryClient.ensureQueryData(queries.projects()),
    ]);
    return { accountId: context.accountId };
  },
  component: ChatPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
function ChatPage() {
  const data = Route.useLoaderData();
  return <NewConversation key={data.accountId} />;
}
function NewConversation() {
  const { queries, identity, resources, queryClient } = useCloudQueries();
  const { data: conversationPage } = useSuspenseQuery(
    queries.conversations(Route.useSearch().cursor),
  );
  const { data: capabilities } = useSuspenseQuery({
    ...queries.capabilities(),
    refetchInterval: 15_000,
  });
  const { data: projectPage } = useSuspenseQuery(queries.projects());
  const { items: conversations, nextCursor } = conversationPage;
  const projects = projectPage.items;
  const t = useTranslations("cloud");
  const p = useTranslations("projects");
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const api = useMemo(() => createWebApiClient(), []);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"search" | "computer">("search");
  const [projectId, setProjectId] = useState("");
  const [attachments, setAttachments] = useState<CloudAssetVersionDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const uploadIntents = useRef(new Map<string, string>());
  const intent = useRef<{ fingerprint: string; key: string; conversationId?: string } | null>(null);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  async function send(prompt: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    const fingerprint = JSON.stringify({
      prompt,
      mode,
      projectId,
      attachmentIds: attachments.map((asset) => asset.id),
    });
    if (intent.current?.fingerprint !== fingerprint)
      intent.current = { fingerprint, key: crypto.randomUUID() };
    const pending = intent.current;
    if (!pending.conversationId) {
      const conversation = await api.cloud.conversations.create(
        {
          title: prompt.slice(0, 200),
          idempotencyKey: pending.key,
          ...(projectId ? { projectId } : {}),
        },
        { signal },
      );
      if (signal.aborted) return;
      pending.conversationId = conversation.id;
    }
    const result = await api.cloud.conversations.sendTurn(
      {
        conversationId: pending.conversationId,
        prompt,
        mode,
        attachmentIds: attachments.map((asset) => asset.id),
        idempotencyKey: pending.key,
      },
      { signal },
    );
    if (signal.aborted) return;
    resources.markCreated(identity.accountId, result.run.id);
    void queryClient.invalidateQueries({ queryKey: queries.conversations().queryKey.slice(0, 5) });
    captureProductEvent("turn_sent", { mode });
    if (result.task) captureProductEvent("task_created", { mode });
    await navigate({
      to: "/chat/$conversationId",
      params: { conversationId: pending.conversationId },
    });
  }
  async function upload(file: File) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || uploading) return;
    setUploading(true);
    setUploadFailed(false);
    try {
      const asset = await uploadInputFile(
        api,
        file,
        signal,
        projectId || undefined,
        uploadIntents.current,
      );
      if (!signal.aborted) setAttachments((items) => [...items, asset]);
    } catch {
      if (!signal.aborted) setUploadFailed(true);
    } finally {
      if (!signal.aborted) setUploading(false);
    }
  }
  const disabledReason = !capabilities[mode]
    ? t("capabilityOff")
    : capabilities.unavailableReason
      ? t("unavailable")
      : uploading
        ? t("uploading")
        : undefined;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <PageHeader title={t("title")} description={t("description")} />
      <section className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="new-mode">{t("mode")}</FieldLabel>
            <select
              id="new-mode"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={mode}
              onChange={(event) => setMode(event.target.value as "search" | "computer")}
            >
              <option value="search" disabled={!capabilities.search}>
                {t("search")}
              </option>
              <option value="computer" disabled={!capabilities.computer}>
                {t("computer")}
              </option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="new-scope">{p("ownership")}</FieldLabel>
            <select
              id="new-scope"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={projectId}
              disabled={uploading}
              onChange={(event) => {
                setProjectId(event.target.value);
                setAttachments([]);
              }}
            >
              <option value="">{p("personal")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <InputAttachments
          attachments={attachments}
          uploading={uploading}
          failed={uploadFailed}
          onUpload={(file) => void upload(file)}
          onRemove={(id) => setAttachments((items) => items.filter((asset) => asset.id !== id))}
        />
        <Composer
          value={draft}
          onValueChange={setDraft}
          onSubmit={send}
          {...(disabledReason ? { disabledReason } : {})}
          labels={{
            label: t("prompt"),
            placeholder: t("placeholder"),
            submit: t("submit"),
            submitting: t("submitting"),
            failed: t("failed"),
            hint: t("hint"),
          }}
        />
      </section>
      <section aria-label={t("conversations")}>
        <h2 className="mb-4 text-sm font-semibold">{t("conversations")}</h2>
        {conversations.length ? (
          <ul className="divide-y divide-border border-y border-border">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  to="/chat/$conversationId"
                  params={{ conversationId: conversation.id }}
                  className="block py-4 text-sm hover:underline wrap-anywhere"
                >
                  {conversation.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
        )}
        <PageNavigation
          cursor={search.cursor}
          nextCursor={nextCursor}
          onNavigate={(cursor) => void navigate({ search: cursor ? { cursor } : {} })}
        />
      </section>
    </div>
  );
}
