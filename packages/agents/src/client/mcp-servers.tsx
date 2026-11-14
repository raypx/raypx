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
import type {
  McpServer,
  McpServerConfiguration,
  McpCredentialHeaders,
} from "@raypx/core/mcp-servers";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
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
  McpServersController,
  McpHeaderSecret,
  createMcpServerDraft,
  type McpServersPort,
} from "../model/mcp-servers.js";
import type { SpaceMembership } from "../model/port.js";
import { useTranslations } from "./i18n.js";

export function McpServers({
  port,
  spaces,
}: {
  port: McpServersPort;
  spaces: { list(input: Record<string, never>): Promise<SpaceMembership[]> };
}) {
  const [controller, setController] = useState<McpServersController | null>(null);
  useEffect(() => {
    let active = true;
    const next = new McpServersController(port, spaces);
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
  }, [port, spaces]);
  return controller ? <McpServersEditor controller={controller} /> : null;
}
export function McpServersEditor({ controller }: { controller: McpServersController }) {
  const t = useTranslations("agents");
  const id = useId();
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [editing, setEditing] = useState<McpServer | "new" | null>(null);
  const confirmation = useConfirmation();
  async function remove(server: McpServer) {
    const accepted = await confirmation.confirm({
      requestKey: server.id,
      title: t("mcp.deleteTitle", { name: server.name }),
      description: t("mcp.deleteDescription"),
      confirmLabel: t("mcp.delete"),
      cancelLabel: t("cancel"),
    });
    if (accepted) await controller.remove(server.id);
  }
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-medium">
          {t("mcp.title")}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={view.loading || !!view.busy}
          onClick={() => setEditing("new")}
        >
          {t("mcp.add")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("mcp.approvalHint")}</p>
      {view.loading && <LoadingState label={t("loading")} />}
      {view.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(`mcp.errors.${view.error}`)}
        </p>
      )}
      {view.error === "load" && (
        <Button variant="outline" className="self-start" onClick={() => void controller.load()}>
          {t("refresh")}
        </Button>
      )}
      {!view.loading && !view.servers.length && (
        <EmptyState
          title={t("mcp.empty")}
          icon={<GlobalIcon aria-hidden="true" />}
          className="py-10"
        />
      )}
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {view.servers.map((server) => {
          const result = view.results[server.id];
          let availability = t("mcp.allSpaces");
          if (server.availability.mode === "selected") {
            const selected = server.availability.spaceIds;
            availability =
              view.spaces
                .filter(({ space }) => selected.includes(space.id))
                .map(({ space }) => space.name)
                .join(", ") || t("mcp.noSpaces");
          }
          return (
            <li key={server.id} className="flex min-w-0 flex-col gap-2 py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium wrap-anywhere">{server.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!view.busy}
                  onClick={() => void controller.test(server.id)}
                >
                  {t("mcp.test")}
                </Button>
                <IconButton
                  size="icon-sm"
                  label={t("mcp.edit", { name: server.name })}
                  disabled={!!view.busy}
                  onClick={() => setEditing(server)}
                >
                  <EditIcon aria-hidden="true" />
                </IconButton>
                <IconButton
                  size="icon-sm"
                  label={t("mcp.delete")}
                  disabled={!!view.busy}
                  onClick={() => void remove(server)}
                >
                  <DeleteIcon aria-hidden="true" />
                </IconButton>
              </div>
              <p className="text-xs text-muted-foreground wrap-anywhere">{server.url}</p>
              <p className="text-xs text-muted-foreground">
                {t("mcp.availability")}: {availability}
              </p>
              <p role="status" className="text-sm">
                {result ? t(`mcp.outcomes.${result.code}`) : t("mcp.notTested")}
              </p>
              {result && result.toolNames.length > 0 && (
                <ul aria-label={t("mcp.tools")} className="flex min-w-0 flex-col gap-1 text-xs">
                  {result.toolNames.map((name) => (
                    <li key={name} className="font-mono wrap-anywhere">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <McpServerForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          spaces={view.spaces}
          onClose={() => setEditing(null)}
          onSave={async (server, headers) => {
            const saved = await controller.save(
              editing === "new" ? null : editing.id,
              server,
              headers,
            );
            if (saved) setEditing(null);
            return saved;
          }}
        />
      )}
      {confirmation.dialog}
    </section>
  );
}
export function McpServerForm({
  initial,
  spaces,
  onClose,
  onSave,
}: {
  initial: McpServer | null;
  spaces: readonly SpaceMembership[];
  onClose: () => void;
  onSave: (server: McpServerConfiguration, headers?: McpCredentialHeaders) => Promise<boolean>;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [draft, setDraft] = useState(() => createMcpServerDraft(initial));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"headers" | "url" | "save" | "MCP_STDIO_UNSUPPORTED" | null>(
    null,
  );
  const [secret] = useState(() => new McpHeaderSecret());
  const headerInput = useRef<HTMLTextAreaElement>(null);
  const bindHeaderInput = useCallback(
    (input: HTMLTextAreaElement | null) => {
      if (!input) {
        secret.clear();
        if (headerInput.current) headerInput.current.value = "";
      }
      headerInput.current = input;
    },
    [secret],
  );
  useEffect(
    () => () => {
      secret.clear();
    },
    [secret],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    let headers: McpCredentialHeaders | undefined;
    try {
      headers = secret.take();
    } catch {
      setError("headers");
      return;
    } finally {
      if (headerInput.current) headerInput.current.value = "";
    }
    if (/^(stdio:|command:)/i.test(draft.url.trim())) {
      setError("MCP_STDIO_UNSUPPORTED");
      return;
    }
    try {
      const url = new URL(draft.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      setError("url");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (
        !(await onSave(
          { ...draft, name: draft.name.trim(), url: draft.url.trim(), transport: "http" },
          headers,
        ))
      )
        setError("save");
    } catch {
      setError("save");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          secret.clear();
          if (headerInput.current) headerInput.current.value = "";
          onClose();
        }
      }}
    >
      <DialogContent closeLabel={t("close")} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? t("mcp.edit", { name: initial.name }) : t("mcp.add")}
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
              <FieldLabel htmlFor={`${id}-url`}>{t("mcp.url")}</FieldLabel>
              <Input
                id={`${id}-url`}
                autoComplete="off"
                value={draft.url}
                maxLength={2048}
                required
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-per-call-header`}>
                {t("protectedInput.secretHeader")}
              </FieldLabel>
              <Input
                id={`${id}-per-call-header`}
                autoComplete="off"
                value={draft.perCallSecretHeader ?? ""}
                maxLength={128}
                disabled={pending}
                onChange={(event) =>
                  setDraft({ ...draft, perCallSecretHeader: event.target.value || null })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-headers`}>{t("mcp.headers")}</FieldLabel>
              <Textarea
                ref={bindHeaderInput}
                id={`${id}-headers`}
                autoComplete="off"
                rows={3}
                maxLength={16384}
                disabled={pending}
                onChange={(event) => secret.set(event.target.value)}
                aria-describedby={`${id}-headers-hint`}
              />
              <p id={`${id}-headers-hint`} className="text-xs text-muted-foreground">
                {t("mcp.headersHint")}
              </p>
            </Field>
            {spaces.length > 1 && (
              <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">{t("mcp.availability")}</legend>
                <RadioGroup
                  value={draft.availability.mode}
                  onValueChange={(mode) => {
                    if (mode === "all") setDraft({ ...draft, availability: { mode } });
                    if (mode === "selected")
                      setDraft({ ...draft, availability: { mode, spaceIds: [] } });
                  }}
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem id={`${id}-all`} value="all" data-value="all" />
                    <FieldLabel htmlFor={`${id}-all`}>{t("mcp.allSpaces")}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem id={`${id}-selected`} value="selected" data-value="selected" />
                    <FieldLabel htmlFor={`${id}-selected`}>{t("mcp.selectedSpaces")}</FieldLabel>
                  </Field>
                </RadioGroup>
                {draft.availability.mode === "selected" &&
                  spaces.map(({ space }) => {
                    const selected =
                      draft.availability.mode === "selected" ? draft.availability.spaceIds : [];
                    return (
                      <Field key={space.id} orientation="horizontal">
                        <Checkbox
                          id={`${id}-${space.id}`}
                          checked={selected.includes(space.id)}
                          onCheckedChange={(checked) =>
                            setDraft({
                              ...draft,
                              availability: {
                                mode: "selected",
                                spaceIds: checked
                                  ? [...selected, space.id]
                                  : selected.filter((value) => value !== space.id),
                              },
                            })
                          }
                        />
                        <FieldLabel htmlFor={`${id}-${space.id}`}>{space.name}</FieldLabel>
                      </Field>
                    );
                  })}
              </fieldset>
            )}
          </FieldGroup>
          {error && (
            <p role="alert" className="text-sm text-destructive-text">
              {t(`mcp.errors.${error}`)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !draft.name.trim() || !draft.url.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
