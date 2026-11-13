import { expect, it, vi } from "vitest";
import { createConfigurationReads, type ConfigurationNotifications } from "./reads.js";

it("shares a pending load and discards it after a commit while leaving other scopes cached", async () => {
  const publish = vi.fn();
  const reads = createConfigurationReads({ publish, subscribe: () => () => {} });
  const before = Promise.withResolvers<string>();
  const load = vi.fn(async () => "new").mockReturnValueOnce(before.promise);
  const site = reads.source("site", load);
  const loadStorage = vi.fn(async () => null);
  const storage = reads.source("storage", loadStorage);
  await storage.readCached();
  const callers = [site.readCached(), site.readCached()];
  expect(load).toHaveBeenCalledTimes(1);
  reads.committed("site", 1);
  before.resolve("old");
  await expect(Promise.all(callers)).resolves.toEqual(["new", "new"]);
  expect(load).toHaveBeenCalledTimes(2);
  expect(publish).toHaveBeenCalledExactlyOnceWith({ scope: "site", revision: 1 });
  await storage.readCached();
  expect(loadStorage).toHaveBeenCalledTimes(1);
  await storage.read();
  expect(loadStorage).toHaveBeenCalledTimes(2);
});

it("invalidates all scopes on resubscription and unsubscribes when the runtime closes", async () => {
  let resubscribed = () => {};
  const unsubscribe = vi.fn();
  const subscribe: ConfigurationNotifications["subscribe"] = (_, ready) => {
    resubscribed = ready;
    return unsubscribe;
  };
  const reads = createConfigurationReads({ publish: () => {}, subscribe });
  const loadSite = vi.fn(async () => "Raypx");
  const loadMailer = vi.fn(async () => null);
  const site = reads.source("site", loadSite);
  const resend = reads.source("resend", loadMailer);
  await site.readCached();
  await resend.readCached();
  resubscribed();
  await site.readCached();
  await resend.readCached();
  expect(loadSite).toHaveBeenCalledTimes(2);
  expect(loadMailer).toHaveBeenCalledTimes(2);
  reads.close();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
