import { dehydrate } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";
import { createWebQueryClient } from "./query-client";
import { cloudKey, invalidateRunFacts, personalScope } from "./cloud-queries";

describe("request and account scoped ordinary data", () => {
  it("keeps SSR request caches separate and excludes private bytes and signed URLs", async () => {
    const a = createWebQueryClient();
    const b = createWebQueryClient();
    const identity = { actorId: "actor-a", accountId: "account-a" };
    const key = cloudKey(identity, personalScope, "task", "task-a");
    a.setQueryData(key, { id: "task-a" });
    expect(b.getQueryData(key)).toBeUndefined();
    await a.fetchQuery({
      queryKey: ["private-preview"],
      queryFn: async () => ({ url: "https://signed.invalid/token", bytes: "private" }),
      meta: { privateContent: true },
    });
    expect(JSON.stringify(dehydrate(a))).not.toContain("signed.invalid");
    expect(JSON.stringify(dehydrate(b))).not.toContain("task-a");
    a.clear();
    b.clear();
  });
  it("invalidates only the owning task and account aggregates", async () => {
    const client = createWebQueryClient();
    const owner = { actorId: "a", accountId: "a" };
    const other = { actorId: "b", accountId: "b" };
    const own = cloudKey(owner, personalScope, "task", "one");
    const unrelated = cloudKey(owner, personalScope, "task", "two");
    const list = cloudKey(owner, { type: "project", projectId: "project" }, "tasks");
    const usage = cloudKey(owner, personalScope, "usage");
    const foreign = cloudKey(other, personalScope, "task", "one");
    for (const key of [own, unrelated, list, usage, foreign]) client.setQueryData(key, {});
    await invalidateRunFacts(client, owner, "one");
    expect(client.getQueryState(own)?.isInvalidated).toBe(true);
    expect(client.getQueryState(list)?.isInvalidated).toBe(true);
    expect(client.getQueryState(usage)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
    client.clear();
  });
});
