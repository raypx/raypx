/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@raypx/i18n/client";
import type { ApiClient } from "@raypx/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createWebQueryClient } from "../../lib/query-client";
import { createAccountResources } from "../../lib/account-resources";
import { cloudKey, cloudQueries, personalScope } from "../../lib/cloud-queries";
import { messages } from "../../../tests/fixtures/messages";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  routeApi: vi.fn(),
  cloudContext: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: (id: string) => (options: object) => ({
    id,
    options,
    useLoaderData: () => ({ accountId: "account-a", items: [], nextCursor: null }),
    useSearch: () => ({}),
    useNavigate: () => mocks.navigate,
  }),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../../lib/route-api", () => ({ createRouteApiClient: mocks.routeApi }));
vi.mock("../../lib/use-cloud-queries", () => ({ useCloudQueries: mocks.cloudContext }));

import { Route } from "./projects.index";

const identity = { actorId: "actor-a", accountId: "account-a" };
let queryClient: ReturnType<typeof createWebQueryClient>;

function project(id: string, title = id) {
  return {
    id,
    title,
    createdByUserId: identity.actorId,
    personalOwnerId: identity.accountId,
    organizationId: null,
    description: null,
    stage: "draft" as const,
    archived: false,
    deadline: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function client(list: () => Promise<{ items: ReturnType<typeof project>[]; nextCursor: null }>) {
  return { projects: { list, create: mocks.create } } as unknown as ApiClient;
}

function renderProjects(api: ApiClient) {
  mocks.routeApi.mockReturnValue(api);
  mocks.cloudContext.mockReturnValue({
    api,
    identity,
    queryClient,
    queries: cloudQueries(identity, api),
    resources: createAccountResources(),
  });
  const ProjectsPage = Route.options.component!;
  render(
    <I18nProvider locale="en" messages={messages}>
      <ProjectsPage />
    </I18nProvider>,
  );
}

async function submitProject() {
  await userEvent.setup().click(screen.getByRole("button", { name: "New project" }));
  const input = screen.getByRole("textbox", { name: "Project title" });
  fireEvent.change(input, { target: { value: "Created project" } });
  fireEvent.submit(input.closest("form")!);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.invalidate.mockResolvedValue(undefined);
  queryClient = createWebQueryClient();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

it("refreshes an inactive Chat project cache after creation without touching other identities", async () => {
  let projects = [project("old-project")];
  const list = vi.fn(async () => ({ items: [...projects], nextCursor: null }));
  const api = client(list);
  const queries = cloudQueries(identity, api);
  const previous = await queryClient.ensureQueryData(queries.projects());

  const foreignList = vi.fn(async () => ({
    items: [project("foreign-project")],
    nextCursor: null,
  }));
  const otherAccount = cloudQueries({ ...identity, accountId: "account-b" }, client(foreignList));
  const otherActor = cloudQueries({ ...identity, actorId: "actor-b" }, client(foreignList));
  const foreignPages = await Promise.all([
    queryClient.ensureQueryData(otherAccount.projects()),
    queryClient.ensureQueryData(otherActor.projects()),
  ]);
  const unrelated = cloudKey(identity, personalScope, "tasks");
  queryClient.setQueryData(unrelated, { items: [], nextCursor: null });
  mocks.create.mockImplementationOnce(async ({ title }: { title: string }) => {
    const created = project("new-project", title);
    projects = [created, ...projects];
    return created;
  });

  renderProjects(api);
  await submitProject();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  // Chat's loader uses ensureQueryData before it has any active Query observer.
  const chatPage = await queryClient.ensureQueryData(queries.projects());
  expect(chatPage.items.map(({ id }) => id)).toEqual(["new-project", "old-project"]);
  expect(previous.items.map(({ id }) => id)).toEqual(["old-project"]);
  expect(list).toHaveBeenCalledTimes(2);
  expect(await queryClient.ensureQueryData(otherAccount.projects())).toBe(foreignPages[0]);
  expect(await queryClient.ensureQueryData(otherActor.projects())).toBe(foreignPages[1]);
  expect(foreignList).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryState(otherAccount.projects().queryKey)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(otherActor.projects().queryKey)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(unrelated)?.isInvalidated).toBe(false);
  expect(mocks.create).toHaveBeenCalledWith({ title: "Created project" });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
  const [invalidation] = mocks.invalidate.mock.calls[0]!;
  expect(invalidation.sync).toBe(true);
  expect(invalidation.filter({ routeId: Route.id })).toBe(true);
  expect(invalidation.filter({ routeId: "/(app)/chat/" })).toBe(false);
});

it("keeps both caches intact when project creation fails", async () => {
  const list = vi.fn(async () => ({ items: [project("old-project")], nextCursor: null }));
  const api = client(list);
  const queries = cloudQueries(identity, api);
  const previous = await queryClient.ensureQueryData(queries.projects());
  mocks.create.mockRejectedValueOnce(new Error("offline"));

  renderProjects(api);
  await submitProject();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(await queryClient.ensureQueryData(queries.projects())).toBe(previous);
  expect(list).toHaveBeenCalledOnce();
  expect(queryClient.getQueryState(queries.projects().queryKey)?.isInvalidated).toBe(false);
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
