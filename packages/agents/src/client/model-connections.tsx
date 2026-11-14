import { SettingsIcon } from "@raypx/icons/settings";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import type { ModelConnection } from "@raypx/core/model-connections";
import type { SpaceMembership } from "../model/port.js";
import {
  ConnectionSecret,
  ModelConnectionsController,
  connectionConfiguration,
  createConnectionDraft,
  type ModelConnectionDraft,
  type ModelConnectionsPort,
} from "../model/model-connections.js";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { SelectField } from "@raypx/ui/select-field";
import { EmptyState } from "@raypx/ui/empty-state";
import { LoadingState } from "@raypx/ui/loading-state";
import { useConfirmation } from "@raypx/ui/confirmation";
import { IconButton } from "@raypx/ui/icon-button";
import { EditIcon } from "@raypx/icons/edit";
import { DeleteIcon } from "@raypx/icons/delete";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { useTranslations } from "./i18n.js";

export function ModelConnections({
  port,
  spaces,
  focus = false,
}: {
  focus?: boolean;
  port: ModelConnectionsPort;
  spaces: { list(input: Record<string, never>): Promise<SpaceMembership[]> };
}) {
  const [controller, setController] = useState<ModelConnectionsController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let next: ModelConnectionsController | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      next = new ModelConnectionsController(port, spaces);
      setController(next);
      void next.load();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [port, spaces]);
  return controller ? <ModelConnectionsEditor controller={controller} focus={focus} /> : null;
}

export function ModelConnectionsEditor({
  controller,
  focus = false,
}: {
  controller: ModelConnectionsController;
  focus?: boolean;
}) {
  const t = useTranslations("agents");
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus && !view.loading) sectionRef.current?.scrollIntoView?.({ block: "start" });
  }, [focus, view.loading]);
  const [editing, setEditing] = useState<ModelConnection | "new" | null>(null);
  const confirmation = useConfirmation();
  async function remove(connection: ModelConnection) {
    const accepted = await confirmation.confirm({
      requestKey: connection.id,
      title: t("connections.deleteTitle", { name: connection.name }),
      description: t("connections.deleteDescription"),
      confirmLabel: t("connections.delete"),
      cancelLabel: t("cancel"),
    });
    if (accepted) await controller.remove(connection.id);
  }
  return (
    <section
      ref={sectionRef}
      id="models"
      aria-labelledby="model-connections-title"
      className="flex min-w-0 flex-col gap-4 border-b border-border py-6"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id="model-connections-title" className="text-lg font-medium">
          {t("connections.title")}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={view.loading || view.busy !== null}
          onClick={() => setEditing("new")}
        >
          {t("connections.add")}
        </Button>
      </div>
      {view.loading && <LoadingState label={t("loading")} />}
      {view.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(`connections.errors.${view.error}`)}
        </p>
      )}
      {view.error === "load" && (
        <Button variant="outline" onClick={() => void controller.load()}>
          {t("refresh")}
        </Button>
      )}
      {!view.loading && !view.error && view.connections.length === 0 && (
        <EmptyState
          title={t("connections.empty")}
          icon={<SettingsIcon aria-hidden="true" />}
          className="py-10"
        />
      )}
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {view.connections.map((connection) => {
          let availability = t("connections.allSpaces");
          if (connection.availability.mode === "selected") {
            const ids = connection.availability.spaceIds;
            availability = ids.length
              ? view.spaces
                  .filter(({ space }) => ids.includes(space.id))
                  .map(({ space }) => space.name)
                  .join(", ")
              : t("connections.noSpaces");
          }
          const testResult = view.testResults[connection.id];
          return (
            <li key={connection.id} className="flex min-w-0 flex-col gap-2 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 font-medium wrap-anywhere">{connection.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={view.busy !== null}
                  onClick={() => void controller.test(connection.id)}
                  aria-label={t("connections.testNamed", { name: connection.name })}
                >
                  {t("connections.test")}
                </Button>
                <IconButton
                  label={t("connections.editNamed", { name: connection.name })}
                  size="icon-sm"
                  disabled={view.busy !== null}
                  onClick={() => setEditing(connection)}
                >
                  <EditIcon aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={t("connections.deleteNamed", { name: connection.name })}
                  size="icon-sm"
                  disabled={view.busy !== null}
                  onClick={() => void remove(connection)}
                >
                  <DeleteIcon aria-hidden="true" />
                </IconButton>
              </div>
              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <dt>{t("connections.kind")}</dt>
                <dd>{t(`connections.kinds.${connection.kind}`)}</dd>
                <dt>{t("connections.models")}</dt>
                <dd className="wrap-anywhere">{connection.models.join(", ")}</dd>
                <dt>{t("connections.availability")}</dt>
                <dd className="wrap-anywhere">{availability}</dd>
              </dl>
              {testResult && (
                <p role="status" className="text-sm">
                  {t(`connections.outcomes.${testResult}`)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <ModelConnectionForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          spaces={view.spaces}
          onClose={() => setEditing(null)}
          onSave={async (draft, secret) => {
            const saved = await controller.save(
              editing === "new" ? null : editing.id,
              draft,
              secret,
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

export function ModelConnectionForm({
  initial,
  spaces,
  onClose,
  onSave,
}: {
  initial: ModelConnection | null;
  spaces: readonly SpaceMembership[];
  onClose: () => void;
  onSave: (
    connection: NonNullable<ReturnType<typeof connectionConfiguration>>,
    secret: string,
  ) => Promise<boolean>;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [draft, setDraft] = useState(() => createConnectionDraft(initial));
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const secret = useMemo(() => new ConnectionSecret(), []);
  const secretInput = useRef<HTMLInputElement | null>(null);
  const bindSecretInput = useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) {
        if (secretInput.current) secretInput.current.value = "";
        secret.clear();
      }
      secretInput.current = input;
    },
    [secret],
  );
  useEffect(() => {
    const input = secretInput.current;
    return () => {
      secret.clear();
      if (input) input.value = "";
    };
  }, [secret]);
  function change(patch: Partial<ModelConnectionDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setInvalid(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const configuration = connectionConfiguration(draft);
    if (!configuration) {
      setInvalid(true);
      return;
    }
    secret.set(secretInput.current?.value ?? "");
    const value = secret.take();
    if (secretInput.current) secretInput.current.value = "";
    if (!initial && !value) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      setFailed(!(await onSave(configuration, value)));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("connections.edit") : t("connections.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
              <Input
                id={`${id}-name`}
                value={draft.name}
                maxLength={120}
                required
                disabled={pending}
                autoComplete="off"
                onChange={(event) => change({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-kind`}>{t("connections.kind")}</FieldLabel>
              <SelectField
                id={`${id}-kind`}
                value={draft.kind}
                options={(
                  ["anthropic", "openai", "google", "openrouter", "compatible"] as const
                ).map((kind) => ({ value: kind, label: t(`connections.kinds.${kind}`) }))}
                disabled={pending}
                onValueChange={(kind) => change({ kind })}
              />
            </Field>
            {draft.kind === "compatible" && (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-url`}>{t("connections.endpoint")}</FieldLabel>
                  <Input
                    id={`${id}-url`}
                    type="url"
                    value={draft.baseUrl}
                    maxLength={2048}
                    required
                    disabled={pending}
                    autoComplete="off"
                    onChange={(event) => change({ baseUrl: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-api`}>{t("connections.protocol")}</FieldLabel>
                  <SelectField
                    id={`${id}-api`}
                    value={draft.api}
                    options={(
                      ["anthropic-messages", "openai-completions", "openai-responses"] as const
                    ).map((api) => ({ value: api, label: t(`connections.protocols.${api}`) }))}
                    disabled={pending}
                    onValueChange={(api) => change({ api })}
                  />
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-models`}>{t("connections.models")}</FieldLabel>
              <Textarea
                id={`${id}-models`}
                value={draft.models}
                rows={3}
                required
                disabled={pending}
                aria-describedby={`${id}-models-hint`}
                onChange={(event) => change({ models: event.target.value })}
              />
              <p className="text-xs text-muted-foreground" id={`${id}-models-hint`}>
                {t("connections.modelsHint")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-secret`}>{t("connections.secret")}</FieldLabel>
              <Input
                ref={bindSecretInput}
                id={`${id}-secret`}
                type="password"
                maxLength={8192}
                required={!initial}
                disabled={pending}
                autoComplete="new-password"
                aria-describedby={initial ? `${id}-secret-hint` : undefined}
              />
              {initial && (
                <p className="text-xs text-muted-foreground" id={`${id}-secret-hint`}>
                  {t("connections.keepSecret")}
                </p>
              )}
            </Field>
            {spaces.length > 1 && (
              <fieldset className="flex min-w-0 flex-col gap-3" disabled={pending}>
                <legend className="mb-3 text-sm font-medium">
                  {t("connections.availability")}
                </legend>
                <RadioGroup
                  value={draft.availability.mode}
                  onValueChange={(mode) => {
                    if (mode === "all") change({ availability: { mode: "all" } });
                    if (mode === "selected")
                      change({ availability: { mode: "selected", spaceIds: [] } });
                  }}
                  disabled={pending}
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem id={`${id}-all`} value="all" />
                    <FieldLabel htmlFor={`${id}-all`}>{t("connections.allSpaces")}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem id={`${id}-selected`} value="selected" />
                    <FieldLabel htmlFor={`${id}-selected`}>
                      {t("connections.selectedSpaces")}
                    </FieldLabel>
                  </Field>
                </RadioGroup>
                {draft.availability.mode === "selected" &&
                  spaces.map(({ space }) => (
                    <Field key={space.id} orientation="horizontal">
                      <Checkbox
                        id={`${id}-${space.id}`}
                        checked={
                          draft.availability.mode === "selected" &&
                          draft.availability.spaceIds.includes(space.id)
                        }
                        disabled={pending}
                        onCheckedChange={(checked) => {
                          if (draft.availability.mode !== "selected") return;
                          change({
                            availability: {
                              mode: "selected",
                              spaceIds: checked
                                ? [...draft.availability.spaceIds, space.id]
                                : draft.availability.spaceIds.filter((entry) => entry !== space.id),
                            },
                          });
                        }}
                      />
                      <FieldLabel htmlFor={`${id}-${space.id}`}>{space.name}</FieldLabel>
                    </Field>
                  ))}
              </fieldset>
            )}
          </FieldGroup>
          {invalid && (
            <p role="alert" className="text-sm text-destructive-text">
              {t("connections.invalid")}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-sm text-destructive-text">
              {t("connections.errors.save")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
