import { spawnProcess, sleep } from "@raypx/runtime-node/process";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { enrollTestProfile } from "../helpers/instance.ts";
import { aiFixture } from "../helpers/ai.ts";
import type { AgentTask, TaskContinuation } from "@raypx/core/tasks";

/** The production executable owns both IPC clients and a detached, enrolled Pi daemon. */
export async function smokeManagedPi(launch: string[], dataDir: string) {
  const profile = "pi-acceptance",
    home = join(dataDir, "managed-pi-home"),
    project = join(dataDir, "managed-pi-project");
  await mkdir(home);
  await mkdir(project);
  const closeInstance = await enrollTestProfile({ dataDir, profile }, launch);
  const server = await aiFixture({
    toolSequence: [
      {
        name: "files_write",
        arguments: { path: "approved.txt", text: "Approved by compiled CLI", version: null },
      },
      null,
    ],
  });
  const invoke = async (
    group: string,
    action: string[],
    input?: unknown,
    failureAllowed = false,
  ) => {
    const child = spawnProcess(
      [
        ...launch,
        group,
        ...action,
        ...(input === undefined
          ? []
          : [
              group === "files" && action[0] === "authorize" && typeof input === "string"
                ? input
                : JSON.stringify(input),
            ]),
        "--profile",
        profile,
        "--data-dir",
        dataDir,
        "--json",
      ],
      {
        cwd: dataDir,
        env: { ...process.env, PATH: "", RAYPX_HOME: home },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 20_000,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (!failureAllowed) assert.equal(code, 0, "Compiled task command failed: " + stderr);
    return stdout.trim() ? JSON.parse(stdout) : undefined;
  };
  const get = (id: string): Promise<{ task: AgentTask; piContinuation: TaskContinuation }> =>
    invoke("tasks", ["get"], { id });
  const wait = async (test: () => Promise<boolean>) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await test()) return;
      await sleep(50);
    }
    assert.fail("Compiled Pi state did not reach its expected checkpoint");
  };
  try {
    await writeFile(
      join(home, "config.toml"),
      `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url}"\n`,
    );
    const root = await invoke("files", ["authorize"], project);
    await invoke("tasks", ["configure"], { rootId: root.id, providers: ["pi"] });
    const id = crypto.randomUUID();
    const receipt = await invoke("tasks", ["create"], {
      id,
      projectId: root.id,
      provider: "pi",
      prompt: "Synthetic compiled coding task",
      mode: "run",
    });
    assert.equal(receipt.commandId, id);
    await wait(async () => (await get(id)).task.status === "waiting");
    const approvals = await invoke("tasks", ["approvals", "list"]);
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].title, "files_write");
    await assert.rejects(readFile(join(project, "approved.txt")), { code: "ENOENT" });
    await invoke("tasks", ["approvals", "decide"], {
      id: approvals[0].id,
      decision: { type: "allow" },
    });
    await wait(async () => (await get(id)).task.status === "succeeded");
    assert.equal(await readFile(join(project, "approved.txt"), "utf8"), "Approved by compiled CLI");
    await invoke("daemon", ["stop"]);
    await invoke("daemon", ["start"]);
    const context = (await get(id)).piContinuation;
    assert.equal(context.blocked, false);
    const next = crypto.randomUUID();
    await invoke("tasks", ["follow-up"], {
      id: next,
      parentTaskId: id,
      prompt: "Continue after restart",
      contextRevision: context.revision,
    });
    await wait(async () => (await get(next)).task.status === "succeeded");
    assert.equal(server.requests.length, 3);
    assert.ok(
      server.requests.every((request) => request.authorization === null && request.apiKey === null),
    );
  } finally {
    await invoke("daemon", ["stop"], undefined, true);
    await closeInstance();
    await server.stop();
  }
}
