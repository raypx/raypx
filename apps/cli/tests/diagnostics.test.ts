import { describe, expect, it } from "vite-plus/test";
import { diagnosticCode } from "../src/diagnostics";
import { LocalError } from "../src/runtime/errors";

describe("diagnostic error summaries", () => {
  it("retains bounded local codes without inspecting raw exception content", () => {
    expect(diagnosticCode(new LocalError("INVALID_PATH", "private file contents"))).toBe(
      "INVALID_PATH",
    );
    expect(diagnosticCode(new LocalError("secret\n/path/to/file", "secret"))).toBe("LOCAL_ERROR");
    expect(diagnosticCode(new LocalError("A".repeat(65), "secret"))).toBe("LOCAL_ERROR");
    expect(diagnosticCode(new Error("token=private"))).toBe("LOCAL_ERROR");
    expect(diagnosticCode({ code: "TOKEN_VALUE", message: "secret" })).toBe("LOCAL_ERROR");
  });
});
