import { activeTaskStatuses } from "@raypx/core/tasks";
import { prepareModelContext } from "@raypx/ai";
import { PiAdapter, type PiSessionOptions } from "@raypx/provider-pi";
import type { TaskFollowUp } from "@raypx/core/tasks";
import type { StateStore } from "../../state";
import type { FileRuntime } from "../../files";
import type { ProcessRuntime } from "../../process";
import { LocalError } from "../../errors";
import { PiModels } from "../../ai/models";
import { SqlitePiContextStore } from "../harness/context/sqlite";
import type { LocalAgentTask } from "../model";
import type { PiExecutionServices, PreparedPiSession } from "./ports";
import { createPiTools } from "./tools";

type FollowUp = TaskFollowUp;
export class PiHost implements PiExecutionServices {
  readonly models: PiModels;
  constructor(
    private readonly state: StateStore,
    private readonly files: FileRuntime,
    private readonly processes: ProcessRuntime,
  ) {
    this.models = new PiModels(state.db);
  }
  async available() {
    try {
      return (await this.models.list()).models.some((model) => model.configured);
    } catch {
      return false;
    }
  }
  inspect(local: LocalAgentTask) {
    if (!local.sessionId?.startsWith("pi:v1:")) return undefined;
    const store = new SqlitePiContextStore(this.state.db, local.sessionId);
    try {
      const context = store.snapshot();
      if (
        !context.identity ||
        context.identity.binding !== local.binding ||
        context.identity.projectId !== local.task.projectId
      )
        throw new LocalError("SESSION_UNAVAILABLE", "Pi context ownership changed.");
      return {
        revision: context.revision,
        model: context.identity.model,
        blocked:
          ((context.pendingEffect || context.messages.length === 0) &&
            !activeTaskStatuses.includes(local.task.status)) ||
          context.status === "uncertain" ||
          context.identity.ownerTaskId !== local.task.id,
        ...(context.pendingEffect ? { pendingEffect: context.pendingEffect } : {}),
      };
    } finally {
      store.close();
    }
  }
  async prepare(
    local: LocalAgentTask,
    parent?: LocalAgentTask,
    follow?: FollowUp,
  ): Promise<PreparedPiSession> {
    const task = local.task;
    const selected = await this.models.resolve(task.model ?? parent?.task.model);
    const sessionId = parent?.sessionId ?? "pi:v1:" + crypto.randomUUID();
    const store = new SqlitePiContextStore(this.state.db, sessionId);
    try {
      let checkpoint = store.snapshot();
      if (parent) {
        const identity = checkpoint.identity;
        if (
          checkpoint.messages.length === 0 ||
          !sessionId.startsWith("pi:v1:") ||
          !identity ||
          identity.binding !== local.binding ||
          identity.projectId !== task.projectId ||
          identity.ownerTaskId !== parent.task.id
        )
          throw new LocalError(
            "SESSION_UNAVAILABLE",
            "Pi conversation cannot be forked from an older run.",
          );
        if (follow?.contextRevision !== checkpoint.revision)
          throw new LocalError("PI_CONTEXT_CONFLICT", "Refresh Pi context before continuing.");
        if (checkpoint.pendingEffect || checkpoint.status === "uncertain")
          throw new LocalError(
            "PI_RECOVERY_REQUIRED",
            "An effect has no confirmed outcome. Inspect it and start a new session.",
          );
        if (
          identity.model.connectionId !== selected.selection.connectionId &&
          (follow.contextTransfer?.revision !== checkpoint.revision ||
            follow.contextTransfer.connectionId !== selected.selection.connectionId)
        )
          throw new LocalError(
            "PI_CONTEXT_TRANSFER_REQUIRED",
            "Confirm transfer of this context to the target connection.",
          );
        if (checkpoint.status === "running") {
          // Lost-owner inference is not replayed. Only a deliberate follow-up can resume safe history.
          checkpoint = { ...checkpoint, status: "failed" };
        }
      }
      try {
        prepareModelContext(checkpoint.messages, selected.model);
      } catch (error) {
        throw new LocalError(
          error instanceof Error && error.message === "AI_CONTEXT_INCOMPATIBLE"
            ? "PI_CONTEXT_INCOMPATIBLE"
            : "PI_CONTEXT_TOO_LARGE",
          "The selected model cannot accept this context.",
        );
      }
      const identity = {
        version: 1 as const,
        binding: local.binding,
        projectId: task.projectId,
        ownerTaskId: task.id,
        model: selected.selection,
      };
      const { revision, ...context } = checkpoint;
      await store.commit(revision, { ...context, identity });
      task.model = selected.selection;
      local.sessionId = sessionId;
      return {
        factory: (_start, ports) => {
          const bridge = createPiTools(
            task.projectId,
            this.files,
            this.processes,
            ports.approval.ask,
          );
          const options: PiSessionOptions = {
            ...selected,
            ...bridge,
            store,
            sessionId,
            close: () => {
              selected.close();
              store.close();
            },
          };
          return new PiAdapter(options, ports);
        },
        dispose: () => {
          selected.close();
          store.close();
        },
      };
    } catch (error) {
      selected.close();
      store.close();
      throw error;
    }
  }
}
