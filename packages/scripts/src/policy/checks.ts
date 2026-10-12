import { checkArchitecture } from "./checks/architecture.js";
import { join } from "node:path";

import { checkDocumentationIndex, checkDocumentationLinks } from "./checks/docs.js";
import { checkWorkspaceManifests } from "./checks/manifests.js";
import { checkTaskGraph } from "./checks/tasks.js";
import { checkProjectSkill, checkVendoredSkills } from "./checks/skills.js";
import { checkTypeScriptConfigs } from "./checks/typescript.js";
import { checkWorkspaceAgents, checkWorkspaceIgnores } from "./checks/workspace.js";
import {
  findEmptyDirectories,
  findNonWorkspaceDirectories,
  parseListedWorkspacePaths,
  validateListedWorkspacePaths,
  validateWorkspaceInventory,
} from "./workspaces.js";

export type PolicySeverity = "error" | "warn";

export interface PolicyFinding {
  /** Dotted check name, for example `agents.workspace`. */
  check: string;
  /** A copy-pasteable next step; rendered as a `Fix:` line. */
  fix: string;
  /** Repository-relative path the finding is about. */
  location: string;
  message: string;
  severity: PolicySeverity;
}

export interface PolicyReport {
  findings: PolicyFinding[];
  errors: number;
  warnings: number;
}

export interface PolicyDependencies {
  /** Repository-relative markdown files that policy owns. */
  listMarkdownFiles(): Promise<string[]>;
  /** Every file inside the resolved workspaces, repository-relative. */
  listWorkspaceFiles(): Promise<string[]>;
  /** Repository-relative workspace directories resolved from Bun globs. */
  listWorkspaceMembers(): Promise<string[]>;
  /** Every directory matched by a workspace glob, whether or not it is one. */
  listWorkspaceCandidates(): Promise<string[]>;
  /** Directories under workspace roots that hold no files at any depth. */
  listEmptyDirectories(): Promise<string[]>;
  /** Skill names present under `.agents/skills`, excluding symlinks. */
  listVendoredSkills(): Promise<string[]>;
  pathExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  /** Resolves a symlink's literal target text, or null when it is not a link. */
  readLink(path: string): Promise<string | null>;
  /** Only `applyPolicyFixes` writes. The checks themselves never touch the tree. */
  writeFile(path: string, content: string): Promise<void>;
  repositoryRoot: string;
  /** Enable once the project skill is committed. */
  verifySkills: boolean;
}

const readme = "README.md";
const readmeWorkspaceHeading = "Workspace map";

function createPolicyReport(findings: PolicyFinding[]): PolicyReport {
  return {
    findings,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warn").length,
  };
}

/** Orchestrates policy domains; each rule implementation lives in `checks/`. */
export async function runPolicy(dependencies: PolicyDependencies): Promise<PolicyReport> {
  const [members, candidates, empty, files, workspaceFiles] = await Promise.all([
    dependencies.listWorkspaceMembers(),
    dependencies.listWorkspaceCandidates(),
    dependencies.listEmptyDirectories(),
    dependencies.listMarkdownFiles(),
    dependencies.listWorkspaceFiles(),
  ]);
  const rootAgents = await dependencies.readFile(join(dependencies.repositoryRoot, "AGENTS.md"));
  const readmeContent = await dependencies.readFile(join(dependencies.repositoryRoot, readme));

  const nonWorkspace = findNonWorkspaceDirectories(candidates, members);
  const alreadyReported = new Set(nonWorkspace.map((finding) => finding.location));

  const findings = [
    ...(await checkWorkspaceAgents(dependencies, members)),
    ...validateWorkspaceInventory(members, rootAgents),
    ...nonWorkspace,
    ...findEmptyDirectories(empty.filter((directory) => !alreadyReported.has(directory))),
    ...validateListedWorkspacePaths(
      readme,
      parseListedWorkspacePaths(readmeContent, readmeWorkspaceHeading),
      members,
    ),
    ...(await checkWorkspaceIgnores(dependencies, members)),
    ...(await checkWorkspaceManifests(dependencies, members, workspaceFiles)),
    ...(await checkTaskGraph(dependencies)),
    ...(await checkArchitecture(dependencies, members, workspaceFiles)),
    ...(await checkTypeScriptConfigs(dependencies, members, workspaceFiles)),
    ...(await checkDocumentationLinks(dependencies, files)),
    ...(await checkDocumentationIndex(dependencies, files)),
    ...(dependencies.verifySkills
      ? [...(await checkProjectSkill(dependencies)), ...(await checkVendoredSkills(dependencies))]
      : []),
  ];
  return createPolicyReport(findings);
}
