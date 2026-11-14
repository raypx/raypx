import type { Routine, RoutineHistory } from "@raypx/core/routines";
import {
  createRoutineForm,
  routineFormInput,
  routineErrorKey,
  type RoutineFormState,
  type RoutinesPort,
  type RoutineSecrets,
} from "@raypx/jobs/model";

export interface MobileRoutinesState {
  routines: Routine[];
  loading: boolean;
  busy: boolean;
  error: ReturnType<typeof routineErrorKey> | null;
  editor: { current: Routine | null; form: RoutineFormState } | null;
  history: { routine: Routine; entries: RoutineHistory[] } | null;
  secrets: RoutineSecrets;
}

/** Native composition over the shared form/history model. Nothing is persisted locally. */
export class MobileRoutinesController {
  private state: MobileRoutinesState = {
    routines: [],
    loading: true,
    busy: false,
    error: null,
    editor: null,
    history: null,
    secrets: { webhookKey: null, repositorySecret: null },
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private alive = true;
  constructor(
    readonly spaceId: string,
    readonly agentId: string,
    private port: RoutinesPort,
    private key: () => string,
    private timezone: string,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<MobileRoutinesState>) {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async refresh() {
    const generation = ++this.generation;
    this.update({ loading: true, error: null });
    try {
      const routines = await this.port.list({
        spaceId: this.spaceId,
        agentId: this.agentId,
        limit: 100,
      });
      if (this.alive && generation === this.generation) this.update({ routines, loading: false });
    } catch (error) {
      if (generation === this.generation)
        this.update({ loading: false, error: routineErrorKey(error) });
    }
  }
  edit(routine: Routine | null) {
    if (this.state.busy) return;
    this.update({
      editor: { current: routine, form: createRoutineForm(routine, this.timezone) },
      history: null,
      error: null,
      secrets: { webhookKey: null, repositorySecret: null },
    });
  }
  change(patch: Partial<RoutineFormState>) {
    if (!this.state.editor || this.state.busy) return;
    this.update({
      editor: { ...this.state.editor, form: { ...this.state.editor.form, ...patch } },
    });
  }
  close() {
    if (this.state.busy) return;
    this.update({
      editor: null,
      history: null,
      error: null,
      secrets: { webhookKey: null, repositorySecret: null },
    });
  }
  private async mutate(action: () => Promise<void>) {
    if (this.state.busy || !this.alive) return;
    this.update({ busy: true, error: null });
    try {
      await action();
    } catch (error) {
      this.update({ error: routineErrorKey(error) });
    } finally {
      this.update({ busy: false });
    }
  }
  async save() {
    const editor = this.state.editor;
    if (!editor) return;
    const routine = routineFormInput(editor.form, this.agentId);
    if (!routine) {
      this.update({ error: "invalidInput" });
      return;
    }
    await this.mutate(async () => {
      const input = { spaceId: this.spaceId, routine };
      const result = editor.current
        ? await this.port.update({ ...input, id: editor.current.id })
        : await this.port.create(input);
      this.update({
        editor: { current: result.routine, form: createRoutineForm(result.routine, this.timezone) },
        secrets: { webhookKey: result.webhookKey, repositorySecret: result.repositorySecret },
      });
      await this.refresh();
    });
  }
  async toggle(routine: Routine) {
    await this.mutate(async () => {
      const input = { spaceId: this.spaceId, id: routine.id };
      if (routine.enabled) await this.port.pause(input);
      else await this.port.resume(input);
      await this.refresh();
    });
  }
  async run(routine: Routine) {
    await this.mutate(async () => {
      await this.port.test({ spaceId: this.spaceId, id: routine.id, idempotencyKey: this.key() });
      await this.openHistory(routine);
    });
  }
  async openHistory(routine: Routine) {
    const generation = ++this.generation;
    this.update({ loading: true, error: null });
    try {
      const entries = await this.port.history({
        spaceId: this.spaceId,
        id: routine.id,
        limit: 100,
      });
      if (generation === this.generation)
        this.update({
          history: { routine, entries },
          editor: null,
          loading: false,
          secrets: { webhookKey: null, repositorySecret: null },
        });
    } catch (error) {
      if (generation === this.generation)
        this.update({ loading: false, error: routineErrorKey(error) });
    }
  }
  dispose() {
    this.alive = false;
    ++this.generation;
    this.state = { ...this.state, secrets: { webhookKey: null, repositorySecret: null } };
    this.listeners.clear();
  }
}
