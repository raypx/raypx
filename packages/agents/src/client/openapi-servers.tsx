import { EmptyState } from "@raypx/ui/empty-state";
import { GlobalIcon } from "@raypx/icons/global";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import type { AgentId } from "@raypx/core/agents";
import type {
  OpenApiCredential,
  OpenApiServer,
  OpenApiServerConfiguration,
} from "@raypx/core/openapi-servers";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@raypx/ui/components/ui/dialog";
import { LoadingState } from "@raypx/ui/loading-state";
import { IconButton } from "@raypx/ui/icon-button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { EditIcon } from "@raypx/icons/edit";
import { DeleteIcon } from "@raypx/icons/delete";
import {
  OpenApiServersController,
  OpenApiSecret,
  createOpenApiServerDraft,
  type OpenApiServersPort,
  type OpenApiDirectoryPort,
} from "../model/openapi-servers.js";
import { useTranslations } from "./i18n.js";

export function OpenApiServers({
  port,
  spaces,
  agents,
}: { port: OpenApiServersPort } & OpenApiDirectoryPort) {
  const [controller, setController] = useState<OpenApiServersController | null>(null);
  useEffect(() => {
    let active = true;
    const next = new OpenApiServersController(port, { spaces, agents });
    queueMicrotask(() => {
      if (active) {
        setController(next);
        void next.load();
      }
    });
    return () => {
      active = false;
      next.dispose();
    };
  }, [port, spaces, agents]);
  return controller ? <OpenApiServersEditor controller={controller} /> : null;
}
export function OpenApiServersEditor({ controller }: { controller: OpenApiServersController }) {
  const t = useTranslations("agents");
  const id = useId();
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [editing, setEditing] = useState<OpenApiServer | "new" | null>(null);
  const confirmation = useConfirmation();
  async function remove(server: OpenApiServer) {
    const accepted = await confirmation.confirm({
      requestKey: server.id,
      title: t("openapi.deleteTitle", { name: server.name }),
      description: t("openapi.deleteDescription"),
      confirmLabel: t("openapi.delete"),
      cancelLabel: t("cancel"),
    });
    if (accepted) await controller.remove(server.id);
  }
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-openapi-management
      className="flex min-w-0 flex-col gap-4 border-t py-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-medium">
          {t("openapi.title")}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={view.loading || !!view.busy || !view.spaceId}
          onClick={() => setEditing("new")}
        >
          {t("openapi.add")}
        </Button>
      </div>
      {view.loading && <LoadingState label={t("loading")} />}
      {!view.loading && !view.spaces.length && (
        <p className="text-sm text-muted-foreground">{t("openapi.ownerOnly")}</p>
      )}
      {view.spaces.length > 0 && (
        <Field>
          <FieldLabel htmlFor={`${id}-space`}>{t("openapi.space")}</FieldLabel>
          <Select
            value={view.spaceId}
            disabled={view.loading || !!view.busy}
            items={view.spaces.map(({ space }) => ({ value: space.id, label: space.name }))}
            onValueChange={(value) => {
              if (value) {
                setEditing(null);
                void controller.selectSpace(value);
              }
            }}
          >
            <SelectTrigger id={`${id}-space`} className="w-full min-w-0">
              <SelectValue className="min-w-0" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {view.spaces.map(({ space }) => (
                  <SelectItem key={space.id} value={space.id} data-value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {view.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(`openapi.errors.${view.error}`)}
        </p>
      )}
      {view.error === "load" && (
        <Button variant="outline" className="self-start" onClick={() => void controller.load()}>
          {t("refresh")}
        </Button>
      )}
      {!view.loading && view.spaceId && !view.servers.length && (
        <EmptyState
          title={t("openapi.empty")}
          icon={<GlobalIcon aria-hidden="true" />}
          className="py-10"
        />
      )}
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {view.servers.map((server) => {
          const result = view.results[server.id];
          let availability = t("openapi.allAgents");
          if (server.availability.mode === "selected") {
            const selected = server.availability.agentIds;
            availability =
              view.agents
                .filter((agent) => selected.includes(agent.id))
                .map((agent) => agent.name)
                .join(", ") || t("openapi.noAgents");
          }
          return (
            <li
              key={server.id}
              data-openapi-server={server.id}
              className="flex min-w-0 flex-col gap-2 py-4"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 basis-full font-medium wrap-anywhere sm:basis-auto">
                  {server.name}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!view.busy}
                  onClick={() => void controller.test(server.id)}
                >
                  {t("openapi.test")}
                </Button>
                <IconButton
                  size="icon-sm"
                  label={t("openapi.edit", { name: server.name })}
                  disabled={!!view.busy}
                  onClick={() => setEditing(server)}
                >
                  <EditIcon aria-hidden="true" />
                </IconButton>
                <IconButton
                  size="icon-sm"
                  label={t("openapi.delete")}
                  disabled={!!view.busy}
                  onClick={() => void remove(server)}
                >
                  <DeleteIcon aria-hidden="true" />
                </IconButton>
              </div>
              <p className="text-xs text-muted-foreground wrap-anywhere">{server.url}</p>
              <p className="text-xs text-muted-foreground">
                {t("openapi.availability")}: {availability}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("openapi.selectedCount", { count: server.selectedOperationIds.length })} ·{" "}
                {t(server.hasCredentials ? "openapi.credentialsStored" : "openapi.noCredentials")}
              </p>
              {server.selectedOperationIds.length > 0 && (
                <ul
                  aria-label={t("openapi.operations")}
                  className="flex min-w-0 flex-col gap-1 text-xs"
                >
                  {server.operations
                    .filter((operation) =>
                      server.selectedOperationIds.includes(operation.operationId),
                    )
                    .map((operation) => (
                      <li key={operation.operationId} className="wrap-anywhere">
                        <span className="font-mono">{operation.method}</span> {operation.label} ·{" "}
                        {t(operation.readOnly ? "openapi.readOnly" : "openapi.mutating")}
                      </li>
                    ))}
                </ul>
              )}
              {result && (
                <p role="status" className="text-sm">
                  {t(`openapi.outcomes.${result.code}`)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <OpenApiServerForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          agents={view.agents}
          onClose={() => setEditing(null)}
          onSave={async (server, source, credential) => {
            const saved = await controller.save(
              editing === "new" ? null : editing.id,
              server,
              source,
              credential,
            );
            if (saved) setEditing(editing === "new" ? saved : null);
            return !!saved;
          }}
        />
      )}
      {confirmation.dialog}
    </section>
  );
}

type Source = { document: string } | { url: string };
export function OpenApiServerForm({
  initial,
  agents,
  onClose,
  onSave,
}: {
  initial: OpenApiServer | null;
  agents: readonly { id: AgentId; name: string }[];
  onClose: () => void;
  onSave: (
    server: OpenApiServerConfiguration,
    source?: Source,
    credential?: OpenApiCredential,
  ) => Promise<boolean>;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [draft, setDraft] = useState(() => createOpenApiServerDraft(initial));
  const [sourceKind, setSourceKind] = useState<"document" | "url">("document");
  const [document, setDocument] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [credentialKind, setCredentialKind] = useState<"keep" | "none" | "bearer" | "apiKey">(
    initial ? "keep" : "none",
  );
  const [header, setHeader] = useState("X-API-Key");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"credential" | "url" | "document" | "save" | null>(null);
  const [secret] = useState(() => new OpenApiSecret());
  const secretInput = useRef<HTMLInputElement>(null);
  const bindSecretInput = useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) {
        secret.clear();
        if (secretInput.current) secretInput.current.value = "";
      }
      secretInput.current = input;
    },
    [secret],
  );
  useEffect(() => () => secret.clear(), [secret]);
  function clearSecret() {
    secret.clear();
    if (secretInput.current) secretInput.current.value = "";
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    let credential: OpenApiCredential | undefined;
    try {
      credential = secret.take(credentialKind, header.trim());
    } catch {
      setError("credential");
      return;
    } finally {
      if (secretInput.current) secretInput.current.value = "";
    }
    try {
      const url = new URL(draft.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      if (!initial && sourceKind === "url") {
        const sourceUrl = new URL(documentUrl);
        if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") throw new Error();
      }
    } catch {
      setError("url");
      return;
    }
    if (!initial && sourceKind === "document") {
      if (!document.trim()) {
        setError("document");
        return;
      }
    }
    let source: Source | undefined;
    if (!initial) source = sourceKind === "document" ? { document } : { url: documentUrl.trim() };
    setPending(true);
    setError(null);
    try {
      if (
        !(await onSave(
          { ...draft, name: draft.name.trim(), url: draft.url.trim() },
          source,
          credential,
        ))
      )
        setError("save");
    } catch {
      setError("save");
    } finally {
      setPending(false);
    }
  }
  const credentialOptions = [
    ...(initial ? [{ value: "keep", label: t("openapi.keepCredentials") }] : []),
    { value: "none", label: t("openapi.noCredentials") },
    { value: "bearer", label: t("openapi.bearer") },
    { value: "apiKey", label: t("openapi.apiKey") },
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          clearSecret();
          onClose();
        }
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
        data-openapi-form
      >
        <DialogHeader>
          <DialogTitle>
            {initial ? t("openapi.edit", { name: initial.name }) : t("openapi.add")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
              <Input
                id={`${id}-name`}
                autoComplete="off"
                value={draft.name}
                maxLength={120}
                required
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-url`}>{t("openapi.url")}</FieldLabel>
              <Input
                id={`${id}-url`}
                autoComplete="off"
                value={draft.url}
                maxLength={2048}
                required
                disabled={pending || !!initial}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
            </Field>
            {!initial && (
              <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">{t("openapi.source")}</legend>
                <RadioGroup
                  value={sourceKind}
                  onValueChange={(kind) => {
                    if (kind === "document" || kind === "url") setSourceKind(kind);
                  }}
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem id={`${id}-paste`} value="document" data-value="document" />
                    <FieldLabel htmlFor={`${id}-paste`}>{t("openapi.paste")}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem id={`${id}-fetch`} value="url" data-value="url" />
                    <FieldLabel htmlFor={`${id}-fetch`}>{t("openapi.fetch")}</FieldLabel>
                  </Field>
                </RadioGroup>
                {sourceKind === "document" ? (
                  <Field>
                    <FieldLabel htmlFor={`${id}-document`}>{t("openapi.document")}</FieldLabel>
                    <Textarea
                      id={`${id}-document`}
                      autoComplete="off"
                      value={document}
                      maxLength={262144}
                      rows={6}
                      required
                      onChange={(event) => setDocument(event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor={`${id}-document-url`}>
                      {t("openapi.documentUrl")}
                    </FieldLabel>
                    <Input
                      id={`${id}-document-url`}
                      autoComplete="off"
                      value={documentUrl}
                      maxLength={2048}
                      required
                      onChange={(event) => setDocumentUrl(event.target.value)}
                    />
                  </Field>
                )}
                <p className="text-xs text-muted-foreground">{t("openapi.sourceHint")}</p>
              </fieldset>
            )}
            {initial && (
              <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">{t("openapi.operations")}</legend>
                <p className="text-xs text-muted-foreground">{t("openapi.operationsHint")}</p>
                {initial.operations.map((operation) => (
                  <Field key={operation.operationId} orientation="horizontal">
                    <Checkbox
                      id={`${id}-operation-${operation.operationId}`}
                      checked={draft.selectedOperationIds.includes(operation.operationId)}
                      onCheckedChange={(checked) =>
                        setDraft({
                          ...draft,
                          selectedOperationIds: checked
                            ? [...draft.selectedOperationIds, operation.operationId]
                            : draft.selectedOperationIds.filter(
                                (value) => value !== operation.operationId,
                              ),
                        })
                      }
                    />
                    <FieldLabel
                      htmlFor={`${id}-operation-${operation.operationId}`}
                      className="min-w-0 flex-1 flex-col items-start gap-1"
                    >
                      <span className="wrap-anywhere">{operation.label}</span>
                      <span className="font-mono text-xs text-muted-foreground wrap-anywhere">
                        {operation.method} {operation.path} ·{" "}
                        {t(operation.readOnly ? "openapi.readOnly" : "openapi.mutating")}
                      </span>
                    </FieldLabel>
                  </Field>
                ))}
              </fieldset>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-credential-kind`}>{t("openapi.credentials")}</FieldLabel>
              <Select
                value={credentialKind}
                disabled={pending}
                items={credentialOptions}
                onValueChange={(value) => {
                  if (
                    value === "keep" ||
                    value === "none" ||
                    value === "bearer" ||
                    value === "apiKey"
                  ) {
                    clearSecret();
                    setCredentialKind(value);
                  }
                }}
              >
                <SelectTrigger id={`${id}-credential-kind`} className="w-full min-w-0">
                  <SelectValue className="min-w-0" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {credentialOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} data-value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {credentialKind === "apiKey" && (
              <Field>
                <FieldLabel htmlFor={`${id}-header`}>{t("openapi.header")}</FieldLabel>
                <Input
                  id={`${id}-header`}
                  value={header}
                  maxLength={128}
                  autoComplete="off"
                  disabled={pending}
                  onChange={(event) => setHeader(event.target.value)}
                />
              </Field>
            )}
            {(credentialKind === "apiKey" || credentialKind === "bearer") && (
              <Field>
                <FieldLabel htmlFor={`${id}-credential`}>{t("openapi.secret")}</FieldLabel>
                <Input
                  ref={bindSecretInput}
                  id={`${id}-credential`}
                  type="password"
                  autoComplete="new-password"
                  maxLength={8192}
                  disabled={pending}
                  required
                  onChange={(event) => secret.set(event.target.value)}
                  aria-describedby={`${id}-secret-hint`}
                />
                <p id={`${id}-secret-hint`} className="text-xs text-muted-foreground">
                  {t("openapi.secretHint")}
                </p>
              </Field>
            )}
            <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">{t("openapi.availability")}</legend>
              <RadioGroup
                value={draft.availability.mode}
                onValueChange={(mode) => {
                  if (mode === "all") setDraft({ ...draft, availability: { mode } });
                  if (mode === "selected")
                    setDraft({ ...draft, availability: { mode, agentIds: [] } });
                }}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem id={`${id}-all`} value="all" data-value="all" />
                  <FieldLabel htmlFor={`${id}-all`}>{t("openapi.allAgents")}</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id={`${id}-selected`} value="selected" data-value="selected" />
                  <FieldLabel htmlFor={`${id}-selected`}>{t("openapi.selectedAgents")}</FieldLabel>
                </Field>
              </RadioGroup>
              {draft.availability.mode === "selected" &&
                agents.map((agent) => {
                  const selected =
                    draft.availability.mode === "selected" ? draft.availability.agentIds : [];
                  return (
                    <Field key={agent.id} orientation="horizontal">
                      <Checkbox
                        id={`${id}-agent-${agent.id}`}
                        checked={selected.includes(agent.id)}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            availability: {
                              mode: "selected",
                              agentIds: checked
                                ? [...selected, agent.id]
                                : selected.filter((value) => value !== agent.id),
                            },
                          })
                        }
                      />
                      <FieldLabel htmlFor={`${id}-agent-${agent.id}`}>{agent.name}</FieldLabel>
                    </Field>
                  );
                })}
            </fieldset>
          </FieldGroup>
          {error && (
            <p role="alert" className="text-sm text-destructive-text">
              {t(`openapi.errors.${error}`)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                clearSecret();
                onClose();
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !draft.name.trim() || !draft.url.trim()}>
              {t(initial ? "save" : "openapi.import")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
