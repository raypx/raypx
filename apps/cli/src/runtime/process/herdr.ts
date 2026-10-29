import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { CommandSpec, LocalEvent } from "@raypx/contracts/local";
import type { Environment } from "./bun";
import { LocalError } from "../errors";
import { herdrError, herdrRequest, record } from "./herdr-ipc";
import { herdrVersion } from "./herdr-release";
import { herdrFrame } from "./herdr-frame";
import { foreignLoopbackRequest } from "../local-http";

type Child = ReturnType<typeof Bun.spawn>;
type Session = {
  id: string;
  workspace: string;
  pane: string;
  marker: string;
  command?: CommandSpec;
  env?: Environment;
  control?: Child;
  reading?: Promise<void>;
  ready: Promise<void>;
  wake: () => void;
  cols: number;
  rows: number;
  finishing: boolean;
  done?: Promise<void>;
  pendingBytes: number;
  pendingWrites: number;
  writing: Promise<void>;
};
export function terminalLaunch() {
  return /(?:^|[/\\])bun(?:\.native)?(?:\.exe)?$/.test(process.execPath)
    ? [process.execPath, resolve(import.meta.dirname, "../../main.ts")]
    : [process.execPath];
}
const fail = (code: string, message: string) => new LocalError(code, message);
const retryRemoval = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };

/** Herdr owns PTYs/VT state. Raypx owns command admission and session lifetime. */
export class HerdrTerminalHost {
  private started: Promise<void> | undefined;
  private root = "";
  private socket = "";
  private env: Environment = {};
  private supervisor: Child | undefined;
  private closing = false;
  private stopping: Promise<void> | undefined;
  private readonly token = crypto.randomUUID() + crypto.randomUUID();
  private readonly sessions = new Map<string, Session>();
  private server: ReturnType<typeof Bun.serve> | undefined;
  constructor(
    private readonly binary: string,
    private readonly emit: (event: LocalEvent) => void,
    private readonly environment: () => Environment = () => process.env,
    private readonly launch = terminalLaunch(),
  ) {}
  has(id: string) {
    return this.sessions.has(id);
  }
  private request(method: string, params: unknown = {}) {
    return herdrRequest(this.socket, method, params);
  }
  private start() {
    return (this.started ??= this.startOnce());
  }
  private async startOnce() {
    if (!isAbsolute(this.binary) || !(await stat(this.binary).catch(() => undefined))?.isFile())
      throw fail("TERMINAL_HOST_UNAVAILABLE", "Select an absolute Herdr executable");
    const version = Bun.spawn([this.binary, "--version"], {
      stdout: "pipe",
      stderr: "ignore",
      windowsHide: true,
    });
    const versionDeadline = setTimeout(() => version.kill(), 5000);
    try {
      if (
        (await new Response(version.stdout).text()).trim() !== `herdr ${herdrVersion}` ||
        (await version.exited) !== 0
      )
        throw fail("TERMINAL_HOST_MISMATCH", "Herdr version differs from the pinned runtime");
    } finally {
      clearTimeout(versionDeadline);
    }
    // Short socket paths also work with Darwin's Unix-domain path limit.
    this.root = await mkdtemp(join(process.platform === "darwin" ? "/tmp" : tmpdir(), "rxh-"));
    await writeFile(join(this.root, "raypx-owner"), this.token, { mode: 0o600 });
    this.socket =
      process.platform === "win32"
        ? `rxh-${crypto.randomUUID()}.sock`
        : join(this.root, "api.sock");
    const config = join(this.root, "config/herdr");
    await mkdir(config, { recursive: true, mode: 0o700 });
    await writeFile(
      join(config, "config.toml"),
      `onboarding=false\n[terminal]\ndefault_shell=${JSON.stringify(process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh")}\nshell_mode="non_login"\n[update]\nversion_check=false\nmanifest_check=false\n[session]\nresume_agents_on_restore=false\n[ui.toast]\ndelivery="off"\n[ui.sound]\nenabled=false\n[advanced]\nscrollback_limit_bytes=1048576\n`,
      { mode: 0o600 },
    );
    this.env = Object.fromEntries(
      Object.entries(this.environment()).filter(
        ([key]) => !key.startsWith("HERDR_") && !["ENV", "BASH_ENV", "ZDOTDIR"].includes(key),
      ),
    );
    Object.assign(this.env, {
      XDG_CONFIG_HOME: join(this.root, "config"),
      XDG_STATE_HOME: join(this.root, "state"),
      HERDR_CONFIG_PATH: join(config, "config.toml"),
      HERDR_SOCKET_PATH: this.socket,
      RUST_LOG: "off",
    });
    this.server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      maxRequestBodySize: 4096,
      fetch: async (request) => {
        if (
          foreignLoopbackRequest(request, { port: this.server!.port! }) ||
          request.headers.get("authorization") !== `Bearer ${this.token}`
        )
          return new Response(null, { status: 403 });
        const match = /^\/(command|exit)\/([\w-]+)$/.exec(new URL(request.url).pathname);
        const session = match && this.sessions.get(match[2]!);
        if (!session) return new Response(null, { status: 404 });
        if (match[1] === "command" && request.method === "GET" && session.command && session.env) {
          const result = { command: session.command, env: session.env, marker: session.marker };
          delete session.command;
          delete session.env;
          return Response.json(result);
        }
        if (match[1] === "exit" && request.method === "POST") {
          const value: unknown = await request.json().catch(() => null);
          if (
            !record(value) ||
            !Number.isInteger(value.exitCode) ||
            Number(value.exitCode) < 0 ||
            Number(value.exitCode) > 255
          )
            return new Response(null, { status: 400 });
          await this.complete(session, Number(value.exitCode));
          return Response.json({ accepted: true });
        }
        return new Response(null, { status: 409 });
      },
    });
    this.supervisor = Bun.spawn(
      [...this.launch, "--herdr-internal", "server", this.binary, this.socket, this.token],
      {
        cwd: this.root,
        env: this.env,
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
      },
    );
    const until = Date.now() + 8000;
    for (;;) {
      if (this.closing || this.supervisor.exitCode !== null || Date.now() > until)
        throw fail("TERMINAL_HOST_UNAVAILABLE", "Herdr did not become ready");
      const ready = await this.request("ping").catch(() => undefined);
      if (ready) {
        if (ready.version !== herdrVersion) throw herdrError();
        break;
      }
      await Bun.sleep(25);
    }
    void this.supervisor.exited.then(() => {
      if (!this.closing) for (const session of this.sessions.values()) this.finish(session, 1);
    });
  }
  private control(session: Session, observe = false) {
    return Bun.spawn(
      [
        this.binary,
        "terminal",
        "session",
        observe ? "observe" : "control",
        session.pane,
        "--cols",
        String(session.cols),
        "--rows",
        String(session.rows),
      ],
      {
        cwd: this.root,
        env: this.env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
        windowsHide: true,
      },
    );
  }
  private async frames(session: Session, child: Child, firstOnly = false) {
    let buffer = "",
      sequence = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) throw herdrError();
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        const message: unknown = JSON.parse(line);
        const frame = herdrFrame(message, sequence);
        if (!frame) {
          if (firstOnly) throw herdrError();
          return;
        }
        sequence = frame.seq;
        this.emit({
          version: 1,
          event: "terminal.output",
          data: {
            id: session.id,
            data: frame.data,
            full: frame.full,
            cols: frame.cols,
            rows: frame.rows,
            frame: true,
            preserveScrollback: firstOnly,
          },
        });
        session.wake();
        if (firstOnly) return;
      }
    }
    if (buffer.trim() || decoder.decode() || firstOnly) throw herdrError();
  }
  async open(command: CommandSpec, cols: number, rows: number) {
    try {
      await this.start();
    } catch (error) {
      await this.close();
      throw error;
    }
    if (this.closing) throw fail("CLOSING", "Terminal host is shutting down");
    if (this.sessions.size >= 8) throw fail("TERMINAL_BACKPRESSURE", "Too many terminal sessions");
    const id = crypto.randomUUID();
    let wake!: () => void;
    const session: Session = {
      id,
      workspace: "",
      pane: "",
      marker: `raypx-done-${crypto.randomUUID()}`,
      command,
      env: this.environment(),
      cols,
      rows,
      finishing: false,
      pendingBytes: 0,
      pendingWrites: 0,
      writing: Promise.resolve(),
      ready: new Promise<void>((ready) => {
        wake = ready;
      }),
      wake: () => wake(),
    };
    this.sessions.set(id, session);
    try {
      const created = await this.request("workspace.create", { cwd: this.root, label: id });
      if (
        !record(created.workspace) ||
        !record(created.tab) ||
        typeof created.workspace.workspace_id !== "string" ||
        typeof created.tab.tab_id !== "string"
      )
        throw herdrError();
      session.workspace = created.workspace.workspace_id;
      const applied = await this.request("layout.apply", {
        tab_id: created.tab.tab_id,
        root: {
          type: "pane",
          cwd: this.root,
          command: [
            ...this.launch,
            "--herdr-internal",
            "child",
            String(this.server!.port),
            this.token,
            id,
          ],
        },
      });
      if (
        !record(applied.layout) ||
        !record(applied.layout.root) ||
        typeof applied.layout.root.pane_id !== "string"
      )
        throw herdrError();
      session.pane = applied.layout.root.pane_id;
      // A fast child can complete before its first controller attaches.
      session.control = this.control(session);
      session.reading = this.frames(session, session.control).catch(() => {
        if (!session.finishing) void this.stopSession(session, 1);
      });
      void session.control.exited.then(async () => {
        await session.reading;
        if (!session.finishing && this.sessions.has(id)) void this.stopSession(session, 1);
      });
      await Promise.race([
        session.ready,
        Bun.sleep(5000).then(() => {
          throw herdrError();
        }),
      ]);
      return { id };
    } catch (error) {
      await this.stopSession(session, 1);
      throw error;
    }
  }
  private async send(session: Session, message: unknown) {
    const stdin = session.control?.stdin;
    if (session.finishing || !stdin || typeof stdin === "number")
      throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    const line = JSON.stringify(message) + "\n";
    return this.queue(session, Buffer.byteLength(line), async () => {
      await stdin.write(line);
      await stdin.flush();
    });
  }
  private async queue(session: Session, size: number, write: () => Promise<void>) {
    if (session.pendingBytes + size > 128 * 1024 || session.pendingWrites >= 64)
      throw fail("TERMINAL_BACKPRESSURE", "Terminal input queue is full");
    session.pendingBytes += size;
    session.pendingWrites++;
    const operation = session.writing.then(async () => {
      if (session.finishing) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
      await write();
    });
    session.writing = operation.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            void this.stopSession(session, 1);
            reject(fail("TERMINAL_IO_TIMEOUT", "Terminal delivery is uncertain"));
          }, 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      session.pendingBytes -= size;
      session.pendingWrites--;
    }
  }
  async input(id: string, data: string) {
    if (data.length > 87384 || Buffer.byteLength(data, "base64") > 64 * 1024)
      throw fail("TOO_LARGE", "Terminal input is limited to 64 KiB");
    if (Buffer.from(data, "base64").toString("base64") !== data)
      throw fail("INVALID_INPUT", "Invalid terminal input encoding");
    const session = this.sessions.get(id);
    if (!session) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    let text: string | undefined;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(data, "base64"));
    } catch {
      /* Binary input keeps the public byte-stream path. */
    }
    if (text === undefined) await this.send(session, { type: "terminal.input", bytes: data });
    else
      await this.queue(session, data.length, async () => {
        await this.request("pane.send_text", { pane_id: session.pane, text });
      });
    return { accepted: true };
  }
  async resize(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id);
    if (!session) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    await this.send(session, { type: "terminal.resize", cols, rows });
    session.cols = cols;
    session.rows = rows;
    return { accepted: true };
  }
  async paste(id: string, text: string) {
    const session = this.sessions.get(id);
    if (!session) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    const size = Buffer.byteLength(text);
    if (size > 64 * 1024) throw fail("TOO_LARGE", "Terminal input is limited to 64 KiB");
    // Herdr applies the pane's bracketed-paste mode; xterm only displays frames.
    await this.queue(session, size, async () => {
      await this.request("pane.send_input", { pane_id: session.pane, text });
    });
    return { accepted: true };
  }
  async scroll(id: string, direction: "up" | "down", lines: number) {
    const session = this.sessions.get(id);
    if (!session) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    await this.send(session, { type: "terminal.scroll", direction, lines });
    return { accepted: true };
  }
  async key(id: string, key: string) {
    const session = this.sessions.get(id);
    if (!session) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    await this.queue(session, key.length, async () => {
      await this.request("pane.send_input", { pane_id: session.pane, keys: [key] });
    });
    return { accepted: true };
  }
  async mouse(
    id: string,
    event: {
      action: "down" | "up" | "drag" | "move";
      button: "left" | "middle" | "right";
      column: number;
      row: number;
      modifiers: number;
    },
  ) {
    const session = this.sessions.get(id);
    if (!session) throw fail("TERMINAL_NOT_FOUND", "Terminal is closed");
    await this.send(session, { type: "terminal.mouse", ...event });
    return { accepted: true };
  }
  private async complete(session: Session, code: number) {
    if (session.finishing) return session.done;
    // The command may exit before layout.apply has returned its pane id.
    const until = Date.now() + 5000;
    while (!session.pane && !session.finishing && Date.now() < until) await Bun.sleep(10);
    if (session.finishing) return session.done;
    session.finishing = true;
    session.done = (async () => {
      try {
        let observed = false;
        while (Date.now() < until) {
          const info = await this.request("pane.get", { pane_id: session.pane });
          if (record(info.pane) && info.pane.terminal_title === session.marker) {
            observed = true;
            break;
          }
          await Bun.sleep(10);
        }
        if (!observed) throw herdrError();
        // Preserve a bounded history after the owned pane is closed. Screen
        // frames alone only contain the visible viewport, not terminal scrollback.
        const snapshot = await this.request("pane.read", {
          pane_id: session.pane,
          source: "recent",
          format: "ansi",
          lines: 1000,
        });
        const history = snapshot.read;
        if (
          !record(history) ||
          typeof history.text !== "string" ||
          Buffer.byteLength(history.text) > 4 * 1024 * 1024
        )
          throw herdrError();
        if (session.control?.stdin && typeof session.control.stdin !== "number")
          await session.control.stdin.end();
        const control = session.control;
        const drainDeadline = setTimeout(() => control?.kill(), 2000);
        try {
          await session.reading;
        } finally {
          clearTimeout(drainDeadline);
        }
        this.emit({
          version: 1,
          event: "terminal.output",
          data: {
            id: session.id,
            data: Buffer.from(history.text.replace(/\r?\n/g, "\r\n")).toString("base64"),
            full: true,
            frame: false,
          },
        });
        const observer = this.control(session, true);
        const deadline = setTimeout(() => observer.kill(), 3000);
        try {
          await this.frames(session, observer, true);
        } finally {
          observer.kill();
          await observer.exited;
          clearTimeout(deadline);
        }
        this.finish(session, code);
      } catch {
        this.finish(session, 1);
      } finally {
        await this.request("workspace.close", { workspace_id: session.workspace }).catch(() => {});
      }
    })();
    return session.done;
  }
  private finish(session: Session, exitCode: number) {
    if (!this.sessions.delete(session.id)) return;
    session.wake();
    this.emit({ version: 1, event: "terminal.exit", data: { id: session.id, exitCode } });
  }
  private stopSession(session: Session, code: number) {
    if (session.done) return session.done;
    session.finishing = true;
    return (session.done = (async () => {
      await this.request("workspace.close", { workspace_id: session.workspace }).catch(() => {});
      session.control?.kill();
      await session.control?.exited;
      await session.reading;
      this.finish(session, code);
    })());
  }
  cancel(id: string) {
    const session = this.sessions.get(id);
    if (!session) return { cancelled: false };
    void this.stopSession(session, 130);
    return { cancelled: true };
  }
  close() {
    return (this.stopping ??= this.closeOnce());
  }
  private async closeOnce() {
    this.closing = true;
    await this.started?.catch(() => {});
    await Promise.allSettled(
      [...this.sessions.values()].map((session) => this.stopSession(session, 130)),
    );
    if (this.supervisor) {
      const deadline = setTimeout(() => this.supervisor?.kill(), 10_000);
      try {
        const input = this.supervisor.stdin;
        if (input && typeof input !== "number") {
          try {
            await input.end();
          } catch {
            /* Supervisor may have already exited. */
          }
        }
        await this.supervisor.exited;
      } finally {
        clearTimeout(deadline);
      }
    }
    await this.server?.stop(true);
    if (this.root) await rm(this.root, retryRemoval);
  }
}
