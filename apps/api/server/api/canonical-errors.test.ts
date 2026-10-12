import { describe, expect, it } from "vite-plus/test";

import { DomainError } from "@raypx/core";

import { mapDomainError } from "./canonical-errors.js";

describe("canonical API errors", () => {
  it("recognizes a DomainError exported through Core and maps it to oRPC", () => {
    const mapped = mapDomainError(new DomainError("BAD_REQUEST", "Invalid pagination cursor."));

    expect(mapped).toMatchObject({
      code: "BAD_REQUEST",
      data: { error: { code: "BAD_REQUEST" } },
    });
  });
});
