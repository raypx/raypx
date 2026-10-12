import { findingFor, collectFindings } from "./findings.js";
import type { PolicyFinding } from "./checks.js";

export const requiredAgentsSections = [
  "Purpose",
  "Interface",
  "Ownership",
  "Constraints",
  "Verification",
] as const;

export const maximumAgentsLines = 200;

const sectionGuidance: Record<(typeof requiredAgentsSections)[number], string> = {
  Purpose: "state why the workspace exists and what it is for",
  Interface: "list the entrypoints, exports, or structures callers need",
  Ownership: "state which behavior this workspace owns and does not own",
  Constraints: "record dependency, runtime, and implementation invariants",
  Verification: "list the focused commands that validate changes",
};

interface Section {
  body: string;
  title: string;
}

function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const line of content.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading?.[1]) {
      current = { title: heading[1], body: "" };
      sections.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  return sections;
}

const finding = findingFor("agents.workspace");

/**
 * Validates one workspace AGENTS.md against the shared five-section schema.
 * Pure: it reads nothing and only inspects the text it is given.
 */
export function validateWorkspaceAgents(location: string, content: string): PolicyFinding[] {
  const { findings, report } = collectFindings(finding);
  const sections = parseSections(content);
  const titles = sections.map((section) => section.title);

  for (const required of requiredAgentsSections) {
    const section = sections.find((candidate) => candidate.title === required);
    if (!section) {
      report(
        location,
        `missing ## ${required}`,
        `add a "## ${required}" section and ${sectionGuidance[required]}`,
      );
      continue;
    }
    if (section.body.trim().length === 0) {
      report(
        location,
        `## ${required} is empty`,
        `fill in "## ${required}" and ${sectionGuidance[required]}`,
      );
    }
  }

  const present = requiredAgentsSections.filter((required) => titles.includes(required));
  const ordered = titles.filter((title): title is (typeof requiredAgentsSections)[number] =>
    (requiredAgentsSections as readonly string[]).includes(title),
  );
  if (present.length === requiredAgentsSections.length && ordered.join() !== present.join()) {
    report(
      location,
      `sections are out of order: ${ordered.join(", ")}`,
      `reorder the sections to ${requiredAgentsSections.join(", ")}`,
    );
  }

  const lines = content.replace(/\n$/, "").split("\n").length;
  if (lines > maximumAgentsLines) {
    report(
      location,
      `has ${lines} lines`,
      `keep AGENTS.md at or below ${maximumAgentsLines} lines and link to docs/ instead`,
    );
  }

  return findings;
}
