import { taskScripts as validate } from "@raypx-kit/devkit/tasks";
interface Manifest {
  scripts?: Record<string, string>;
  raypx?: { taskScripts?: Record<string, string> };
}
export function taskScripts(manifest: Manifest) {
  return validate(manifest.scripts ?? {}, manifest.raypx?.taskScripts);
}
