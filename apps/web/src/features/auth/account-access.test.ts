import { beforeEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ headers: new Headers(), create: vi.fn(), access: vi.fn() }));
// Select the SSR implementation without running the application Vite plugins.
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({ server: (fn: unknown) => ({ client: () => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@raypx/client/api", () => ({ createApiClient: mocks.create }));
vi.mock("./client", () => ({ apiUrl: "https://api.example.test", authClient: {} }));
mocks.create.mockImplementation(() => ({ account: { access: mocks.access } }));
const { loadAccountAccess } = await import("./account-access.ts");
beforeEach(() => {
  mocks.headers = new Headers();
  mocks.create.mockClear();
  mocks.access.mockReset();
});
it("skips account RPCs when the request has no auth cookies", async () => {
  mocks.headers.set("cookie", "theme=dark");
  expect(await loadAccountAccess(new AbortController().signal)).toMatchObject({
    accountId: null,
    role: "guest",
    permissions: [],
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
});
it("forwards only session cookies and keeps per-request clients isolated", async () => {
  mocks.access.mockResolvedValue({ accountId: "a" });
  const signal = new AbortController().signal;
  mocks.headers = new Headers({
    cookie: "theme=dark; better-auth.session_token=a; other=private",
    authorization: "ignored",
    host: "untrusted.test",
  });
  await loadAccountAccess(signal);
  expect(mocks.create).toHaveBeenLastCalledWith({
    baseUrl: "https://api.example.test",
    headers: { cookie: "better-auth.session_token=a" },
  });
  expect(mocks.access).toHaveBeenLastCalledWith({}, { signal });
  mocks.headers.set("cookie", "better-auth.session_token=b");
  await loadAccountAccess(signal);
  expect(mocks.create).toHaveBeenLastCalledWith({
    baseUrl: "https://api.example.test",
    headers: { cookie: "better-auth.session_token=b" },
  });
});
