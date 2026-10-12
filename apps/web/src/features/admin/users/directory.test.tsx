/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@voidmix/i18n/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { DirectoryProvider } from "./store-provider";
import { directorySearch } from "./search";
import { RouteError } from "../../navigation/route-state";
import { messages } from "../../../../tests/fixtures/messages";
import { UserDirectory } from "./directory";
import { createPreviewUsersAdapter } from "./preview-adapter";
import type { AdminUser, AdminUsersClient } from "./types";

const users: readonly AdminUser[] = (
  [
    ["owner", "Mina Cole", "owner", "owner", "active", -2, "minute", "2026-05-18"],
    ["member", "Samira Bell", "samira", "user", "active", -1, "hour", "2026-06-21"],
    ["suspended", "Rei Nakamura", "rei", "user", "suspended", -9, "day", "2026-04-07"],
  ] as const
).map(([id, name, email, role, status, value, unit, joined]) => ({
  id,
  name,
  email: `${email}@example.com`,
  role,
  status,
  lastActive: { kind: "relative", value, unit },
  joinedAt: new Date(`${joined}T00:00:00.000Z`),
}));

afterEach(() => cleanup());

function renderDirectory(client: AdminUsersClient = createPreviewUsersAdapter(users)) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: directorySearch,
    loaderDeps: ({ search }) => search,
    loader: ({ deps, abortController }) => client.listUsers(deps, abortController.signal),
    errorComponent: RouteError,
  });
  function DirectoryPage() {
    const page = route.useLoaderData() as unknown as Awaited<
      ReturnType<AdminUsersClient["listUsers"]>
    >;
    const search = route.useSearch();
    const navigate = route.useNavigate();
    return (
      <DirectoryProvider>
        <UserDirectory
          client={client}
          page={page}
          search={search}
          onSearch={(patch) => void navigate({ search: directorySearch({ ...search, ...patch }) })}
          reload={async () => {
            await router.invalidate({ sync: true });
          }}
        />
      </DirectoryProvider>
    );
  }
  route.update({ component: DirectoryPage });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <I18nProvider locale="en" messages={messages}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
}

describe("UserDirectory", () => {
  it("filters the directory by role", async () => {
    const user = renderDirectory();
    await screen.findByText("Samira Bell");

    await user.click(screen.getByRole("button", { name: "Filter by role" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Owner" }));

    await waitFor(() => {
      expect(screen.getByText("Mina Cole")).toBeInTheDocument();
      expect(screen.queryByText("Samira Bell")).not.toBeInTheDocument();
    });
  });

  it("supports selecting a member and changing its status", async () => {
    const user = renderDirectory();
    await screen.findByText("Samira Bell");

    await user.click(screen.getByRole("checkbox", { name: "Select Samira Bell" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Suspend selected" }));

    await waitFor(() => {
      const memberRow = screen.getByRole("checkbox", { name: "Select Samira Bell" }).closest("tr");
      expect(memberRow).not.toBeNull();
      expect(within(memberRow!).getByText("Suspended")).toBeInTheDocument();
      expect(screen.getByText("1 user updated to suspended.")).toBeInTheDocument();
    });
  });

  it("keeps the owner protected from bulk status changes", async () => {
    const user = renderDirectory();
    await screen.findByText("Mina Cole");

    await user.click(screen.getByRole("checkbox", { name: "Select Mina Cole" }));

    expect(screen.getByRole("button", { name: "Suspend selected" })).toBeDisabled();
    expect(screen.getByText("Owner stays protected")).toBeInTheDocument();
  });

  it("shows a retry action when loading fails", async () => {
    const listUsers = vi
      .fn<AdminUsersClient["listUsers"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: users, total: users.length, nextCursor: null });
    const client: AdminUsersClient = {
      listUsers,
      updateUserStatus: vi.fn(async (input) => ({
        ...users[1]!,
        id: input.userId,
        status: input.status,
      })),
    };
    const user = renderDirectory(client);

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Samira Bell")).toBeInTheDocument());
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});
