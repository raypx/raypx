import type { AgentId } from "@raypx/core/agents";
import type { Page, PageId, PageInput, PageShareLink, PageVersion } from "@raypx/core/pages";
import type { SpaceScope } from "@raypx/spaces/server";

export interface PageActor {
  kind: "member" | "run";
  accountId: string;
  runId?: string;
  agentId?: AgentId;
  mutationKey?: string;
  execution?: { conversationId: string; ownerId: string; fence: number };
}
export class PageExecutionFenceError extends Error {
  readonly code = "STALE_RUN_FENCE";
  constructor() {
    super("STALE_RUN_FENCE");
    this.name = "PageExecutionFenceError";
  }
}
export interface PageRunActor {
  agentId: AgentId;
  memberAccountId: string;
  runId: string;
  execution: { conversationId: string; ownerId: string; fence: number };
}
export interface PagesRepository {
  list(scope: SpaceScope, options: { agentId?: AgentId; limit: number }): Promise<Page[]>;
  get(scope: SpaceScope, id: PageId, version?: number): Promise<PageVersion>;
  create(
    scope: SpaceScope,
    id: PageId,
    input: PageInput,
    actor: PageActor,
    now: Date,
  ): Promise<PageVersion>;
  update(
    scope: SpaceScope,
    id: PageId,
    expected: number,
    body: string,
    actor: PageActor,
    now: Date,
  ): Promise<PageVersion>;
  rename(
    scope: SpaceScope,
    id: PageId,
    expected: number,
    title: string,
    actor: PageActor,
    now: Date,
  ): Promise<PageVersion>;
  delete(scope: SpaceScope, id: PageId, expected: number, now: Date): Promise<{ deleted: true }>;
  versions(scope: SpaceScope, id: PageId, limit: number): Promise<Omit<PageVersion, "body">[]>;
  restore(
    scope: SpaceScope,
    id: PageId,
    expected: number,
    version: number,
    actor: PageActor,
    now: Date,
  ): Promise<PageVersion>;
  createShareLink(
    scope: SpaceScope,
    id: PageId,
    linkId: string,
    tokenHash: string,
    version: number | null,
    expiresAt: Date | null,
    now: Date,
  ): Promise<PageShareLink>;
  shareLinks(scope: SpaceScope, id: PageId): Promise<PageShareLink[]>;
  revokeShareLinks(
    scope: SpaceScope,
    id: PageId,
    linkId: string | undefined,
    now: Date,
  ): Promise<{ revoked: number }>;
  resolveShare(tokenHash: string, now: Date): Promise<PageVersion | null>;
}
export interface PagesService {
  list(scope: SpaceScope, options?: { agentId?: AgentId; limit?: number }): Promise<Page[]>;
  get(scope: SpaceScope, id: PageId, version?: number): Promise<PageVersion>;
  create(scope: SpaceScope, input: PageInput, actor?: PageActor, id?: PageId): Promise<PageVersion>;
  update(
    scope: SpaceScope,
    id: PageId,
    expected: number,
    body: string,
    actor?: PageActor,
  ): Promise<PageVersion>;
  rename(scope: SpaceScope, id: PageId, expected: number, title: string): Promise<PageVersion>;
  delete(scope: SpaceScope, id: PageId, expected: number): Promise<{ deleted: true }>;
  versions(scope: SpaceScope, id: PageId, limit?: number): Promise<Omit<PageVersion, "body">[]>;
  restore(scope: SpaceScope, id: PageId, expected: number, version: number): Promise<PageVersion>;
  createShareLink(
    scope: SpaceScope,
    id: PageId,
    version?: number | null,
    expiresAt?: string | null,
  ): Promise<PageShareLink & { token: string }>;
  shareLinks(scope: SpaceScope, id: PageId): Promise<PageShareLink[]>;
  revokeShareLinks(scope: SpaceScope, id: PageId, linkId?: string): Promise<{ revoked: number }>;
  resolveShare(token: string): Promise<PageVersion | null>;
}
