import { describe, expect, it } from "vite-plus/test";

import { DomainError } from "@voidmix/core";

import { mapDomainError } from "./canonical-errors.js";

describe("canonical API errors", () => {
  it("recognizes a DomainError exported through Core and maps it to oRPC", () => {
    const mapped = mapDomainError(new DomainError("USER_NOT_FOUND", "User was not found."));

    expect(mapped).toMatchObject({
      code: "NOT_FOUND",
      data: { error: { code: "USER_NOT_FOUND" } },
    });
  });
});
