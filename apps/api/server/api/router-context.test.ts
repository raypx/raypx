import { describe, expect, it } from "vite-plus/test";
import { ORPCError } from "@orpc/server";
import { AgentRunV2DomainError, DomainError, ProjectV2DomainError } from "@voidmix/core";
import { actorInput, page } from "./router-context.js";
import { mapDomainError } from "./canonical-errors.js";

describe("router boundaries", () => {
  it("omits undefined, preserves nullable/false/zero fields and uses only the authenticated actor", () => {
    const date = new Date(0);
    expect(
      actorInput(
        { principal: { user: { id: "trusted" } } },
        {
          actorId: "forged",
          title: undefined,
          description: null,
          archived: false,
          count: 0,
          date,
        },
      ),
    ).toEqual({ actorId: "trusted", description: null, archived: false, count: 0, date });
    expect(page([date]).items[0]).toBe(date);
    expect(page([])).toEqual({ items: [], nextCursor: null });
  });
  it.each([
    [new ProjectV2DomainError("PROJECT_ACCESS_DENIED", "private"), "FORBIDDEN"],
    [new AgentRunV2DomainError("AGENT_RUN_TERMINAL", "private"), "CONFLICT"],
    [new DomainError("USER_NOT_FOUND", "private"), "NOT_FOUND"],
  ])("maps the domain error without diagnostic prose: %s", (error, code) => {
    const result = mapDomainError(error);
    expect(result.code).toBe(code);
    expect(result.data).toEqual({ error: { code: error.code } });
  });
  it("preserves transport errors and drops unknown diagnostic causes from transport logging", () => {
    const error = new ORPCError("FORBIDDEN");
    expect(mapDomainError(error)).toBe(error);
    const unknown = new Error("private");
    const mapped = mapDomainError(unknown);
    expect(mapped.code).toBe("INTERNAL_SERVER_ERROR");
    expect(mapped.cause).toBeUndefined();
  });
});
