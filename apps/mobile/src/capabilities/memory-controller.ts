import type { AgentId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import {
  spaceMemoryInputSchema,
  type SpaceMemoryDocument,
  type SpaceMemoryInput,
  type SpaceMemoryRevision,
} from "@raypx/core/space-memory";
import {
  beginMemoryEdit,
  memoryEditorFailure,
  reloadMemoryEditor,
  memoryRestoreRequest,
  type MemoryEditorState,
  type SpaceMemoryClientPort,
} from "@raypx/memory/model";

export interface MobileMemoryState {
  documents: SpaceMemoryDocument[];
  editor: MemoryEditorState | null;
  revisions: SpaceMemoryRevision[];
  loading: boolean;
  busy: boolean;
  error: boolean;
}
export class MobileMemoryController {
  private state: MobileMemoryState = {
    documents: [],
    editor: null,
    revisions: [],
    loading: true,
    busy: false,
    error: false,
  };
  private listeners = new Set<() => void>();
  private alive = true;
  private generation = 0;
  constructor(
    readonly spaceId: SpaceId,
    readonly agentId: AgentId,
    private port: SpaceMemoryClientPort,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<MobileMemoryState>) {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async refresh() {
    const generation = ++this.generation;
    this.update({ loading: true, error: false });
    try {
      const [agent, shared] = await Promise.all([
        this.port.list({
          spaceId: this.spaceId,
          agentId: this.agentId,
          scope: "agent",
          includeRemoved: true,
          limit: 100,
        }),
        this.port.list({ spaceId: this.spaceId, scope: "space", includeRemoved: true, limit: 100 }),
      ]);
      const documents = [...agent, ...shared];
      if (generation === this.generation) this.update({ documents, loading: false });
    } catch {
      if (generation === this.generation) this.update({ loading: false, error: true });
    }
  }
  async edit(document: SpaceMemoryDocument | null) {
    if (this.state.busy) return;
    ++this.generation;
    this.update({ editor: beginMemoryEdit(this.agentId, document), revisions: [], error: false });
    if (document) await this.loadHistory(document);
  }
  change(patch: Partial<SpaceMemoryInput>) {
    if (this.state.busy || !this.state.editor) return;
    this.update({
      editor: { ...this.state.editor, draft: { ...this.state.editor.draft, ...patch } },
    });
  }
  close() {
    if (!this.state.busy) {
      ++this.generation;
      this.update({ editor: null, revisions: [], error: false });
    }
  }
  private async mutate(action: () => Promise<void>) {
    if (this.state.busy || !this.alive) return;
    this.update({ busy: true, error: false });
    try {
      await action();
    } catch (error) {
      this.update({
        error: true,
        ...(this.state.editor ? { editor: memoryEditorFailure(this.state.editor, error) } : {}),
      });
    } finally {
      this.update({ busy: false });
    }
  }
  async save() {
    const editor = this.state.editor;
    if (!editor || editor.conflict) return;
    const parsed = spaceMemoryInputSchema.safeParse(editor.draft);
    if (!parsed.success) {
      this.update({ error: true });
      return;
    }
    await this.mutate(async () => {
      const input = { spaceId: this.spaceId, document: parsed.data };
      const document = editor.current
        ? await this.port.update({
            ...input,
            id: editor.current.id,
            expectedRevision: editor.current.revision,
          })
        : await this.port.create(input);
      this.update({ editor: beginMemoryEdit(this.agentId, document) });
      await this.loadHistory(document);
      await this.refresh();
    });
  }
  async reload() {
    const editor = this.state.editor;
    if (!editor?.current) return;
    await this.mutate(async () => {
      const current = await this.port.get({ spaceId: this.spaceId, id: editor.current!.id });
      this.update({ editor: reloadMemoryEditor(editor, current) });
      await this.loadHistory(current);
    });
  }
  async restore(revision: SpaceMemoryRevision) {
    const current = this.state.editor?.current;
    if (!current) return;
    await this.mutate(async () => {
      const document = await this.port.restore(
        memoryRestoreRequest(this.spaceId, current, revision),
      );
      this.update({ editor: beginMemoryEdit(this.agentId, document) });
      await this.loadHistory(document);
      await this.refresh();
    });
  }
  async remove() {
    const current = this.state.editor?.current;
    if (!current) return;
    await this.mutate(async () => {
      const document = await this.port.remove({
        spaceId: this.spaceId,
        id: current.id,
        expectedRevision: current.revision,
      });
      this.update({ editor: beginMemoryEdit(this.agentId, document) });
      await this.loadHistory(document);
      await this.refresh();
    });
  }
  private async loadHistory(document: SpaceMemoryDocument) {
    const generation = ++this.generation;
    try {
      const revisions = await this.port.history({
        spaceId: this.spaceId,
        id: document.id,
        limit: 100,
      });
      if (generation === this.generation && this.state.editor?.current?.id === document.id)
        this.update({ revisions });
    } catch {
      if (generation === this.generation) this.update({ error: true });
    }
  }
  dispose() {
    this.alive = false;
    ++this.generation;
    this.listeners.clear();
  }
}
