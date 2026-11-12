import { BrowserLanguageProvider } from "../../../i18n.js";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { accessForRole } from "@raypx/account/access";

const mocks = vi.hoisted(() => ({ list: vi.fn(), setRole: vi.fn(), access: vi.fn() }));
vi.mock("../../auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  authClient: { admin: { listUsers: mocks.list, setRole: mocks.setRole } },
}));
vi.mock("../../auth/access.js", () => ({
  accountAccessQuery: (id: string) => ({ queryKey: ["account-access", id], queryFn: mocks.access }),
}));
import { Users } from "./users.js";

const actor = {
  id: "admin",
  name: "Ada",
  email: "ada@example.test",
  role: "admin",
  emailVerified: true,
  createdAt: "2026-11-01T00:00:00Z",
};
const member = { ...actor, id: "member", name: "Lin", email: "lin@example.test", role: "member" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(accessForRole("admin", actor.id));
  mocks.list.mockResolvedValue({ data: { users: [actor, member], total: 21 }, error: null });
  mocks.setRole.mockResolvedValue({ data: { user: { ...member, role: "admin" } }, error: null });
});
function page(accountId = actor.id) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={cache}>
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <Users key={accountId} accountId={accountId} />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { cache, ...view };
}
async function chooseRole(dialog: HTMLElement, label: string) {
  await userEvent.click(within(dialog).getByRole("combobox", { name: "Role" }));
  await userEvent.click(await screen.findByRole("option", { name: label }));
}
async function editMember() {
  const row = (await screen.findByText(member.email)).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Change role" }));
  const dialog = screen.getByRole("dialog");
  await chooseRole(dialog, "Admin");
  return dialog;
}
it("searches and pages on the server and disables editing the current account", async () => {
  page();
  const row = (await screen.findByText(actor.email)).closest("tr")!;
  expect(within(row).getByRole("button", { name: "Change role" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ offset: 20, limit: 20 }) }),
    ),
  );
  fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "lin" } });
  await userEvent.click(screen.getByRole("combobox", { name: "Search by" }));
  await userEvent.click(await screen.findByRole("option", { name: "Name" }));
  fireEvent.click(screen.getByRole("button", { name: "Search users" }));
  await waitFor(() =>
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ offset: 0, searchField: "name", searchValue: "lin" }),
      }),
    ),
  );
});
it("sorts registrations on the server and returns to the first page", async () => {
  page();
  const initialHeader = await screen.findByRole("columnheader", { name: "Registered" });
  expect(initialHeader).toHaveAttribute("aria-sort", "descending");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText(member.email);
  await waitFor(() =>
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ offset: 20 }) }),
    ),
  );
  mocks.list.mockResolvedValueOnce({ data: { users: [member, actor], total: 21 }, error: null });
  const sort = screen.getByRole("combobox", { name: "Registered" });
  await userEvent.click(sort);
  await userEvent.click(await screen.findByRole("option", { name: "Oldest first" }));
  const sortedHeader = await screen.findByRole("columnheader", { name: "Registered" });
  expect(sortedHeader).toHaveAttribute("aria-sort", "ascending");
  expect(mocks.list).toHaveBeenLastCalledWith(
    expect.objectContaining({
      query: expect.objectContaining({ offset: 0, sortBy: "createdAt", sortDirection: "asc" }),
    }),
  );
  const [, firstUser] = within(screen.getByRole("table", { name: "Users" })).getAllByRole("row");
  expect(firstUser).toHaveTextContent(member.email);
});
it("lets an account with users.read view permissions and restores focus on close", async () => {
  mocks.access.mockResolvedValue({
    ...accessForRole("admin", actor.id),
    permissions: ["users.read"],
  });
  page();
  const row = (await screen.findByText(member.email)).closest("tr")!;
  expect(within(row).getByRole("button", { name: "Change role" })).toBeDisabled();
  const view = within(row).getByRole("button", { name: "View permissions" });
  view.focus();
  await userEvent.keyboard("{Enter}");
  const dialog = screen.getByRole("dialog", { name: "View permissions" });
  expect(within(dialog).getByText("Member")).toBeVisible();
  expect(within(dialog).getByText("View projects")).toBeVisible();
  expect(within(dialog).queryByText("View the audit log")).toBeNull();
  expect(within(dialog).queryByRole("combobox")).toBeNull();
  expect(within(dialog).queryByRole("button", { name: "Save changes" })).toBeNull();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(view).toHaveFocus();
  expect(mocks.setRole).not.toHaveBeenCalled();
});
it("combines assigned role permissions and previews a downgrade before saving", async () => {
  mocks.list.mockResolvedValue({
    data: { users: [{ ...member, role: "member,admin" }], total: 1 },
  });
  page();
  const row = (await screen.findByText(member.email)).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "View permissions" }));
  const view = screen.getByRole("dialog", { name: "View permissions" });
  expect(within(view).getByText("Member")).toBeVisible();
  expect(within(view).getByText("Admin")).toBeVisible();
  expect(within(view).getByText("View projects")).toBeVisible();
  expect(within(view).getByText("View the audit log")).toBeVisible();
  await userEvent.click(within(view).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(view).not.toBeInTheDocument());
  await userEvent.click(within(row).getByRole("button", { name: "Change role" }));
  const edit = screen.getByRole("dialog", { name: "Change role" });
  expect(within(edit).getByText("No permission changes.")).toBeVisible();
  expect(within(edit).getByRole("button", { name: "Save changes" })).toBeDisabled();
  await chooseRole(edit, "Member");
  expect(within(edit).getByText("Permissions to remove")).toBeVisible();
  expect(within(edit).getByText("View the audit log")).toBeVisible();
  expect(within(edit).queryByText("Permissions to add")).toBeNull();
  expect(within(edit).queryByText("View projects")).toBeNull();
  await userEvent.click(within(edit).getByRole("button", { name: "Cancel" }));
  expect(mocks.setRole).not.toHaveBeenCalled();
});
it("requires a deliberate choice before replacing an unsupported role assignment", async () => {
  mocks.list.mockResolvedValue({
    data: { users: [{ ...member, role: "admin,unknown" }], total: 1 },
  });
  page();
  const row = (await screen.findByText(member.email)).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "View permissions" }));
  const view = screen.getByRole("dialog", { name: "View permissions" });
  expect(within(view).getByText("Unsupported role")).toBeVisible();
  expect(within(view).getByText("No permissions granted.")).toBeVisible();
  expect(within(view).queryByText("View the audit log")).toBeNull();
  await userEvent.click(within(view).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(view).not.toBeInTheDocument());
  await userEvent.click(within(row).getByRole("button", { name: "Change role" }));
  const edit = screen.getByRole("dialog", { name: "Change role" });
  expect(within(edit).getByRole("combobox", { name: "Role" })).toHaveTextContent("Choose a role");
  const save = within(edit).getByRole("button", { name: "Save changes" });
  expect(save).toBeDisabled();
  await chooseRole(edit, "Member");
  expect(within(edit).getByText("Permissions to add")).toBeVisible();
  expect(within(edit).getByText("View projects")).toBeVisible();
  expect(mocks.setRole).not.toHaveBeenCalled();
  await userEvent.click(save);
  await waitFor(() => expect(edit).not.toBeInTheDocument());
  expect(mocks.setRole).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ userId: member.id, role: "member" }),
  );
});
it("waits for confirmation, fences duplicate saves and refreshes after success", async () => {
  page();
  let finish!: (value: unknown) => void;
  mocks.setRole.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const dialog = await editMember();
  expect(within(dialog).getByText("Permissions to add")).toBeVisible();
  expect(within(dialog).getByText("View the audit log")).toBeVisible();
  expect(within(dialog).queryByText("View projects")).toBeNull();
  expect(mocks.setRole).not.toHaveBeenCalled();
  const save = within(dialog).getByRole("button", { name: "Save changes" });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(mocks.setRole).toHaveBeenCalledTimes(1);
  expect(mocks.setRole).toHaveBeenCalledWith(
    expect.objectContaining({ userId: member.id, role: "admin" }),
  );
  finish({ data: { user: member }, error: null });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
});
it("retains a failed confirmation for retry and hides server diagnostics", async () => {
  page();
  mocks.setRole.mockResolvedValueOnce({ error: { status: 500, message: "private diagnostic" } });
  const dialog = await editMember();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to change this role");
  expect(screen.queryByText("private diagnostic")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.setRole).toHaveBeenCalledTimes(2);
});
it("refreshes permissions when the server denies a role change", async () => {
  page();
  const dialog = await editMember();
  mocks.setRole.mockResolvedValueOnce({ error: { status: 403, message: "private diagnostic" } });
  mocks.access.mockResolvedValue({
    ...accessForRole("admin", actor.id),
    permissions: ["users.read"],
  });
  const save = within(dialog).getByRole("button", { name: "Save changes" });
  await userEvent.click(save);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "You do not have permission to manage users.",
  );
  await waitFor(() => expect(save).toBeDisabled());
  expect(mocks.setRole).toHaveBeenCalledTimes(1);
});
it("retries a successful mutation's refresh without changing the role twice", async () => {
  page();
  const dialog = await editMember();
  mocks.list.mockRejectedValueOnce(new Error("private read error"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await within(dialog).findByText("The role was saved. Try again to refresh the list.");
  fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.setRole).toHaveBeenCalledTimes(1);
});
it("shows retryable list failures instead of an empty list", async () => {
  mocks.list.mockResolvedValueOnce({ error: { status: 500, message: "private diagnostic" } });
  page();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.queryByText("No matching users.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(member.email)).toBeTruthy();
});

it("clears the applied server search and returns to the first page", async () => {
  page();
  await screen.findByText(member.email);
  fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "lin" } });
  fireEvent.click(screen.getByRole("button", { name: "Search users" }));
  await waitFor(() =>
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ searchValue: "lin" }) }),
    ),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ offset: 20 }) }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByLabelText("Search users")).toHaveValue("");
  await waitFor(() => {
    const query = mocks.list.mock.lastCall?.[0].query;
    expect(query).toMatchObject({ offset: 0, limit: 20 });
    expect(query).not.toHaveProperty("searchValue");
  });
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
});
