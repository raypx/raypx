import { beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
const load = vi.hoisted(() => vi.fn());
vi.mock("./account", () => ({ loadAccount: load }));
import { authPageGuard } from "./auth-guard.ts";
const account = {
  status: "signed-in",
  account: { id: "a", name: "Ada", email: "ada@example.test" },
};
beforeEach(() => {
  load.mockReset();
});
function guard(pathname: string, searchStr = "", queryClient = new QueryClient()) {
  return authPageGuard({ context: { queryClient }, location: { pathname, searchStr } });
}
it.each(["/login", "/signup", "/LOGIN/"])(
  "redirects a confirmed account from %s to projects",
  async (path) => {
    load.mockResolvedValue(account);
    await expect(guard(path)).rejects.toMatchObject({
      options: { to: "/projects", replace: true },
    });
  },
);
it("resumes only allowed destinations and rechecks account expiry", async () => {
  load.mockResolvedValueOnce(account).mockResolvedValueOnce({ status: "signed-out" });
  const client = new QueryClient();
  await expect(guard("/login", "?returnTo=%2Fadmin%2Fusers", client)).rejects.toMatchObject({
    options: { to: "/admin/users" },
  });
  expect(await guard("/login", "", client)).toEqual({ completeSignIn: false });
  load.mockResolvedValue(account);
  await expect(guard("/login", "?returnTo=https%3A%2F%2Fevil.test")).rejects.toMatchObject({
    options: { to: "/" },
  });
});
it.each(["/reset-password", "/verify-email", "/forgot-password"])(
  "preserves %s without reading an account",
  async (path) => {
    expect(await guard(path)).toEqual({ completeSignIn: false });
    expect(load).not.toHaveBeenCalled();
  },
);
it.each(["?oauth=success", "?error=access_denied"])(
  "leaves callback completion to the form at %s",
  async (query) => {
    expect(await guard("/login", query)).toEqual({ completeSignIn: false });
    expect(load).not.toHaveBeenCalled();
  },
);
it("defers a signed-in guest draft handoff to client completion", async () => {
  load.mockResolvedValue(account);
  expect(await guard("/login", "?returnTo=%2Ftasks%3FguestDraft%3Dnonce")).toEqual({
    completeSignIn: true,
  });
});
it.each(["signed-out", "unavailable"])("does not redirect a %s account", async (status) => {
  load.mockResolvedValue({ status });
  expect(await guard("/login")).toEqual({ completeSignIn: false });
});
