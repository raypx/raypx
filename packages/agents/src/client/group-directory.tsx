import { useId, useRef, useState, type FormEvent } from "react";
import type { Agent, GroupConversationInput, Conversation } from "@raypx/core/agents";
import type { AgentConversationView, GroupConversationView, GroupsPort } from "../model.js";
import { Avatar, AvatarFallback } from "@raypx/ui/components/ui/avatar";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Input } from "@raypx/ui/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useTranslations } from "./i18n.js";

export function GroupAvatars({ agents }: { agents: readonly Agent[] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {agents.slice(0, 3).map((agent) => (
        <Avatar key={agent.id} size="sm" className="-ml-2 ring-2 ring-background first:ml-0">
          <AvatarFallback>{Array.from(agent.name.trim())[0]?.toUpperCase() ?? ""}</AvatarFallback>
        </Avatar>
      ))}
    </span>
  );
}

export function groupErrorCode(
  error: unknown,
): "GROUP_MIN_AGENTS" | "GROUP_AGENT_NOT_PARTICIPANT" | "GROUP_AGENT_LIMIT" | "saveError" {
  if (typeof error !== "object" || error === null) return "saveError";
  const record = error as {
    code?: unknown;
    data?: { code?: unknown; reasonCode?: unknown; error?: { code?: unknown } };
    message?: unknown;
  };
  for (const value of [
    record.data?.error?.code,
    record.data?.code,
    record.data?.reasonCode,
    record.code,
    record.message,
  ]) {
    if (
      value === "GROUP_MIN_AGENTS" ||
      value === "GROUP_AGENT_NOT_PARTICIPANT" ||
      value === "GROUP_AGENT_LIMIT"
    )
      return value;
  }
  return "saveError";
}

function AgentChoices({
  agents,
  selected,
  disabled,
  onChange,
}: {
  agents: readonly Agent[];
  selected: readonly string[];
  disabled: boolean;
  onChange: (agent: Agent, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex max-h-72 min-w-0 flex-col gap-3 overflow-y-auto py-1">
      {agents.map((agent) => (
        <Field key={agent.id} orientation="horizontal">
          <Checkbox
            id={`${id}-${agent.id}`}
            data-value={agent.id}
            checked={selected.includes(agent.id)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(agent, checked)}
          />
          <FieldLabel htmlFor={`${id}-${agent.id}`} className="min-w-0 flex-1">
            <Avatar size="sm" aria-hidden="true">
              <AvatarFallback>
                {Array.from(agent.name.trim())[0]?.toUpperCase() ?? ""}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate" title={agent.name}>
              {agent.name}
            </span>
          </FieldLabel>
        </Field>
      ))}
    </div>
  );
}

export function GroupForm({
  agents,
  onSave,
  onClose,
}: {
  agents: readonly AgentConversationView[];
  onSave: (input: GroupConversationInput) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Agent["id"][]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReturnType<typeof groupErrorCode> | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim()) return;
    if (selected.length < 2) {
      setError("GROUP_MIN_AGENTS");
      return;
    }
    if (selected.length > 32) {
      setError("GROUP_AGENT_LIMIT");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), agentIds: selected });
    } catch (caught) {
      setError(groupErrorCode(caught));
    } finally {
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
      <DialogContent closeLabel={t("close")} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("groups.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>{t("groups.name")}</FieldLabel>
              <Input
                id={`${id}-name`}
                maxLength={120}
                value={name}
                required
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-3 text-sm font-medium">{t("groups.chooseAgents")}</legend>
              <AgentChoices
                agents={agents.map((item) => item.agent)}
                selected={selected}
                disabled={pending}
                onChange={(agent, checked) =>
                  setSelected((ids) =>
                    checked ? [...ids, agent.id] : ids.filter((value) => value !== agent.id),
                  )
                }
              />
            </fieldset>
          </FieldGroup>
          <p className="text-xs text-muted-foreground">
            {t("groups.count", { count: String(selected.length) })}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive-text">
              {t(error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {t("groups.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GroupParticipants({
  group,
  agents,
  port,
  onChange,
  onDeleted,
}: {
  group: GroupConversationView;
  agents: readonly AgentConversationView[];
  port: GroupsPort;
  onChange: (conversation: Conversation) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [name, setName] = useState(group.conversation.name ?? "");
  const [selected, setSelected] = useState<Agent["id"][]>([]);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<ReturnType<typeof groupErrorCode> | null>(null);
  const confirmation = useConfirmation();
  const selection = { spaceId: group.conversation.spaceId, conversationId: group.conversation.id };
  async function change(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(groupErrorCode(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function removeGroup() {
    const accepted = await confirmation.confirm({
      requestKey: group.conversation.id,
      title: t("groups.deleteTitle", { name: group.conversation.name ?? "" }),
      description: t("groups.deleteDescription"),
      confirmLabel: t("groups.delete"),
      cancelLabel: t("cancel"),
    });
    if (!accepted) return;
    await port.deleteGroup(selection);
    onDeleted();
  }
  const available = agents.filter((item) => !group.conversation.agentIds?.includes(item.agent.id));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form
        className="flex min-w-0 items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void change(async () =>
            onChange(await port.renameGroup({ ...selection, name: name.trim() })),
          );
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor={`${id}-name`}>{t("groups.name")}</FieldLabel>
          <Input
            id={`${id}-name`}
            maxLength={120}
            value={name}
            required
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="outline"
          disabled={pending || !name.trim() || name.trim() === group.conversation.name}
        >
          {t("save")}
        </Button>
      </form>
      <ul className="flex min-w-0 flex-col gap-3">
        {group.agents.map((agent) => (
          <li key={agent.id} className="flex min-w-0 items-center gap-2">
            <Avatar size="sm" aria-hidden="true">
              <AvatarFallback>
                {Array.from(agent.name.trim())[0]?.toUpperCase() ?? ""}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate" title={agent.name}>
              {agent.name}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={t("groups.removeNamed", { name: agent.name })}
              onClick={() =>
                void change(async () =>
                  onChange(await port.removeGroupAgent({ ...selection, agentId: agent.id })),
                )
              }
            >
              {t("groups.remove")}
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">{t("groups.add")}</legend>
          <AgentChoices
            agents={available.map((item) => item.agent)}
            selected={selected}
            disabled={pending}
            onChange={(agent, checked) =>
              setSelected((ids) =>
                checked ? [...ids, agent.id] : ids.filter((value) => value !== agent.id),
              )
            }
          />
          <Button
            variant="outline"
            disabled={pending || selected.length === 0}
            onClick={() =>
              void change(async () => {
                for (const agentId of selected) {
                  const updated = await port.addGroupAgent({ ...selection, agentId });
                  onChange(updated);
                  setSelected((ids) => ids.filter((value) => value !== agentId));
                }
              })
            }
          >
            {t("groups.add")}
          </Button>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(error)}
        </p>
      )}
      <Button variant="outline" disabled={pending} onClick={() => void change(removeGroup)}>
        {t("groups.delete")}
      </Button>
      {confirmation.dialog}
    </div>
  );
}
