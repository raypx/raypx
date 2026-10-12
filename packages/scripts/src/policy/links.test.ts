import { describe, expect, it } from "vite-plus/test";

import { collectRelativeLinks, reachableFrom } from "./links.js";

describe("collectRelativeLinks", () => {
  it.each([
    ["sibling", "docs/development/agents.md", "testing.md", "docs/development/testing.md"],
    [
      "parent traversal",
      "packages/db/AGENTS.md",
      "../../docs/architecture/tooling.md",
      "docs/architecture/tooling.md",
    ],
    ["root relative", "docs/README.md", "/AGENTS.md", "AGENTS.md"],
    ["fragment", "AGENTS.md", "docs/x.md#a-section", "docs/x.md"],
    ["titled", "AGENTS.md", 'docs/x.md "A title"', "docs/x.md"],
  ])("resolves %s links", (_name, file, target, resolved) => {
    expect(collectRelativeLinks(file, `See [testing](${target}).`)).toEqual([
      { target: target.split(' "')[0], resolved },
    ]);
  });

  it("ignores external and in-page targets", () => {
    const content = [
      "[http](http://example.com/a.md)",
      "[https](https://example.com/b.md)",
      "[mail](mailto:someone@example.com)",
      "[protocol relative](//example.com/c.md)",
      "[anchor](#section)",
    ].join("\n");

    expect(collectRelativeLinks("README.md", content)).toEqual([]);
  });

  it("deduplicates repeated targets", () => {
    const links = collectRelativeLinks("AGENTS.md", "[a](docs/x.md) and [b](docs/x.md)");

    expect(links).toHaveLength(1);
  });

  it("ignores a link whose target is only a fragment of the current file", () => {
    expect(collectRelativeLinks("AGENTS.md", "[a](#)")).toEqual([]);
  });
});

describe("reachableFrom", () => {
  const edges = new Map<string, string[]>([
    ["docs/README.md", ["docs/architecture/README.md"]],
    ["docs/architecture/README.md", ["docs/architecture/decisions/README.md"]],
    ["docs/architecture/decisions/README.md", ["docs/architecture/decisions/0001-a.md"]],
    ["docs/architecture/decisions/0001-a.md", []],
    ["docs/orphan.md", ["docs/README.md"]],
  ]);

  it("reaches a document through a chain of sub-indexes", () => {
    expect(reachableFrom("docs/README.md", edges)).toContain(
      "docs/architecture/decisions/0001-a.md",
    );
  });

  it("does not reach a document that only links inward", () => {
    expect(reachableFrom("docs/README.md", edges).has("docs/orphan.md")).toBe(false);
  });

  it("includes the entry point itself", () => {
    expect(reachableFrom("docs/README.md", new Map())).toEqual(new Set(["docs/README.md"]));
  });

  it("terminates on a cycle", () => {
    const cyclic = new Map<string, string[]>([
      ["a.md", ["b.md"]],
      ["b.md", ["a.md"]],
    ]);

    expect(reachableFrom("a.md", cyclic)).toEqual(new Set(["a.md", "b.md"]));
  });
});
