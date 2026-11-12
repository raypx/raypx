import { describe, expect, it } from "vitest";
import { cn } from "./utils.js";

describe("semantic control spacing", () => {
  it.each(["control-xs", "control-sm", "control", "control-lg", "control-xl"])(
    "allows content height to override %s",
    (size) => {
      expect(cn(`h-${size}`, "h-auto")).toBe("h-auto");
      expect(cn("h-auto", `h-${size}`)).toBe(`h-${size}`);
    },
  );

  it("merges modified control dimensions without discarding unrelated states", () => {
    expect(cn("h-control hover:h-control-sm focus:h-12", "hover:h-auto")).toBe(
      "h-control focus:h-12 hover:h-auto",
    );
    expect(cn("min-h-control w-control-lg", "min-h-0 w-full")).toBe("min-h-0 w-full");
  });
});
