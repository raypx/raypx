import { describe, expect, test } from "vite-plus/test";
import { assertLockedGraph } from "../../lib/consumer/lock.ts";

type Lock = Parameters<typeof assertLockedGraph>[0];
function graph(): Lock {
  return {
    lockfileVersion: 1,
    workspaces: {},
    packages: {
      parent: ["parent@1.0.0", "", { dependencies: { child: "^1.0.0" } }, "parent-integrity"],
      child: ["child@1.0.0", "", {}, "child-integrity"],
      "other/child": ["child@2.0.0", "", {}, "child-v2-integrity"],
    },
  };
}

describe("consumer lock graph isolation", () => {
  test("accepts spec normalization with the same resolved edge", () => {
    const expected = graph();
    const actual = graph();
    actual.packages.parent![2] = { dependencies: { child: "1.0.0" } };
    expect(() => assertLockedGraph(expected, actual)).not.toThrow();
  });

  test("rejects a registry version outside the source lock", () => {
    const actual = graph();
    actual.packages.child![0] = "child@3.0.0";
    expect(() => assertLockedGraph(graph(), actual)).toThrow("graph drifted");
  });

  test("rejects an altered integrity", () => {
    const actual = graph();
    actual.packages.child![3] = "unexpected-integrity";
    expect(() => assertLockedGraph(graph(), actual)).toThrow("graph drifted");
  });

  test("rejects a changed edge even when both versions already exist", () => {
    const actual = graph();
    actual.packages["parent/child"] = actual.packages["other/child"]!;
    expect(() => assertLockedGraph(graph(), actual)).toThrow("parent (parent@1.0.0)");
  });

  test("uses the nearest parent for scoped, nested dependency resolution", () => {
    const expected = graph();
    expected.packages["@scope/parent"] = expected.packages.parent!;
    expected.packages["@scope/parent/child"] = expected.packages["other/child"]!;
    delete expected.packages.parent;
    expect(() => assertLockedGraph(expected, structuredClone(expected))).not.toThrow();
    const actual = structuredClone(expected);
    delete actual.packages["@scope/parent/child"];
    expect(() => assertLockedGraph(expected, actual)).toThrow("graph drifted");
  });
});
