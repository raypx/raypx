import { collectFindings, findingFor } from "../findings.js";
import { join } from "node:path";

import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { parseSkillsLock, validateVendoredSkills, vendoredSkillLinks } from "../skills.js";

const projectSkill = "skills/voidmix-infra/SKILL.md";
const skillSymlink = ".claude/skills/voidmix-infra";
const expectedSkillTarget = "../../skills/voidmix-infra";
const skillsLock = "skills-lock.json";

export async function checkProjectSkill(
  dependencies: PolicyDependencies,
): Promise<PolicyFinding[]> {
  const { findings, report } = collectFindings(findingFor("skills.project"));
  const skillPath = join(dependencies.repositoryRoot, projectSkill);

  if (!(await dependencies.pathExists(skillPath))) {
    report(
      projectSkill,
      "the project skill is missing",
      `create ${projectSkill} with name and description frontmatter`,
    );
  } else {
    const content = await dependencies.readFile(skillPath);
    if (!/^---\n[\s\S]*?\bname:\s*\S/m.test(content)) {
      report(
        projectSkill,
        "frontmatter is missing a name field",
        `add "name: voidmix-infra" to the frontmatter of ${projectSkill}`,
      );
    }
    if (!/^---\n[\s\S]*?\bdescription:\s*\S/m.test(content)) {
      report(
        projectSkill,
        "frontmatter is missing a description field",
        `add a description to the frontmatter of ${projectSkill} so the skill can be selected`,
      );
    }
    if (/\bTODO\b/.test(content)) {
      report(
        projectSkill,
        "contains an unresolved TODO",
        `resolve or remove the TODO in ${projectSkill}; agents read it as instruction`,
      );
    }
  }

  const linkTarget = await dependencies.readLink(join(dependencies.repositoryRoot, skillSymlink));
  if (linkTarget !== expectedSkillTarget) {
    report(
      skillSymlink,
      linkTarget === null
        ? "is missing or is not a symlink"
        : `points at ${linkTarget} instead of ${expectedSkillTarget}`,
      `run: rm -rf ${skillSymlink} && ln -s ${expectedSkillTarget} ${skillSymlink}`,
    );
  }
  return findings;
}

export async function checkVendoredSkills(
  dependencies: PolicyDependencies,
): Promise<PolicyFinding[]> {
  const lockPath = join(dependencies.repositoryRoot, skillsLock);
  const installed = await dependencies.listVendoredSkills();
  if (!(await dependencies.pathExists(lockPath))) {
    if (installed.length === 0) return [];
    return [
      findingFor("skills.vendored")(
        skillsLock,
        `${installed.length} vendored skills are installed with no lockfile`,
        `commit ${skillsLock} so each skill's source and content hash are recorded`,
      ),
    ];
  }

  let locked: string[];
  try {
    locked = parseSkillsLock(await dependencies.readFile(lockPath));
  } catch {
    return [
      findingFor("skills.vendored")(
        skillsLock,
        "is not valid JSON",
        `repair ${skillsLock} or regenerate it with: bun run skills:update`,
      ),
    ];
  }

  const linkTargets = new Map<string, string | null>();
  for (const name of [...locked, ...installed]) {
    for (const { root } of vendoredSkillLinks) {
      const location = `${root}/${name}`;
      if (linkTargets.has(location)) continue;
      linkTargets.set(
        location,
        await dependencies.readLink(join(dependencies.repositoryRoot, location)),
      );
    }
  }
  return validateVendoredSkills(locked, installed, linkTargets);
}
