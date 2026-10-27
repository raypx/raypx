import { expect, it } from "vite-plus/test";
import {
  isLocalWorkspace,
  workspaceDraftKey,
  workspaceOwner,
  workspaceScopeKey,
  type WorkspaceScope,
} from "../../src/model.js";

it("retains the existing device, account-local and remote draft ownership", () => {
  const namespace = "https://api.example.test";
  const scopes: WorkspaceScope[] = [
    { kind: "device", namespace, workspaceId: "device:local-workspace:v1" },
    { kind: "account-local", namespace, accountId: "account-a" },
    { kind: "remote", namespace, accountId: "account-a" },
  ];
  expect(scopes.map(workspaceOwner)).toEqual([
    "device:local-workspace:v1",
    "account-a",
    "account-a",
  ]);
  expect(scopes.map(isLocalWorkspace)).toEqual([true, true, false]);
  expect(scopes.map(workspaceDraftKey)).toEqual([
    JSON.stringify(["raypx.task-drafts.v1", namespace, "device:local-workspace:v1", true]),
    JSON.stringify(["raypx.task-drafts.v1", namespace, "account-a", true]),
    JSON.stringify(["raypx.task-drafts.v1", namespace, "account-a", false]),
  ]);
  expect(new Set(scopes.map(workspaceScopeKey)).size).toBe(3);
});

it("isolates server/account changes without making the device owner account-dependent", () => {
  const local = { kind: "device", namespace: "server-a", workspaceId: "device-profile" } as const;
  const remote = { kind: "remote", namespace: "server-a", accountId: "account-a" } as const;
  expect(workspaceOwner(local)).toBe("device-profile");
  expect(workspaceDraftKey({ ...remote, accountId: "account-b" })).not.toBe(
    workspaceDraftKey(remote),
  );
  expect(workspaceDraftKey({ ...remote, namespace: "server-b" })).not.toBe(
    workspaceDraftKey(remote),
  );
  expect(workspaceScopeKey({ ...local, namespace: "server-b" })).not.toBe(workspaceScopeKey(local));
});
