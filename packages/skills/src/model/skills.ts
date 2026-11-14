import {
  MAX_SKILL_PACKAGE_BYTES,
  skillContentSchema,
  type Skill,
  type SkillAvailability,
  type SkillContent,
  type SkillImportInput,
} from "@raypx/core/skills";
import type { SpaceId } from "@raypx/core/spaces";

export interface SkillImportReport {
  skill: Skill;
  omitted: { name: string; reason: "EXECUTABLE_OR_UNSUPPORTED" }[];
}
export interface SkillsPort {
  list(this: void, input: { spaceId: SpaceId; availableOnly: boolean }): Promise<Skill[]>;
  get(this: void, input: { spaceId: SpaceId; id: string }): Promise<Skill>;
  create(
    this: void,
    input: { spaceId: SpaceId; skill: SkillContent; availability: SkillAvailability },
  ): Promise<Skill>;
  update(this: void, input: { spaceId: SpaceId; id: string; skill: SkillContent }): Promise<Skill>;
  delete(this: void, input: { spaceId: SpaceId; id: string }): Promise<{ deleted: true }>;
  setAvailability(
    this: void,
    input: { spaceId: SpaceId; id: string; availability: SkillAvailability },
  ): Promise<Skill>;
  import(
    this: void,
    input: { spaceId: SpaceId; package: SkillImportInput; availability: SkillAvailability },
  ): Promise<SkillImportReport>;
}
export interface SkillEditorState {
  current: Skill | null;
  draft: SkillContent;
  availability: SkillAvailability;
}
export function beginSkillEdit(current: Skill | null): SkillEditorState {
  return {
    current,
    draft: {
      name: current?.name ?? "",
      description: current?.description ?? "",
      body: current?.body ?? "",
    },
    availability: current?.availability ?? { mode: "all" },
  };
}
export function skillFormContent(draft: SkillContent): SkillContent | null {
  const result = skillContentSchema.safeParse(draft);
  return result.success ? result.data : null;
}
export function skillImportFormat(name: string): SkillImportInput["format"] | null {
  if (/\.(md|markdown)$/i.test(name)) return "markdown";
  if (/\.zip$/i.test(name)) return "zip";
  return null;
}
/** Encode bounded bytes only; package parsing and admission remain server-owned. */
export function skillImportPackage(name: string, bytes: Uint8Array): SkillImportInput | null {
  const format = skillImportFormat(name);
  if (!format || !bytes.length || bytes.byteLength > MAX_SKILL_PACKAGE_BYTES) return null;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { format, bytes: btoa(binary) };
}
export interface SkillsView {
  skills: readonly Skill[];
  loading: boolean;
  busy: boolean;
  error: "load" | "save" | "delete" | "import" | "invalidFile" | null;
  report: SkillImportReport | null;
}
export class SkillsController {
  private disposed = false;
  private generation = 0;
  private view: SkillsView = { skills: [], loading: true, busy: false, error: null, report: null };
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly port: SkillsPort,
    readonly spaceId: SpaceId,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<SkillsView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private upsert(skill: Skill) {
    this.update({ skills: [...this.view.skills.filter((item) => item.id !== skill.id), skill] });
  }
  async load() {
    const generation = ++this.generation;
    this.update({ loading: true, error: null });
    try {
      const skills = await this.port.list({ spaceId: this.spaceId, availableOnly: false });
      if (generation === this.generation) this.update({ skills });
    } catch {
      if (generation === this.generation) this.update({ error: "load" });
    } finally {
      if (generation === this.generation) this.update({ loading: false });
    }
  }
  async save(editor: SkillEditorState): Promise<boolean> {
    if (this.disposed || this.view.busy) return false;
    const skill = skillFormContent(editor.draft);
    if (!skill) return false;
    this.update({ busy: true, error: null });
    try {
      let saved: Skill;
      if (editor.current) {
        saved = await this.port.update({ spaceId: this.spaceId, id: editor.current.id, skill });
        this.upsert(saved);
        if (
          saved.ownership === "account" &&
          JSON.stringify(saved.availability) !== JSON.stringify(editor.availability)
        ) {
          saved = await this.port.setAvailability({
            spaceId: this.spaceId,
            id: saved.id,
            availability: editor.availability,
          });
        }
      } else {
        saved = await this.port.create({
          spaceId: this.spaceId,
          skill,
          availability: editor.availability,
        });
      }
      this.upsert(saved);
      return !this.disposed;
    } catch {
      this.update({ error: "save" });
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async remove(id: string) {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: true, error: null });
    try {
      await this.port.delete({ spaceId: this.spaceId, id });
      this.update({ skills: this.view.skills.filter((item) => item.id !== id) });
    } catch {
      this.update({ error: "delete" });
    } finally {
      this.update({ busy: false });
    }
  }
  async importFile(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }) {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: true, error: null, report: null });
    try {
      if (file.size > MAX_SKILL_PACKAGE_BYTES || !skillImportFormat(file.name)) {
        this.update({ error: "invalidFile" });
        return;
      }
      const input = skillImportPackage(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!input) {
        this.update({ error: "invalidFile" });
        return;
      }
      const report = await this.port.import({
        spaceId: this.spaceId,
        package: input,
        availability: { mode: "all" },
      });
      this.upsert(report.skill);
      this.update({ report });
    } catch {
      this.update({ error: "import" });
    } finally {
      this.update({ busy: false });
    }
  }
  clearError() {
    this.update({ error: null });
  }
  closeReport() {
    this.update({ report: null });
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.listeners.clear();
  }
}
