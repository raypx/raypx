import {
  runRepositoryCommands,
  type RepositoryProcessDependencies,
} from "../runtime/process-dependencies.js";

export const runSkillsUpdate = (dependencies: RepositoryProcessDependencies) =>
  runRepositoryCommands(dependencies, "skills.update", [["bunx", "skills", "update", "-p", "-y"]]);
