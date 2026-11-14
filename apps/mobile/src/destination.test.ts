import { afterEach, describe, expect, it } from "vitest";
import {
  clearDestination,
  rememberDestination,
  safeDestination,
  takeDestination,
} from "./destination.js";

afterEach(clearDestination);

describe("post-login mobile destinations", () => {
  it("preserves native capability and group selectors without retaining unrelated input", () => {
    for (const pathname of [
      "/groups",
      "/group-conversation/group",
      "/space-settings",
      "/pages",
      "/resources",
      "/routines",
      "/space-memory",
    ])
      expect(
        safeDestination(pathname, {
          spaceId: "space",
          groupId: "group",
          agentId: "agent",
          redirect: "https://elsewhere.example",
        }),
      ).toEqual({ pathname, params: { spaceId: "space", groupId: "group", agentId: "agent" } });
  });
  it("retains a bounded invitation for explicit acceptance after sign-in", () => {
    const token = "single-use-invitation-token";
    rememberDestination("/join", { token, cookie: "discard" });
    expect(takeDestination("new-member")).toEqual({ pathname: "/join", params: { token } });
    for (const invalidToken of ["", ["token"], "x".repeat(257), "https://elsewhere.example"])
      expect(safeDestination("/join", { token: invalidToken })).toBeNull();
    expect(takeDestination("new-member")).toBeNull();
  });
  it("keeps only native destinations and bounded resource selectors", () => {
    expect(
      safeDestination("/conversation/agent-one", {
        spaceId: "space-one",
        agentId: "agent-one",
        cookie: "discard",
        redirect: "https://elsewhere.example",
      }),
    ).toEqual({
      pathname: "/conversation/agent-one",
      params: { spaceId: "space-one", agentId: "agent-one" },
    });
    expect(safeDestination("/account", { spaceId: "discard" })).toEqual({
      pathname: "/account",
      params: {},
    });
    expect(safeDestination("/space", {})).toEqual({ pathname: "/space", params: {} });
    expect(safeDestination("/agent", { spaceId: "space" })).toEqual({
      pathname: "/agent",
      params: { spaceId: "space" },
    });
  });

  it("rejects external, unknown and unscoped destinations", () => {
    for (const path of [
      "https://elsewhere.example/account",
      "//elsewhere.example/account",
      "/login",
      "/admin",
      "/conversation/one/extra",
      "/conversation/one?token=value",
      "/conversation/one#fragment",
    ])
      expect(safeDestination(path, { spaceId: "space" })).toBeNull();
    for (const spaceId of [undefined, "", "x".repeat(129), ["space"]])
      expect(safeDestination("/conversation/agent", { spaceId })).toBeNull();
  });

  it("restores once to the same account after expiry and clears on account replacement", () => {
    rememberDestination("/conversation/agent", { spaceId: "space" }, "account-one");
    expect(takeDestination("account-one")).toEqual({
      pathname: "/conversation/agent",
      params: { spaceId: "space" },
    });
    expect(takeDestination("account-one")).toBeNull();
    rememberDestination("/account", {}, "account-one");
    expect(takeDestination("account-two")).toBeNull();
    expect(takeDestination("account-one")).toBeNull();
  });

  it("permits a signed-out deep link and discards destinations on explicit logout", () => {
    rememberDestination("/agent", { spaceId: "space", agentId: "agent" });
    expect(takeDestination("newly-signed-in")).toEqual({
      pathname: "/agent",
      params: { spaceId: "space", agentId: "agent" },
    });
    rememberDestination("/account", {}, "account");
    clearDestination();
    expect(takeDestination("account")).toBeNull();
  });
});
