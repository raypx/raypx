import type { AgentId, AgentInput } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import {
  loadAgentCapabilities,
  type AgentCapabilitiesPort,
  type AgentCapabilitySelection,
} from "../model/agent-capabilities.js";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { ModelPicker } from "./model-picker.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import type { OfferedModel } from "../model.js";
import { useTranslations } from "./i18n.js";

export function AgentForm({
  initial,
  models,
  onSave,
  onClose,
  onOpenModels,
  capabilities,
  spaceId,
  agentId,
}: {
  initial: AgentInput | null;
  models: readonly OfferedModel[];
  onSave: (input: AgentInput, selection?: AgentCapabilitySelection) => Promise<void>;
  capabilities?: AgentCapabilitiesPort | undefined;
  spaceId?: SpaceId | undefined;
  agentId?: AgentId | undefined;
  onClose: () => void;
  onOpenModels?: (() => void) | undefined;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [modelId, setModelId] = useState(initial?.model.modelId ?? models[0]?.modelId ?? "");
  const [allowSharedMemory, setAllowSharedMemory] = useState(initial?.allowSharedMemory ?? false);
  const [resources, setResources] = useState<Awaited<
    ReturnType<typeof loadAgentCapabilities>
  > | null>(null);
  const [resourceError, setResourceError] = useState(false);
  const [resourceRefresh, setResourceRefresh] = useState(0);
  // A new Agent gains an ID before capability saves finish. Keep this dialog's
  // edit buffer instead of replacing it with a partially saved server selection.
  const [capabilityAgentId] = useState(agentId);
  const hasCapabilities = !!(capabilities?.skills || capabilities?.mcpServers);
  useEffect(() => {
    if (!capabilities || !spaceId || !hasCapabilities) return;
    let active = true;
    void loadAgentCapabilities(capabilities, spaceId, capabilityAgentId)
      .then((value) => {
        if (active) setResources(value);
      })
      .catch(() => {
        if (active) setResourceError(true);
      });
    return () => {
      active = false;
    };
  }, [capabilities, spaceId, capabilityAgentId, hasCapabilities, resourceRefresh]);
  function toggle(kind: "skillIds" | "serverIds", value: string, checked: boolean) {
    setResources((previous) => {
      if (!previous) return previous;
      const values = previous.selection[kind].filter((entryId) => entryId !== value);
      if (checked) values.push(value);
      return { ...previous, selection: { ...previous.selection, [kind]: values } };
    });
  }
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const modelAllowed =
    models.some((model) => model.modelId === modelId) || initial?.model.modelId === modelId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim() || !modelId || !modelAllowed) return;
    setPending(true);
    setFailed(false);
    try {
      const input: AgentInput = {
        name: name.trim(),
        instructions,
        model: { modelId },
        ...(initial?.allowSharedMemory !== undefined || allowSharedMemory
          ? { allowSharedMemory }
          : {}),
      };
      if (resources) await onSave(input, resources.selection);
      else await onSave(input);
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("editAgent") : t("newAgent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={120}
                required
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-instructions`}>{t("instructions")}</FieldLabel>
              <Textarea
                id={`${id}-instructions`}
                value={instructions}
                maxLength={32_000}
                disabled={pending}
                rows={5}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-model`}>{t("model")}</FieldLabel>
              <ModelPicker
                id={`${id}-model`}
                models={models}
                value={modelId}
                disabled={pending}
                onValueChange={setModelId}
                onOpenModels={onOpenModels}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-shared-memory`}
                checked={allowSharedMemory}
                disabled={pending}
                onCheckedChange={setAllowSharedMemory}
              />
              <FieldLabel htmlFor={`${id}-shared-memory`}>{t("allowSharedMemory")}</FieldLabel>
            </Field>
            {hasCapabilities && !resources && (
              <p role="status" className="text-sm">
                {resourceError ? t("capabilities.loadError") : t("loading")}
              </p>
            )}
            {resourceError && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  setResourceError(false);
                  setResourceRefresh((value) => value + 1);
                }}
              >
                {t("refresh")}
              </Button>
            )}
            {resources && (
              <>
                {capabilities?.skills && (
                  <fieldset className="flex min-w-0 flex-col gap-2" disabled={pending}>
                    <legend className="mb-2 text-sm font-medium">{t("capabilities.skills")}</legend>
                    {!resources.skills.length && (
                      <p className="text-xs text-muted-foreground">{t("capabilities.noSkills")}</p>
                    )}
                    {resources.skills.map((skill) => (
                      <Field key={skill.id} orientation="horizontal">
                        <Checkbox
                          id={`${id}-skill-${skill.id}`}
                          checked={resources.selection.skillIds.includes(skill.id)}
                          onCheckedChange={(checked) => toggle("skillIds", skill.id, checked)}
                        />
                        <FieldLabel
                          htmlFor={`${id}-skill-${skill.id}`}
                          className="min-w-0 wrap-anywhere"
                        >
                          {skill.name}
                          {skill.ownership === "space" && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · {t("capabilities.createdByAgent")}
                            </span>
                          )}
                        </FieldLabel>
                      </Field>
                    ))}
                  </fieldset>
                )}
                {capabilities?.mcpServers && (
                  <fieldset className="flex min-w-0 flex-col gap-2" disabled={pending}>
                    <legend className="mb-2 text-sm font-medium">
                      {t("capabilities.servers")}
                    </legend>
                    {!resources.servers.length && (
                      <p className="text-xs text-muted-foreground">{t("capabilities.noServers")}</p>
                    )}
                    {resources.servers.map((server) => (
                      <Field key={server.id} orientation="horizontal">
                        <Checkbox
                          id={`${id}-server-${server.id}`}
                          checked={resources.selection.serverIds.includes(server.id)}
                          onCheckedChange={(checked) => toggle("serverIds", server.id, checked)}
                        />
                        <FieldLabel
                          htmlFor={`${id}-server-${server.id}`}
                          className="min-w-0 wrap-anywhere"
                        >
                          {server.name}
                        </FieldLabel>
                      </Field>
                    ))}
                  </fieldset>
                )}
              </>
            )}
          </FieldGroup>
          {failed && (
            <p role="alert" className="text-sm text-destructive-text">
              {t("saveError")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                !name.trim() ||
                !modelId ||
                !modelAllowed ||
                (hasCapabilities && !resources)
              }
            >
              {initial ? t("save") : t("createAgent")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
