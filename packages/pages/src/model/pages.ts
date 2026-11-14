import type { AgentId } from "@raypx/core/agents";
import type { Page, PageId, PageInput, PageShareLink, PageVersion } from "@raypx/core/pages";
import type { SpaceId } from "@raypx/core/spaces";

interface Selection {
  spaceId: SpaceId;
  id: PageId;
}
interface ExpectedSelection extends Selection {
  expectedVersion: number;
}
export type PageVersionSummary = Omit<PageVersion, "body">;
/** The backend resolves fresh Space membership on every request. */
export interface PagesClientPort {
  list(this: void, input: { spaceId: SpaceId; agentId?: AgentId; limit?: number }): Promise<Page[]>;
  get(this: void, input: Selection & { version?: number }): Promise<PageVersion>;
  create(this: void, input: { spaceId: SpaceId; page: PageInput }): Promise<PageVersion>;
  update(this: void, input: ExpectedSelection & { body: string }): Promise<PageVersion>;
  rename(this: void, input: ExpectedSelection & { title: string }): Promise<PageVersion>;
  delete(this: void, input: ExpectedSelection): Promise<{ deleted: true }>;
  versions(this: void, input: Selection & { limit?: number }): Promise<PageVersionSummary[]>;
  restore(this: void, input: ExpectedSelection & { version: number }): Promise<PageVersion>;
  createShareLink(
    this: void,
    input: Selection & { version?: number | null; expiresAt?: string | null },
  ): Promise<PageShareLink & { token: string }>;
  shareLinks(this: void, input: Selection): Promise<PageShareLink[]>;
  revokeShareLink(this: void, input: Selection & { linkId: string }): Promise<{ revoked: number }>;
  revokeShareLinks(this: void, input: Selection): Promise<{ revoked: number }>;
}
export interface PageEditorState {
  current: PageVersion;
  draft: string;
  conflict: boolean;
  newerVersion: number | null;
}
export function beginPageEdit(current: PageVersion): PageEditorState {
  return { current, draft: current.body, conflict: false, newerVersion: null };
}
export function pageHasDraft(state: PageEditorState) {
  return state.draft !== state.current.body;
}
export function pageSaveRequest(state: PageEditorState) {
  return {
    spaceId: state.current.spaceId,
    id: state.current.id,
    expectedVersion: state.current.version,
    body: state.draft,
  };
}
/** A live update refreshes clean views and leaves the entire dirty draft and its CAS base intact. */
export function acceptPageVersion(state: PageEditorState, current: PageVersion): PageEditorState {
  if (
    current.id !== state.current.id ||
    current.spaceId !== state.current.spaceId ||
    current.version <= state.current.version
  )
    return state;
  if (pageHasDraft(state)) return { ...state, newerVersion: current.version };
  return beginPageEdit(current);
}
export function pageFailure(failure: unknown) {
  const error = failure as { code?: unknown; data?: { error?: { code?: unknown } } } | null;
  const code = error?.data?.error?.code ?? error?.code;
  if (code === "PAGE_CONFLICT") return "PAGE_CONFLICT";
  if (code === "PAGE_TOO_LARGE") return "PAGE_TOO_LARGE";
  if (code === "PAGE_NOT_FOUND") return "PAGE_NOT_FOUND";
  return "UNAVAILABLE";
}
export function pageEditFailure(state: PageEditorState, failure: unknown): PageEditorState {
  return { ...state, conflict: pageFailure(failure) === "PAGE_CONFLICT" };
}
export function pageRestoreRequest(current: PageVersion, version: PageVersionSummary) {
  if (current.id !== version.id || current.spaceId !== version.spaceId)
    throw new Error("PAGE_NOT_FOUND");
  return {
    spaceId: current.spaceId,
    id: current.id,
    expectedVersion: current.version,
    version: version.version,
  };
}
export function pageDocumentUrl(apiOrigin: string, page: Pick<Page, "spaceId" | "id" | "version">) {
  return `${apiOrigin.replace(/\/$/, "")}/page-content/member/${encodeURIComponent(page.spaceId)}/${encodeURIComponent(page.id)}?version=${page.version}`;
}
/** Memory only. Closing invalidates pending creation so a late response cannot reveal a token. */
export class OneTimePageLink {
  private generation = 0;
  private value: { url: string; version: number | null } | null = null;
  begin() {
    this.value = null;
    return ++this.generation;
  }
  reveal(generation: number, apiOrigin: string, link: PageShareLink & { token: string }) {
    if (generation !== this.generation) return null;
    this.value = {
      url: `${apiOrigin.replace(/\/$/, "")}/page-content/public/${encodeURIComponent(link.token)}`,
      version: link.version,
    };
    return this.value;
  }
  read() {
    return this.value;
  }
  clear() {
    ++this.generation;
    this.value = null;
  }
}
