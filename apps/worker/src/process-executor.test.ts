import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import { InMemoryCloudRepository } from "@voidmix/db";
import { defaultCloudLimits } from "@voidmix/core";
import { createProcessExecutor, runnerEnvironment } from "./process-executor.js";

describe("isolated Node Runner", () => {
  it("uses an explicit environment without inherited credentials", () => {
    expect(Object.keys(runnerEnvironment()).sort()).toEqual(["LANG", "NODE_ENV", "PATH", "TZ"]);
  });
  it("starts one process for a duplicate claim and interrupts an exited unfinished Run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "voidmix-process-test-"));
    try {
      const entry = join(directory, "runner.mjs"),
        evidence = join(directory, "evidence.json");
      await writeFile(
        entry,
        `import {writeFile} from 'node:fs/promises';
process.on('message', async message => {
  if(message.type !== 'start') return;
  await writeFile(${JSON.stringify(evidence)}, JSON.stringify({ pid:process.pid, keys:Object.keys(process.env),
    runId:message.bootstrap.run.id, credential:!!message.bootstrap.credential }));
  process.send({type:'done'}); process.disconnect();
});`,
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
      await app.acceptQueued({ runId: run.id });
      const execute = createProcessExecutor({
        app,
        ownerId: "host",
        gatewayUrl: "http://localhost:3002",
        limits: defaultCloudLimits,
        renderer: {},
        delegationEnabled: true,
        exportEnabled: true,
        runnerEntry: entry,
      });
      await Promise.all([execute(run.id), execute(run.id)]);
      const result = JSON.parse(await readFile(evidence, "utf8")) as {
        pid: number;
        keys: string[];
        runId: string;
        credential: boolean;
      };
      expect(result.pid).not.toBe(process.pid);
      expect(result.runId).toBe(run.id);
      expect(result.credential).toBe(true);
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
      await rm(directory, { recursive: true, force: true });
    }
  });
});
