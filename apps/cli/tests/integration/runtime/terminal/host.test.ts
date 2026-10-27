import { expect, it } from "vite-plus/test";
import { mkdtemp, mkdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import {
  startTerminalHost,
  terminalFetch,
  readTerminalEndpoint,
} from "../../../../src/runtime/terminal/host";
import { TerminalStore } from "../../../../src/runtime/terminal/store";
import { terminalCapabilities } from "../../../../src/runtime/terminal/protocol";
import { createHash } from "node:crypto";
import { localFetch, loopbackTransport } from "../../../../src/runtime/local-http";
import type { TerminalSession } from "@raypx/contracts/terminal";
it.skipIf(loopbackTransport())(
  "reclaims only its owned socket directory after a host crash",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-terminal-crash-"));
    const child = Bun.spawn(
      [
        process.execPath,
        "run",
        join(import.meta.dirname, "../../../fixtures/terminal/stale-host.ts"),
        directory,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    let host: ReturnType<typeof startTerminalHost> | undefined;
    try {
      await expect
        .poll(() => {
          try {
            return readTerminalEndpoint(directory).socket;
          } catch {
            return undefined;
          }
        })
        .toBeDefined();
      const old = dirname(readTerminalEndpoint(directory).socket!);
      child.kill("SIGKILL");
      await child.exited;
      expect(existsSync(old)).toBe(true);
      host = startTerminalHost({ directory, projects: [] });
      expect(existsSync(old)).toBe(false);
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await child.exited;
      }
      await host?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "retains the active session through history eviction and bounds session memory",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-terminal-retention-")),
      project = await realpath(directory);
    const store = new TerminalStore(directory),
      projectId = store.projectId(project),
      now = new Date().toISOString();
    const sessions: TerminalSession[] = [];
    for (let index = 0; index < 256; index++) {
      const session: TerminalSession = {
        id: crypto.randomUUID(),
        provider: "codex",
        providerSessionId: `session-${index}`,
        projectId,
        capabilities: terminalCapabilities("codex"),
      };
      sessions.push(session);
      store.session(
        createHash("sha256")
          .update(JSON.stringify([session.provider, session.providerSessionId, projectId]))
          .digest("hex"),
        session,
      );
      store.save({
        version: 1,
        id: crypto.randomUUID(),
        invocationId: crypto.randomUUID(),
        sessionId: session.id,
        provider: "codex",
        kind: "permission",
        title: "Bash",
        body: "{}",
        questions: [],
        epoch: crypto.randomUUID(),
        revision: 1,
        encoding: "plain",
        status: "cancelled",
        decision: null,
        createdAt: now,
        expiresAt: now,
      });
    }
    store.close();
    const host = startTerminalHost({
      directory,
      projects: [project],
      away: true,
      reachable: () => true,
    });
    try {
      for (const providerSessionId of ["session-0", "new-session"]) {
        const pending = terminalFetch(host.endpoint, "hook", "/hook", {
          provider: "codex",
          input: {
            session_id: providerSessionId,
            cwd: project,
            hook_event_name: "PermissionRequest",
            tool_name: "Bash",
            tool_input: { command: "printf test" },
          },
        });
        await expect.poll(() => host.broker.pendingRequests().length).toBe(1);
        const request = host.broker.pendingRequests()[0]!;
        expect(request.sessionId === sessions[0]!.id).toBe(providerSessionId === "session-0");
        host.broker.decide({
          id: request.id,
          epoch: request.epoch,
          revision: request.revision,
          receiptId: crypto.randomUUID(),
          decision: { type: "deny", note: "test" },
        });
        expect((await pending).ok).toBe(true);
        expect(host.sessions()).toHaveLength(256);
      }
    } finally {
      await host.close();
    }
    const restored = startTerminalHost({ directory, projects: [project] });
    try {
      expect(restored.sessions()).toHaveLength(256);
      expect(restored.sessions().some((value) => value.id === sessions[0]!.id)).toBe(true);
    } finally {
      await restored.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "arbitrates a real private-socket exchange, separates hook/owner permissions and does not infer applied",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "raypx-terminal-ipc-"));
    await mkdir(join(dir, "project"));
    const project = await realpath(join(dir, "project"));
    const host = startTerminalHost({ directory: dir, projects: [project], away: true });
    try {
      expect(() => startTerminalHost({ directory: dir, projects: [project] })).toThrow(
        /already owns/,
      );
      const { socket } = host.endpoint;
      expect(socket === undefined || ((await stat(socket)).mode & 0o777) === 0o600).toBe(true);
      const noAuth = await localFetch(host.endpoint, "/state");
      expect(noAuth.status).toBe(403);
      expect((await terminalFetch(host.endpoint, "hook", "/state")).status).toBe(404);
      await terminalFetch(host.endpoint, "owner", "/watch", { active: true });
      const pending = terminalFetch(host.endpoint, "hook", "/hook", {
        provider: "codex",
        input: {
          session_id: "real-ipc-session",
          cwd: project,
          hook_event_name: "PermissionRequest",
          tool_name: "Bash",
          tool_input: { command: "printf test" },
        },
      });
      await expect.poll(() => host.broker.list().length).toBe(1);
      const request = host.broker.list()[0]!;
      const answer = {
        id: request.id,
        epoch: request.epoch,
        revision: request.revision,
        receiptId: crypto.randomUUID(),
        decision: { type: "allow" },
      };
      expect((await terminalFetch(host.endpoint, "hook", "/decision", answer)).status).toBe(404);
      expect((await terminalFetch(host.endpoint, "owner", "/decision", answer)).ok).toBe(true);
      expect(await (await pending).json()).toEqual({
        id: request.id,
        epoch: request.epoch,
        decision: { type: "allow" },
      });
      await terminalFetch(host.endpoint, "hook", "/delivered", {
        id: request.id,
        epoch: request.epoch,
      });
      expect(host.broker.get(request.id)?.status).toBe("delivered");
      expect(
        (
          await terminalFetch(host.endpoint, "owner", "/decision", {
            ...answer,
            receiptId: crypto.randomUUID(),
          })
        ).status,
      ).toBe(400);
    } finally {
      await host.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "returns no decision when Away is off, the viewer is absent or the project is not authorized",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "raypx-terminal-fallback-"));
    const project = await realpath(dir);
    const host = startTerminalHost({ directory: dir, projects: [project] });
    const input = {
      provider: "claude",
      input: {
        session_id: "session",
        cwd: project,
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "printf test" },
      },
    };
    try {
      expect(await (await terminalFetch(host.endpoint, "hook", "/hook", input)).json()).toEqual({
        fallback: true,
      });
      host.configure({ projects: [project], away: true, waitSeconds: 300 });
      expect(await (await terminalFetch(host.endpoint, "hook", "/hook", input)).json()).toEqual({
        fallback: true,
      });
      await terminalFetch(host.endpoint, "owner", "/watch", { active: true });
      expect(
        await (
          await terminalFetch(host.endpoint, "hook", "/hook", {
            ...input,
            input: { ...input.input, cwd: "/" },
          })
        ).json(),
      ).toEqual({ fallback: true });
      for (const tool of ["apply_patch", "mcp__test__run", "AskUserQuestion", "ExitPlanMode"]) {
        expect(
          await (
            await terminalFetch(host.endpoint, "hook", "/hook", {
              ...input,
              input: { ...input.input, tool_name: tool },
            })
          ).json(),
        ).toEqual({ fallback: true });
      }
      expect(host.broker.list()).toEqual([]);
    } finally {
      await host.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "ignores only the managed session while accepting a nested external agent",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-managed-hook-")),
      project = await realpath(directory);
    const host = startTerminalHost({
      directory,
      projects: [project],
      away: true,
      reachable: () => true,
      ignoreSession: (_provider, id) => id === "managed",
    });
    const hook = (session_id: string) =>
      terminalFetch(host.endpoint, "hook", "/hook", {
        provider: "claude",
        input: {
          hook_event_name: "PermissionRequest",
          session_id,
          cwd: project,
          tool_name: "Bash",
          tool_input: { command: "printf synthetic" },
        },
      });
    try {
      expect(await (await hook("managed")).json()).toEqual({ fallback: true });
      const nested = hook("nested");
      await expect.poll(() => host.broker.pendingRequests().length).toBe(1);
      const request = host.broker.pendingRequests()[0]!;
      host.broker.decide({
        id: request.id,
        epoch: request.epoch,
        revision: request.revision,
        receiptId: crypto.randomUUID(),
        decision: { type: "deny", note: "synthetic" },
      });
      expect(await (await nested).json()).toMatchObject({ decision: { type: "deny" } });
    } finally {
      await host.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
