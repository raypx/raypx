import { describe, it, expect } from "vite-plus/test";
import { createUserAdministration } from "@voidmix/application";
import { InMemoryUserRepository } from "./memory.js";
import type { User } from "@voidmix/core";
const user = (id: string): User => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  role: "admin",
  status: "active",
  createdAt: new Date(0),
});
describe("memory administration transactions", () => {
  it("serializes administrator changes", async () => {
    const users = new InMemoryUserRepository([user("a"), user("b")]);
    const app = createUserAdministration({ users });
    const results = await Promise.allSettled([
      app.updateStatus({ actorId: "a", userId: "b", status: "suspended" }),
      app.updateStatus({ actorId: "b", userId: "a", status: "suspended" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await users.countActiveAdministrators()).toBe(1);
    expect(users.auditEvents).toHaveLength(1);
  });
  it("rolls back failed audits and leaves the transaction queue usable", async () => {
    class FailingAudit extends InMemoryUserRepository {
      override async appendAudit(): Promise<void> {
        throw new Error("audit failed");
      }
    }
    const users = new FailingAudit([user("a"), user("b")]);
    const app = createUserAdministration({ users });
    await expect(
      app.updateStatus({ actorId: "a", userId: "b", status: "suspended" }),
    ).rejects.toThrow("audit failed");
    expect((await users.getById("b"))?.status).toBe("active");
    expect(users.auditEvents).toEqual([]);
    await expect(
      app.updateStatus({ actorId: "a", userId: "b", status: "active" }),
    ).resolves.toMatchObject({ status: "active" });
  });
});
