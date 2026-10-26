import { z } from "zod";
import { normalizeTaskJson } from "@raypx/core/task-text";
import {
  taskContextSelectionSchema,
  taskContextIdSchema,
  taskContextTargetSchema,
  taskContextSnapshotSchema,
  taskExecutionPrompt,
  type TaskContextSelection,
  type TaskContextSnapshot,
  type TaskContextTarget,
} from "@raypx/core/tasks";
import { ContextError } from "../index.js";
import {
  contextCreateSchema,
  contextUpdateSchema,
  contextArchiveSchema,
  contextDeleteSchema,
  contextHistorySchema,
  contextRestoreSchema,
  type ContextCreateInput,
  type ContextUpdateInput,
  type ContextArchiveInput,
  type ContextDeleteInput,
  type ContextHistoryInput,
  type ContextRestoreInput,
} from "../model.js";
import type { ContextLibraryServiceOptions } from "./types.js";

const getSchema = z.strictObject({ id: taskContextIdSchema });
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const parsed = schema.safeParse(normalizeTaskJson(input));
  if (!parsed.success) throw new ContextError("INVALID_CONTEXT");
  return parsed.data;
};
const matches = (project: TaskContextTarget | null, target: TaskContextTarget) =>
  !project || (project.deviceId === target.deviceId && project.projectId === target.projectId);
const sameProject = (left: TaskContextTarget | null, right: TaskContextTarget | null) =>
  left === right ||
  Boolean(left && right && left.deviceId === right.deviceId && left.projectId === right.projectId);

/** Shared account/device library use cases; persistence, identity and clocks are injected. */
export class ContextLibraryService {
  private readonly now: () => number;
  constructor(private readonly options: ContextLibraryServiceOptions) {
    this.now = options.now ?? Date.now;
  }
  private owner(owner: string) {
    if (!owner) throw new ContextError("AUTH_REQUIRED");
    return owner;
  }
  private async stored<T>(read: () => Promise<T>) {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ContextError) throw error;
      throw new ContextError("CONTEXT_UNAVAILABLE");
    }
  }
  private async project(owner: string, target: TaskContextTarget | null) {
    if (!target || !this.options.validateProject) return;
    try {
      await this.options.validateProject(owner, target);
    } catch (error) {
      if (error instanceof ContextError) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["NOT_FOUND", "FORBIDDEN", "DEVICE_REVOKED", "PROJECT_UNAVAILABLE"].includes(
          String(error.code),
        )
      )
        throw new ContextError("CONTEXT_PROJECT_MISMATCH");
      throw new ContextError("CONTEXT_UNAVAILABLE");
    }
  }
  list(owner: string) {
    this.owner(owner);
    return this.stored(() => this.options.repository.list(owner));
  }
  get(owner: string, value: { id: string }) {
    this.owner(owner);
    const input = parse(getSchema, value);
    return this.stored(() => this.options.repository.get(owner, input.id));
  }
  async create(owner: string, value: ContextCreateInput) {
    this.owner(owner);
    const input = parse(contextCreateSchema, value);
    const previous = await this.stored(() =>
      this.options.repository.findCreation(owner, input.requestId, input.document),
    );
    if (previous) return previous;
    await this.project(owner, input.document.project);
    return this.stored(() =>
      this.options.repository.create(owner, input.requestId, input.document),
    );
  }
  async update(owner: string, value: ContextUpdateInput) {
    this.owner(owner);
    const input = parse(contextUpdateSchema, value);
    const current = await this.stored(() => this.options.repository.get(owner, input.id));
    if (current.revision !== input.revision) throw new ContextError("CONTEXT_CONFLICT");
    if (!sameProject(current.project, input.document.project))
      await this.project(owner, input.document.project);
    return this.stored(() =>
      this.options.repository.update(owner, input.id, input.revision, input.document),
    );
  }
  archive(owner: string, value: ContextArchiveInput) {
    this.owner(owner);
    const input = parse(contextArchiveSchema, value);
    return this.stored(() =>
      this.options.repository.archive(owner, input.id, input.revision, input.archived),
    );
  }
  history(owner: string, value: ContextHistoryInput) {
    this.owner(owner);
    const input = parse(contextHistorySchema, value);
    return this.stored(() =>
      this.options.repository.history(owner, input.id, input.before, input.limit),
    );
  }
  delete(owner: string, value: ContextDeleteInput) {
    this.owner(owner);
    const input = parse(contextDeleteSchema, value);
    return this.stored(() => this.options.repository.delete(owner, input.id, input.revision));
  }
  async restore(owner: string, value: ContextRestoreInput) {
    this.owner(owner);
    const input = parse(contextRestoreSchema, value);
    const current = await this.stored(() => this.options.repository.get(owner, input.id));
    if (current.revision !== input.revision) throw new ContextError("CONTEXT_CONFLICT");
    const version = await this.stored(() =>
      this.options.repository.version(owner, input.id, input.version),
    );
    if (!sameProject(current.project, version.project)) await this.project(owner, version.project);
    return this.stored(() =>
      this.options.repository.restore(owner, input.id, input.revision, input.version),
    );
  }
  async resolve(
    owner: string,
    selection: TaskContextSelection,
    target: TaskContextTarget,
    prompt: string,
  ): Promise<TaskContextSnapshot> {
    this.owner(owner);
    const requested = parse(taskContextSelectionSchema, selection);
    const destination = parse(taskContextTargetSchema, target);
    await this.project(owner, destination);
    const sources = await this.stored(() =>
      this.options.repository.readSources(owner, requested.sources),
    );
    const byId = new Map(sources.map((source) => [source.current.id, source]));
    const snapshot = taskContextSnapshotSchema.parse({
      capturedAt: new Date(this.now()).toISOString(),
      sources: requested.sources.map((reference) => {
        const source = byId.get(reference.id);
        if (
          !source ||
          source.version.id !== reference.id ||
          source.version.revision !== reference.revision
        )
          throw new ContextError("CONTEXT_NOT_FOUND");
        if (source.current.archived) throw new ContextError("CONTEXT_ARCHIVED");
        if (
          !matches(source.current.project, destination) ||
          !matches(source.version.project, destination)
        )
          throw new ContextError("CONTEXT_PROJECT_MISMATCH");
        return {
          id: reference.id,
          revision: reference.revision,
          kind: source.version.kind,
          name: source.version.name,
          content: source.version.content,
          scope: this.options.scope,
          project: source.version.project,
        };
      }),
    });
    try {
      taskExecutionPrompt({ prompt, context: snapshot });
    } catch {
      throw new ContextError("CONTEXT_TOO_LARGE");
    }
    return snapshot;
  }
}
