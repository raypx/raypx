import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { temporaryRepository } from "../test-fixtures.js";

const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("../runtime/repository.js", () => ({
  get repositoryRoot() {
    return fixture.root;
  },
}));

import { createPolicyDependencies } from "./runtime.js";

describe("policy filesystem discovery", () => {
  it("skips exact desktop and Storybook output roots without hiding authored directories", async () => {
    fixture.root = await temporaryRepository({
      "package.json": JSON.stringify({ workspaces: ["apps/*", "packages/*"] }),
      "apps/desktop/package.json": "{}",
      "apps/desktop/src/main.ts": "export {};",
      "apps/desktop/build/README.md": "generated desktop output",
      "apps/desktop/build/output.ts": "generated desktop output",
      "apps/desktop/artifacts/README.md": "generated desktop package",
      "apps/desktop/artifacts/output.ts": "generated desktop package",
      "apps/desktop/src/artifacts/README.md": "authored source",
      "apps/storybook/package.json": "{}",
      "apps/storybook/storybook-static/README.md": "generated Storybook output",
      "apps/storybook/storybook-static/output.ts": "generated Storybook output",
      "apps/storybook/src/storybook-static/README.md": "authored source",
      "packages/agent-ui/package.json": "{}",
      "packages/agent-ui/src/artifacts/README.md": "authored artifact view",
      "packages/agent-ui/src/artifacts/index.ts": "export {};",
      "packages/agent-ui/src/build/README.md": "authored source",
    });
    const empty = [
      "apps/desktop/build/empty-output",
      "apps/desktop/artifacts/empty-output",
      "apps/storybook/storybook-static/sb-common-assets",
      "apps/desktop/src/empty-authored",
      "packages/agent-ui/src/artifacts/empty-authored",
      "packages/phantom",
    ];
    await Promise.all(empty.map((path) => mkdir(join(fixture.root, path), { recursive: true })));

    const deps = createPolicyDependencies();
    expect(await deps.listEmptyDirectories()).toEqual([
      "apps/desktop/src/empty-authored",
      "packages/agent-ui/src/artifacts/empty-authored",
      "packages/phantom",
    ]);
    expect(await deps.listWorkspaceCandidates()).toContain("packages/phantom");
    expect(await deps.listWorkspaceMembers()).not.toContain("packages/phantom");

    const sourceFiles = await deps.listWorkspaceFiles();
    expect(sourceFiles).toContain("packages/agent-ui/src/artifacts/index.ts");
    expect(sourceFiles).not.toContain("apps/desktop/build/output.ts");
    expect(sourceFiles).not.toContain("apps/desktop/artifacts/output.ts");
    expect(sourceFiles).not.toContain("apps/storybook/storybook-static/output.ts");

    const markdownFiles = await deps.listMarkdownFiles();
    expect(markdownFiles).toContain("apps/storybook/src/storybook-static/README.md");
    expect(markdownFiles).toContain("apps/desktop/src/artifacts/README.md");
    expect(markdownFiles).toContain("packages/agent-ui/src/artifacts/README.md");
    expect(markdownFiles).toContain("packages/agent-ui/src/build/README.md");
    expect(markdownFiles).not.toContain("apps/desktop/build/README.md");
    expect(markdownFiles).not.toContain("apps/desktop/artifacts/README.md");
    expect(markdownFiles).not.toContain("apps/storybook/storybook-static/README.md");
  });
});
