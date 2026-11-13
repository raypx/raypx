import { oc } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import { collectApiExposure, exposeApiTo } from "./exposure.js";
import {
  accountProfileSchema,
  apiContract,
  apiExposure,
  getRpcAccess,
  getRpcAudit,
} from "./api.js";

describe("foundation contract", () => {
  it("exposes scoped coordination without publishing local execution methods", () => {
    expect(Object.keys(apiContract)).toEqual([
      "routines",
      "spaceMemory",
      "modelConnections",
      "computers",
      "spaces",
      "agents",
      "conversations",
      "admin",
      "attachments",
      "instances",
      "memory",
      "jobs",
      "hosts",
      "observed",
      "configuration",
      "devices",
      "tasks",
      "approvals",
      "relay",
      "account",
    ]);
    expect(Object.keys(apiContract.computers)).toEqual([
      "get",
      "start",
      "stop",
      "listDirectory",
      "readFile",
    ]);
    expect(apiContract).not.toHaveProperty("terminal");
    expect(apiContract).not.toHaveProperty("files");
    expect(Object.keys(apiContract.agents)).toEqual([
      "models",
      "list",
      "create",
      "get",
      "update",
      "delete",
    ]);
    expect(Object.keys(apiContract.account)).toEqual(["get", "access"]);
    expect(Object.keys(apiContract.hosts)).toEqual(["authorize", "grant", "revoke"]);
    expect(Object.keys(apiContract.observed)).toEqual(["list", "get"]);
  });

  it("uses Better Auth's name and strips private fields", () => {
    expect(
      accountProfileSchema.parse({ id: "u1", email: "a@example.com", name: "A", token: "secret" }),
    ).toEqual({ id: "u1", email: "a@example.com", name: "A" });
  });

  it("requires an explicit consumer for every API procedure", () => {
    const declared = Object.entries(apiExposure).map(([group, methods]) => [
      group,
      Object.keys(methods),
    ]);
    const procedures = Object.entries(apiContract).map(([group, methods]) => [
      group,
      Object.keys(methods),
    ]);
    expect(declared).toEqual(procedures);
    expect(apiExposure).toMatchObject({
      account: { get: "renderer" },
      hosts: { authorize: "native", grant: "host" },
      admin: { overview: "web" },
    });
  });

  it("omits procedures without an exposure declaration", () => {
    const exposure = collectApiExposure({
      account: { get: oc.meta(exposeApiTo("renderer")), undeclared: oc },
    });
    expect(exposure).toEqual({ account: { get: "renderer" } });
  });

  it("declares access for every administration and configuration procedure", () => {
    for (const group of [apiContract.admin, apiContract.configuration]) {
      for (const procedure of Object.values(group)) {
        expect(getRpcAccess(procedure)).toBeDefined();
      }
    }
  });
});

it("declares an access policy on every API procedure", () => {
  const undeclared = Object.entries(apiContract).flatMap(([group, procedures]) =>
    Object.entries(procedures)
      .filter(([, procedure]) => getRpcAccess(procedure) === undefined)
      .map(([name]) => `${group}.${name}`),
  );
  expect(undeclared).toEqual([]);
});

it("audits exactly the procedures that require the configuration update permission", () => {
  const audited = Object.entries(apiContract).flatMap(([group, procedures]) =>
    Object.entries(procedures)
      .filter(([, procedure]) => getRpcAudit(procedure) !== undefined)
      .map(([name, procedure]) => [`${group}.${name}`, getRpcAudit(procedure)]),
  );
  expect(audited).toEqual([
    ["configuration.update", "configuration.update"],
    ["configuration.updateStorage", "configuration.update"],
    ["configuration.updateResend", "configuration.update"],
  ]);
  for (const procedures of Object.values(apiContract))
    for (const procedure of Object.values(procedures))
      expect(getRpcAudit(procedure) !== undefined).toBe(
        getRpcAccess(procedure) === "configuration.update",
      );
});
