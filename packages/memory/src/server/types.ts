import type { TaskContextSelection, TaskContextTarget } from "@raypx/core/tasks";
import type {
  ContextDocument,
  ContextDocumentInput,
  ContextDocumentSummary,
  ContextVersion,
} from "../model.js";

export interface ContextResolvedSource {
  current: ContextDocumentSummary;
  version: ContextVersion;
}

/** Every mutation and its complete version are committed atomically within the owner. */
export interface ContextLibraryRepository {
  list(owner: string): Promise<ContextDocumentSummary[]>;
  get(owner: string, id: string): Promise<ContextDocument>;
  version(owner: string, id: string, revision: number): Promise<ContextVersion>;
  create(
    owner: string,
    requestId: string,
    document: ContextDocumentInput,
  ): Promise<ContextDocument>;
  update(
    owner: string,
    id: string,
    revision: number,
    document: ContextDocumentInput,
  ): Promise<ContextDocument>;
  archive(owner: string, id: string, revision: number, archived: boolean): Promise<ContextDocument>;
  history(
    owner: string,
    id: string,
    before: number | undefined,
    limit: number,
  ): Promise<ContextVersion[]>;
  restore(owner: string, id: string, revision: number, version: number): Promise<ContextDocument>;
  /** Read the current eligibility and each immutable selected revision in one snapshot. */
  readSources(
    owner: string,
    sources: readonly TaskContextSelection["sources"][number][],
  ): Promise<ContextResolvedSource[]>;
}

export interface ContextLibraryServiceOptions {
  repository: ContextLibraryRepository;
  scope: "device" | "account";
  validateProject?: (owner: string, target: TaskContextTarget) => Promise<void>;
  now?: () => number;
}
