import { expectOnlyFinding } from "../test-fixtures.js";
import { describe, expect, it } from "vite-plus/test";
import { maximumAgentsLines, validateWorkspaceAgents } from "./agents.js";

const location = "packages/example/AGENTS.md";
const sections = ["Purpose", "Interface", "Ownership", "Constraints", "Verification"];
const document = (titles = sections) =>
  titles.map((title) => `## ${title}\n\nContent.\n`).join("\n");
const complete = document();

describe("validateWorkspaceAgents", () => {
  it("accepts a complete file", () => {
    expect(validateWorkspaceAgents(location, complete)).toEqual([]);
  });
  it.each([
    {
      name: "reports a missing section with actionable guidance",
      content: document(sections.filter((title) => title !== "Ownership")),
      expected: {
        check: "agents.workspace",
        location,
        message: "missing ## Ownership",
        severity: "error",
        fix: expect.stringContaining("## Ownership"),
      },
    },
    {
      name: "reports sections that are present but out of order",
      content: document(["Interface", "Purpose", ...sections.slice(2)]),
      expected: {
        message:
          "sections are out of order: Interface, Purpose, Ownership, Constraints, Verification",
      },
    },
    {
      name: "reports a file over the line cap",
      content: `${complete}${"\nfiller".repeat(maximumAgentsLines)}`,
      expected: {
        message: expect.stringMatching(/^has \d+ lines$/),
        fix: expect.stringContaining(String(maximumAgentsLines)),
      },
    },
  ])("$name", ({ content, expected }) => {
    expectOnlyFinding(validateWorkspaceAgents(location, content), expected);
  });
  it("reports an empty section", () => {
    const findings = validateWorkspaceAgents(location, complete.replace("Content.", ""));
    expect(findings.map((finding) => finding.message)).toEqual(["## Purpose is empty"]);
  });
  it("does not report order when a section is already missing", () => {
    const findings = validateWorkspaceAgents(location, "## Purpose\n\nOnly.\n");
    expect(findings.map((finding) => finding.message)).toEqual([
      "missing ## Interface",
      "missing ## Ownership",
      "missing ## Constraints",
      "missing ## Verification",
    ]);
  });
});
