import { connectDatabase } from "@raypx/database/connection";
import {
  conversationEvents,
  conversationRunCheckpoints,
  conversationEffects,
  conversationToolCalls,
  deviceConnectorOperations,
  deviceConnectorEvents,
  protectedInputRequests,
} from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApiClient } from "@raypx/client/api";
import { z } from "zod";
import type { Subprocess } from "bun";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname) ||
  !/_test(?:_[a-z0-9]+)?$/.test(new URL(databaseUrl).pathname)
)
  throw new Error(
    "The real connector test requires an explicitly selected disposable loopback test database",
  );
const repositoryRoot = resolve(import.meta.dirname, "../../../../..");
const invocation = process.env.RAYPX_DEVICE_TEST_CLI
  ? [resolve(process.env.RAYPX_DEVICE_TEST_CLI)]
  : [process.execPath, "--no-env-file", resolve(repositoryRoot, "apps/cli/src/main.ts")];
const fixture = resolve(repositoryRoot, "apps/api/tests/helpers/workspace-server.ts");
const origin = "http://127.0.0.1:4173";
let directory: string;
let dataDirectory: string;
let workspace: string;
let serverOrigin: string;
let processServer: Subprocess<"ignore", "pipe", "pipe"> | undefined;
let logs = "";
let drain: Promise<void> | undefined;
let clientHeaders: Record<string, string>;
let client: ReturnType<typeof createApiClient>;
async function boundedText(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const part of stream) {
    total += part.byteLength;
    if (total > maxBytes) throw new Error("Fixture output exceeded its bound");
    chunks.push(part);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function device(action: string, input?: unknown) {
  const child = Bun.spawn(
    [...invocation, "device", action, "--json", "--data-dir", dataDirectory],
    {
      cwd: repositoryRoot,
      env: { ...process.env, RAYPX_HOME: join(directory, "home") },
      stdin: input === undefined ? "ignore" : "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (input !== undefined && child.stdin) {
    await child.stdin.write(JSON.stringify(input));
    await child.stdin.end();
  }
  const stdout = boundedText(child.stdout, 64 * 1024);
  const stderr = boundedText(child.stderr, 64 * 1024);
  const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
  try {
    const [status, value, diagnostic] = await Promise.all([child.exited, stdout, stderr]);
    if (status !== 0) throw new Error(`Device ${action} failed: ${diagnostic}`);
    return JSON.parse(value) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "raypx-real-device-"));
  dataDirectory = join(directory, "data");
  workspace = join(directory, "workspace");
  await mkdir(workspace);
  await writeFile(join(workspace, "input.txt"), "Read through device");
  // Reserve an ephemeral loopback port ourselves; never reuse another listener.
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = reservation.port!;
  await reservation.stop(true);
  serverOrigin = `http://127.0.0.1:${port}`;
  processServer = Bun.spawn([process.execPath, "--no-env-file", fixture], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      RAYPX_VALIDATION: "1",
      TEST_DATABASE_URL: databaseUrl,
      CONTROL_E2E_PORT: String(port),
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    for await (const part of stream) {
      logs += new TextDecoder().decode(part);
      if (logs.length > 128 * 1024) logs = logs.slice(-128 * 1024);
    }
  };
  drain = Promise.all([pump(processServer.stdout), pump(processServer.stderr)]).then(() => {});
  await vi.waitFor(
    () => {
      if (!logs.includes("Control browser fixture ready"))
        throw new Error("Control fixture is not ready");
    },
    { timeout: 30_000, interval: 50 },
  );
  const signedIn = await fetch(`${serverOrigin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "control-e2e@example.com", password: "Raypx-control-test-123" }),
  });
  if (signedIn.status !== 200) throw new Error("Fixture sign-in failed");
  const cookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  clientHeaders = { origin, cookie };
  client = createApiClient({ baseUrl: serverOrigin, headers: clientHeaders });
}, 60_000);
afterAll(async () => {
  try {
    if (dataDirectory) await device("stop");
  } finally {
    if (processServer) {
      processServer.kill("SIGTERM");
      const timer = setTimeout(() => processServer?.kill("SIGKILL"), 10_000);
      try {
        await processServer.exited;
        await drain;
      } finally {
        clearTimeout(timer);
      }
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
it.skipIf(process.platform === "win32")(
  "pairs the actual outbound CLI daemon, reads device Files, stages member attachments, supplies protected command input and executes tools only after approvals",
  async () => {
    const created = await client.spaces.create({ name: `Real device ${crypto.randomUUID()}` });
    const spaceId = created.space.id;
    const pairing = await client.deviceComputers.createPairing({ spaceId });
    const prepared = z
      .object({
        confirmationId: z.uuid(),
        serverOrigin: z.literal(serverOrigin),
        spaceId: z.literal(spaceId),
      })
      .parse(await device("native", { action: "pair_prepare", serverOrigin, code: pairing.code }));
    // Explicit test native-confirmation hook; production entry has no --yes bypass.
    const paired = z
      .object({ paired: z.literal(true), deviceId: z.string() })
      .parse(
        await device("native", { action: "pair_confirm", confirmationId: prepared.confirmationId }),
      );
    await expect
      .poll(
        async () =>
          (await client.deviceComputers.list({ spaceId })).devices.find(
            (entry) => entry.id === paired.deviceId,
          )?.connectionState,
        { timeout: 20_000 },
      )
      .toBe("connected");
    const selected = z.object({ confirmationId: z.uuid() }).parse(
      await device("native", {
        action: "grant_prepare",
        serverOrigin,
        deviceId: paired.deviceId,
        spaceId,
        path: workspace,
      }),
    );
    const granted = z
      .object({
        granted: z.literal(true),
        deviceId: z.literal(paired.deviceId),
        grantId: z.string(),
      })
      .parse(
        await device("native", {
          action: "grant_confirm",
          confirmationId: selected.confirmationId,
        }),
      );
    const agent = await client.agents.create({
      spaceId,
      agent: {
        name: "Real device",
        instructions: "Execute the explicit fixture steps",
        model: { modelId: "fixture" },
      },
    });
    const conversationId = agent.conversation.id;
    await client.deviceComputers.select({
      spaceId,
      conversationId,
      selection: { deviceId: paired.deviceId, grantId: granted.grantId },
    });
    const deviceSelection = { deviceId: paired.deviceId, grantId: granted.grantId };
    const directoryRead = await client.computers.listDirectory({
      spaceId,
      device: deviceSelection,
      path: ".",
    });
    expect(directoryRead).toMatchObject({
      status: "available",
      entries: expect.arrayContaining([{ path: "input.txt", kind: "file" }]),
    });
    const memberRead = await client.computers.readFile({
      spaceId,
      device: deviceSelection,
      path: "input.txt",
    });
    expect(memberRead).toMatchObject({
      status: "available",
      bytes: Buffer.from("Read through device").toString("base64"),
      contentType: "text",
      truncated: false,
    });
    expect(await client.computers.get({ spaceId })).toMatchObject({
      status: "available",
      computer: null,
    });
    const attachment = await client.messageAttachments.upload({
      spaceId,
      conversationId,
      name: "member.txt",
      mediaType: "text/plain",
      bytes: Buffer.from("Explicit member upload").toString("base64"),
    });
    await client.conversations.send({
      spaceId,
      conversationId,
      message: {
        idempotencyKey: "roundtrip",
        text: "Fixture real device roundtrip",
        attachmentIds: [attachment.id],
      },
    });
    for (const toolName of ["computer_write_file", "computer_run_command"]) {
      await expect
        .poll(
          async () =>
            (await client.approvals.pending({ spaceId })).map((request) => request.toolName),
          { timeout: 20_000 },
        )
        .toEqual([toolName]);
      const [request] = await client.approvals.pending({ spaceId });
      expect(request).toMatchObject({
        toolName,
        device: { id: paired.deviceId, directory: expect.stringContaining("workspace") },
      });
      const pendingFile = toolName === "computer_write_file" ? "output.txt" : "command.txt";
      await expect(readFile(join(workspace, pendingFile))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await client.approvals.answer({ spaceId, requestId: request!.id, decision: "approved" });
    }
    await expect
      .poll(
        async () =>
          (await client.conversations.snapshot({ spaceId, conversationId })).runs.map(
            (run) => run.state,
          ),
        { timeout: 20_000 },
      )
      .toEqual(["succeeded"]);
    expect(await readFile(join(workspace, "output.txt"), "utf8")).toBe("Read through device");
    expect(await readFile(join(workspace, "command.txt"), "utf8")).toBe("approved");
    const snapshot = await client.conversations.snapshot({ spaceId, conversationId });
    expect(snapshot.segments.map((segment) => segment.text).join(" ")).toContain(
      "Device roundtrip complete",
    );
    const inboxPath = `inbox/${snapshot.runs[0]!.id}/${attachment.id}`;
    expect(snapshot.messages[0]?.attachments?.[0]?.deliveries).toEqual([
      expect.objectContaining({ state: "available", path: inboxPath, reason: null }),
    ]);
    expect(await readFile(join(workspace, inboxPath), "utf8")).toBe("Explicit member upload");
    expect(
      await client.computers.readFile({ spaceId, device: deviceSelection, path: "output.txt" }),
    ).toMatchObject({
      status: "available",
      bytes: Buffer.from("Read through device").toString("base64"),
    });
    const effects = await client.approvals.effects({ spaceId, runId: snapshot.runs[0]!.id });
    expect(
      effects.filter((effect) => effect.state === "succeeded").map((effect) => effect.toolName),
    ).toEqual(["computer_write_file", "computer_run_command"]);
    const status = z
      .object({ running: z.literal(true), paired: z.literal(true) })
      .parse(await device("status"));
    expect(status.running).toBe(true);
    // Both private delivery channels traverse the actual connector and its restricted journal.
    for (const destination of ["environment", "stdin"]) {
      const protectedAgent = await client.agents.create({
        spaceId,
        agent: {
          name: "Protected device",
          instructions: "Execute only the requested command",
          model: { modelId: "browser-fixture" },
        },
      });
      const protectedConversationId = protectedAgent.conversation.id;
      await client.deviceComputers.select({
        spaceId,
        conversationId: protectedConversationId,
        selection: { deviceId: paired.deviceId, grantId: granted.grantId },
      });
      const value = `device-protected-${crypto.randomUUID()}`;
      await client.conversations.send({
        spaceId,
        conversationId: protectedConversationId,
        message: {
          idempotencyKey: crypto.randomUUID(),
          text: `Fixture real device protected ${destination}`,
        },
      });
      await expect
        .poll(async () => (await client.approvals.pending({ spaceId })).length, { timeout: 20_000 })
        .toBe(1);
      expect(await client.protectedInputs.pending({ spaceId })).toHaveLength(0);
      const [approval] = await client.approvals.pending({ spaceId });
      await client.approvals.answer({ spaceId, requestId: approval!.id, decision: "approved" });
      await expect
        .poll(async () => (await client.protectedInputs.pending({ spaceId })).length, {
          timeout: 20_000,
        })
        .toBe(1);
      const [input] = await client.protectedInputs.pending({ spaceId });
      await client.protectedInputs.answer({
        spaceId,
        requestId: input!.id,
        answer: { decision: "answer", value },
      });
      await expect
        .poll(
          async () =>
            (
              await client.conversations.snapshot({
                spaceId,
                conversationId: protectedConversationId,
              })
            ).runs.find((run) => run.id === input!.runId)?.state,
          { timeout: 20_000 },
        )
        .toBe("succeeded");
      const db = connectDatabase(databaseUrl);
      try {
        const surfaces: unknown[] = [
          logs,
          await readFile(
            join(dataDirectory, "profiles", "default", "device-connector", "connector.json"),
            "utf8",
          ),
        ];
        for (const table of [
          conversationEvents,
          conversationRunCheckpoints,
          conversationEffects,
          conversationToolCalls,
          deviceConnectorOperations,
          deviceConnectorEvents,
          protectedInputRequests,
        ])
          surfaces.push(await db.db.select().from(table).where(eq(table.spaceId, spaceId)));
        const transcript = await fetch(`${serverOrigin}/fixture/conversation/transcript`, {
          method: "POST",
          headers: { ...clientHeaders, "content-type": "application/json" },
          body: JSON.stringify({ spaceId, conversationId: protectedConversationId }),
        });
        expect(transcript.status).toBe(200);
        surfaces.push(await transcript.json());
        const values = [
          value,
          Buffer.from(value).toString("base64"),
          Buffer.from(value).toString("base64url"),
          Buffer.from(value).toString("hex"),
          encodeURIComponent(value),
        ];
        for (const surface of surfaces)
          expect(values.some((variant) => JSON.stringify(surface).includes(variant))).toBe(false);
        const rows = await db.db
          .select()
          .from(protectedInputRequests)
          .where(eq(protectedInputRequests.id, input!.id));
        expect(rows[0]).toMatchObject({
          state: "consumed",
          ciphertext: null,
          wrappedDataKey: null,
          keyId: null,
        });
      } finally {
        await db.close();
      }
    }
    await client.deviceComputers.revoke({ spaceId, deviceId: paired.deviceId });
    expect(
      await client.computers.listDirectory({ spaceId, device: deviceSelection, path: "." }),
    ).toEqual({ status: "unavailable", code: "DEVICE_GRANT_UNAVAILABLE" });
    await expect
      .poll(async () => z.object({ running: z.boolean() }).parse(await device("status")).running, {
        timeout: 10_000,
      })
      .toBe(false);
    expect(logs).not.toContain(pairing.code);
  },
  90_000,
);
