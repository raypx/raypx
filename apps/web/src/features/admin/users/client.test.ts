import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const api = vi.hoisted(() => ({ admin: { users: { list: vi.fn(), updateStatus: vi.fn() } } }));
vi.mock("@voidmix/client", () => ({ createApiClient: () => api }));
import { adminUsersClient } from "./client";
beforeEach(() => vi.resetAllMocks());
describe("real Admin transport", () => {
  it("propagates list failures without preview data", async () => {
    const error = new Error("offline");
    api.admin.users.list.mockRejectedValue(error);
    await expect(
      adminUsersClient.listUsers({ role: "user", status: "suspended", cursor: "50" }),
    ).rejects.toBe(error);
    expect(api.admin.users.list).toHaveBeenCalledWith(
      { role: "user", status: "suspended", cursor: "50", limit: 50 },
      { signal: undefined },
    );
  });
  it("never reports a failed status write as success", async () => {
    const error = new Error("forbidden");
    api.admin.users.updateStatus.mockRejectedValue(error);
    await expect(
      adminUsersClient.updateUserStatus({ userId: "real", status: "suspended" }),
    ).rejects.toBe(error);
    expect(api.admin.users.updateStatus).toHaveBeenCalledWith({
      userId: "real",
      status: "suspended",
    });
  });
});
