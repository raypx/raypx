import type { AgentId } from "@raypx/core/agents";
import type {
  Skill,
  SkillAvailability,
  SkillCatalogEntry,
  SkillContent,
  SkillImportInput,
} from "@raypx/core/skills";
import type { SpaceScope } from "@raypx/spaces/server";

export class SkillExecutionFenceError extends Error {
  readonly code = "STALE_RUN_FENCE";
  constructor() {
    super("STALE_RUN_FENCE");
    this.name = "SkillExecutionFenceError";
  }
}
export interface SkillRunActor {
  agentId: AgentId;
  runId: string;
  memberAccountId: string;
  execution: { conversationId: string; ownerId: string; fence: number };
}
export interface SkillRepository {
  list(scope: SpaceScope, availableOnly: boolean): Promise<Skill[]>;
  get(scope: SpaceScope, id: string, availableOnly: boolean): Promise<Skill>;
  create(
    scope: SpaceScope,
    id: string,
    content: SkillContent,
    availability: SkillAvailability,
  ): Promise<Skill>;
  update(scope: SpaceScope, id: string, content: SkillContent): Promise<Skill>;
  delete(scope: SpaceScope, id: string): Promise<{ deleted: true }>;
  setAvailability(scope: SpaceScope, id: string, availability: SkillAvailability): Promise<Skill>;
  enabled(scope: SpaceScope, agentId: AgentId): Promise<Skill[]>;
  setEnabled(scope: SpaceScope, agentId: AgentId, ids: string[]): Promise<SkillCatalogEntry[]>;
  saveFromRun(
    scope: SpaceScope,
    actor: SkillRunActor,
    callId: string,
    id: string | undefined,
    content: SkillContent,
  ): Promise<{ id: string }>;
}
export interface SkillsService {
  list(scope: SpaceScope, availableOnly?: boolean): Promise<Skill[]>;
  get(scope: SpaceScope, id: string): Promise<Skill>;
  create(
    scope: SpaceScope,
    content: SkillContent,
    availability?: SkillAvailability,
  ): Promise<Skill>;
  update(scope: SpaceScope, id: string, content: SkillContent): Promise<Skill>;
  delete(scope: SpaceScope, id: string): Promise<{ deleted: true }>;
  setAvailability(scope: SpaceScope, id: string, availability: SkillAvailability): Promise<Skill>;
  setAgentSkills(scope: SpaceScope, agentId: AgentId, ids: string[]): Promise<SkillCatalogEntry[]>;
  runCatalog(scope: SpaceScope, agentId: AgentId): Promise<SkillCatalogEntry[]>;
  loadForRun(scope: SpaceScope, agentId: AgentId, id: string): Promise<Skill>;
  saveFromRun(
    scope: SpaceScope,
    actor: SkillRunActor,
    callId: string,
    id: string | undefined,
    content: SkillContent,
  ): Promise<{ id: string }>;
  import(
    scope: SpaceScope,
    input: SkillImportInput,
    availability?: SkillAvailability,
  ): Promise<{ skill: Skill; omitted: { name: string; reason: "EXECUTABLE_OR_UNSUPPORTED" }[] }>;
}
