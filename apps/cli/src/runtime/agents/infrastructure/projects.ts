import { spawnProcess } from "@raypx/runtime-node/process";
import type { DeviceProject } from "@raypx/contracts/tasks";
import { ContextError } from "@raypx/memory";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { desktopBinding } from "../model.ts";
import type { TaskContextTarget, AgentProvider } from "@raypx/core/tasks";
import { existsSync, realpathSync } from "node:fs";
import { acquireLock, type StateStore } from "../../state/index.ts";
import type { ExecutionProjects } from "../application/execution.ts";
export class LocalExecutionProjects implements ExecutionProjects {
  constructor(
    private readonly state: StateStore,
    private readonly projects: {
      deviceId(binding: string): string;
      projects(): { id: string; providers: AgentProvider[] }[];
    },
  ) {}
  validate(target: TaskContextTarget) {
    const root = this.state.roots().find((entry) => entry.id === target.projectId);
    const project = this.projects.projects().find((entry) => entry.id === target.projectId);
    if (
      this.projects.deviceId(desktopBinding(LOCAL_WORKSPACE_ID)) !== target.deviceId ||
      !project?.providers.length ||
      !root ||
      !existsSync(root.path)
    )
      throw new ContextError("CONTEXT_PROJECT_MISMATCH");
  }
  find(id: string, provider: AgentProvider) {
    const project = this.projects
      .projects()
      .find((entry) => entry.id === id && entry.providers.includes(provider));
    return project ? this.state.roots().find((entry) => entry.id === id)?.path : undefined;
  }
  canonical(path: string) {
    return realpathSync(path);
  }
  async lockKey(directory: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(directory));
    return (
      "agent-" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
    );
  }
  acquire(key: string) {
    return acquireLock(this.state.directory, key);
  }
  async list(): Promise<DeviceProject[]> {
    const roots = this.state.roots();
    const result: DeviceProject[] = [];
    for (const project of this.projects.projects()) {
      const root = roots.find((item) => item.id === project.id);
      if (!root || !project.providers.length || !existsSync(root.path)) continue;
      let dirty = false;
      try {
        const child = spawnProcess(["git", "status", "--porcelain", "--untracked-files=no"], {
          cwd: root.path,
          stdout: "pipe",
          stderr: "ignore",
        });
        const timer = setTimeout(() => child.kill(), 2000);
        dirty = Boolean((await new Response(child.stdout).text()).trim());
        await child.exited;
        clearTimeout(timer);
      } catch {
        /* non-Git folders are still valid */
      }
      result.push({ id: root.id, name: root.name, providers: project.providers, dirty });
    }
    return result;
  }
}
