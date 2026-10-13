import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { InMemoryCloudRepository } from "@raypx/db";
import { defaultCloudLimits } from "@raypx/core";
import { createProcessExecutor, runnerEnvironment } from "./process-executor.js";

describe("isolated Bun Runner", () => {
  it("uses an explicit environment without inherited credentials", () => {
    expect(Object.keys(runnerEnvironment()).sort()).toEqual(["LANG", "NODE_ENV", "PATH", "TZ"]);
  });
  it("starts the single Worker entry in Runner mode once for a duplicate claim", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-process-test-"));
    const originalArguments = [...process.argv];
    try {
      const entry = join(directory, "index.mjs"),
        evidence = join(directory, "evidence.json");
      await writeFile(
        entry,
        `import {writeFile} from 'node:fs/promises';
process.on('message', async message => {
  if(message.type !== 'start') return;
  await writeFile(${JSON.stringify(evidence)}, JSON.stringify({ pid:process.pid, keys:Object.keys(process.env),
    runId:message.bootstrap.run.id, credential:!!message.bootstrap.credential,
    runtime:process.versions.bun, executable:process.execPath, arguments:process.execArgv, mode:process.argv.slice(2) }));
  process.send({type:'done'}); process.disconnect();
});
process.send({type:'ready'});`,
      );
      const app = createCloudApplication({
        repository: new InMemoryCloudRepository({
          users: [{ id: "owner", email: "owner@example.test" }],
        }),
      });
      const conversation = await app.createConversation({
        actorId: "owner",
        title: "Process",
        idempotencyKey: "conversation",
      });
      const { run } = await app.sendTurn({
        actorId: "owner",
        conversationId: conversation.id,
        mode: "search",
        prompt: "Research",
        attachmentIds: [],
        idempotencyKey: "turn",
      });
      // A bundled helper may live in chunks; the executable entry owns both roles.
      process.argv[1] = join(directory, "index.mjs");
      const execute = createProcessExecutor({
        app,
        ownerId: "host",
        gatewayUrl: "http://localhost:3002",
        limits: defaultCloudLimits,
      });
      await Promise.all([execute(run.id), execute(run.id)]);
      const result = JSON.parse(await readFile(evidence, "utf8")) as {
        pid: number;
        keys: string[];
        runId: string;
        credential: boolean;
        runtime: string;
        executable: string;
        arguments: string[];
        mode: string[];
      };
      expect(result.pid).not.toBe(process.pid);
      expect(result.runId).toBe(run.id);
      expect(result.credential).toBe(true);
      expect(result.runtime).toBe(process.versions.bun);
      expect(result.executable).toBe(process.execPath);
      expect(result.arguments).toContain("--no-env-file");
      expect(result.arguments).toContain("--no-install");
      expect(result.mode).toEqual(["--runner"]);
      // macOS injects its text-encoding setting into exec'd children.
      expect(result.keys.filter((key) => key !== "__CF_USER_TEXT_ENCODING").sort()).toEqual([
        "LANG",
        "NODE_ENV",
        "PATH",
        "TZ",
      ]);
      const snapshot = await app.getRunSnapshot({ actorId: "owner", runId: run.id });
      expect(snapshot.run.status).toBe("failed");
      expect(snapshot.run.error).toBe("interrupted");
    } finally {
      process.argv.splice(0, process.argv.length, ...originalArguments);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
