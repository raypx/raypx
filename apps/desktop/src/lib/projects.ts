import { createApiClient, type ApiClient } from "@voidmix/client";
import { readErrorCode } from "@voidmix/i18n";
import { env } from "../env";
import { getDesktopLocaleHeaders } from "../i18n/client";

export type StudioProject = Awaited<ReturnType<ApiClient["projects"]["list"]>>["items"][number];
export type StudioProjectPage = Awaited<ReturnType<ApiClient["projects"]["list"]>>;
export type StudioDetail = Awaited<ReturnType<ApiClient["projects"]["get"]>>["project"] & {
  access: Awaited<ReturnType<ApiClient["projects"]["get"]>>["access"];
  tasks: Awaited<ReturnType<ApiClient["projects"]["tasks"]["list"]>>["items"];
};
export type ProjectLoadFailure = {
  status: "unavailable";
  data: null;
  reason?: "notConfigured" | "signedOut" | "accessDenied";
};
export type StudioLoad<T> = { status: "loaded"; data: T } | ProjectLoadFailure;

function failure(error: unknown): ProjectLoadFailure {
  const code = readErrorCode(error);
  if (code === "UNAUTHORIZED") return { status: "unavailable", data: null, reason: "signedOut" };
  if (code === "FORBIDDEN" || code === "PROJECT_ACCESS_DENIED")
    return { status: "unavailable", data: null, reason: "accessDenied" };
  return { status: "unavailable", data: null };
}

function getClient(): ApiClient {
  return createApiClient({
    ...(env.VITE_API_URL ? { baseUrl: env.VITE_API_URL } : {}),
    headers: getDesktopLocaleHeaders,
    fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
  });
}

export async function loadProjects(
  signal?: AbortSignal,
  query: { cursor?: string } = {},
): Promise<StudioLoad<StudioProjectPage>> {
  if (!env.VITE_API_URL) return { status: "unavailable", data: null, reason: "notConfigured" };
  try {
    const result = await getClient().projects.list({ limit: 50, ...query }, { signal });
    return { status: "loaded", data: result };
  } catch (error) {
    signal?.throwIfAborted();
    return failure(error);
  }
}

export async function loadProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<StudioLoad<StudioDetail | null>> {
  if (!env.VITE_API_URL) return { status: "unavailable", data: null, reason: "notConfigured" };
  try {
    const api = getClient();
    const [result, tasks] = await Promise.all([
      api.projects.get({ projectId }, { signal }),
      api.projects.tasks.list({ projectId }, { signal }),
    ]);
    return {
      status: "loaded",
      data: { ...result.project, access: result.access, tasks: tasks.items },
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (readErrorCode(error) === "NOT_FOUND") return { status: "loaded", data: null };
    return failure(error);
  }
}

export async function createProject(title: string): Promise<StudioProject> {
  return getClient().projects.create({ title: title.trim() });
}

export async function createTask(projectId: string, title: string): Promise<void> {
  await getClient().projects.tasks.create({ projectId, title: title.trim() });
}
