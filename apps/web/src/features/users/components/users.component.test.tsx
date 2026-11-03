import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { accessForRole } from "@raypx/account/access";

const mocks = vi.hoisted(() => ({ list: vi.fn(), setRole: vi.fn(), access: vi.fn() }));
vi.mock("../../auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: { admin: { listUsers: mocks.list, setRole: mocks.setRole } },
}));
vi.mock("../../auth/access", () => ({
  accountAccessQuery: (id: string) => ({ queryKey: ["account-access", id], queryFn: mocks.access }),
}));
import { Users } from "./users";

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
async function editMember() {
  const row = (await screen.findByText(member.email)).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Change role" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("combobox", { name: "Role" }));
  await userEvent.click(await screen.findByRole("option", { name: "Admin" }));
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
