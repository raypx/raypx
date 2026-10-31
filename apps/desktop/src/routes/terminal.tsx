import { createFileRoute } from "@tanstack/react-router";
import { formText } from "../form-data";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Terminal as TerminalIcon, Square } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useTranslations } from "@raypx/i18n/browser";
import { themeTokens, useTheme } from "@raypx/ui/themes";
import { isDesktop, localRequest, onLocalEvent } from "../lib/desktop";
import { terminalFrame } from "../features/terminal/frame";
import { terminalKey } from "../features/terminal/input";

export const Route = createFileRoute("/terminal")({
  staticData: { page: { title: "common.terminal", layout: "tool" } },
  component: TerminalPage,
});

function encode(value: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function TerminalPage() {
  const t = useTranslations("terminal");
  const c = useTranslations("common");
  const j = useTranslations("jobs");
  const { resolvedTheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const id = useRef<string | null>(null);
  const mounted = useRef(false);
  const [running, setRunning] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const earlyExits = useRef(new Map<string, number>());
  const [started, setStarted] = useState(false);
  const earlyOutput = useRef<{ id: string; data: string; full: boolean }[]>([]);
  useEffect(() => {
    if (!container.current) return;
    mounted.current = true;
    const view = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      scrollback: 1000,
      convertEol: false,
      disableStdin: true,
    });
    const addon = new FitAddon();
    view.loadAddon(addon);
    view.open(container.current);
    terminal.current = view;
    fit.current = addon;
    view.attachCustomKeyEventHandler((event) => {
      const key = terminalKey(event);
      if (!id.current || !key) return true;
      void localRequest("terminal.key", { id: id.current, key }).catch(() => {});
      return false;
    });
    const paste = (event: ClipboardEvent) => {
      if (!id.current || !event.clipboardData) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void localRequest("terminal.paste", {
        id: id.current,
        text: event.clipboardData.getData("text/plain"),
      }).catch(() => {});
    };
    const wheel = (event: WheelEvent) => {
      if (!id.current || event.deltaY === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void localRequest("terminal.scroll", {
        id: id.current,
        direction: event.deltaY < 0 ? "up" : "down",
        lines: Math.min(
          300,
          Math.max(1, Math.ceil(Math.abs(event.deltaY) / (event.deltaMode === 0 ? 20 : 1))),
        ),
      }).catch(() => {});
    };
    container.current.addEventListener("paste", paste, true);
    container.current.addEventListener("wheel", wheel, { capture: true, passive: false });
    const surface = container.current;
    let lastMouseMove = 0;
    const mouse = (event: MouseEvent) => {
      if (!id.current || event.shiftKey) return;
      if (event.type === "mousemove") {
        if (Date.now() - lastMouseMove < 32) return;
        lastMouseMove = Date.now();
      }
      const screen = surface.querySelector(".xterm-screen")?.getBoundingClientRect();
      if (!screen?.width || !screen.height) return;
      void localRequest("terminal.mouse", {
        id: id.current,
        action:
          event.type === "mousedown"
            ? "down"
            : event.type === "mouseup"
              ? "up"
              : event.buttons
                ? "drag"
                : "move",
        button:
          event.button === 1 || (event.buttons & 4) !== 0
            ? "middle"
            : event.button === 2 || (event.buttons & 2) !== 0
              ? "right"
              : "left",
        column: Math.max(
          0,
          Math.min(
            view.cols - 1,
            Math.floor(((event.clientX - screen.left) * view.cols) / screen.width),
          ),
        ),
        row: Math.max(
          0,
          Math.min(
            view.rows - 1,
            Math.floor(((event.clientY - screen.top) * view.rows) / screen.height),
          ),
        ),
        modifiers: (event.altKey ? 4 : 0) | (event.ctrlKey ? 2 : 0),
      }).catch(() => {});
    };
    surface.addEventListener("mousedown", mouse);
    surface.addEventListener("mouseup", mouse);
    surface.addEventListener("mousemove", mouse);
    const input = view.onData((data) => {
      if (id.current)
        void localRequest("terminal.input", { id: id.current, data: encode(data) }).catch(() => {});
    });
    const resize = view.onResize(({ cols, rows }) => {
      if (id.current)
        void localRequest("terminal.resize", { id: id.current, cols, rows }).catch(() => {});
    });
    const observer = new ResizeObserver(() => {
      if (container.current?.clientWidth) addon.fit();
    });
    observer.observe(container.current);
    const unsubscribe = onLocalEvent((event) => {
      const data = event.data;
      if (
        event.event === "terminal.output" &&
        typeof data.id === "string" &&
        typeof data.data === "string"
      ) {
        const reset = data.full === true && data.preserveScrollback !== true;
        if (data.id === id.current) view.write(terminalFrame(data.data, reset));
        else if (!id.current) {
          earlyOutput.current.push({ id: data.id, data: data.data, full: reset });
          if (earlyOutput.current.length > 64) earlyOutput.current.shift();
        }
      }
      if (event.event === "terminal.exit" && !id.current && typeof data.id === "string")
        earlyExits.current.set(data.id, typeof data.exitCode === "number" ? data.exitCode : 0);
      if (event.event === "engine.status" && data.status === "error") {
        id.current = null;
        setRunning(false);
        view.options.disableStdin = true;
      }
      if (event.event === "terminal.exit" && data.id === id.current) {
        setRunning(false);
        setExitCode(typeof data.exitCode === "number" ? data.exitCode : 0);
        view.options.disableStdin = true;
        id.current = null;
      }
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      observer.disconnect();
      input.dispose();
      resize.dispose();
      surface.removeEventListener("paste", paste, true);
      surface.removeEventListener("wheel", wheel, true);
      surface.removeEventListener("mousedown", mouse);
      surface.removeEventListener("mouseup", mouse);
      surface.removeEventListener("mousemove", mouse);
      if (id.current) void localRequest("terminal.close", { id: id.current }).catch(() => {});
      id.current = null;
      view.dispose();
      terminal.current = null;
      fit.current = null;
    };
  }, []);
  useEffect(() => {
    if (!terminal.current) return;
    // xterm parses colors through canvas, so only opaque tokens are usable here.
    const tokens = themeTokens[resolvedTheme];
    terminal.current.options.theme = {
      background: tokens.background,
      foreground: tokens.foreground,
      cursor: tokens.foreground,
      selectionBackground: tokens.ring,
    };
  }, [resolvedTheme]);
  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening || running || !terminal.current) return;
    const data = new FormData(event.currentTarget);
    let args: string[];
    try {
      const value: unknown = JSON.parse(formText(data, "args") || "[]");
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
        throw new Error("arguments");
      args = value;
    } catch {
      setError(j("invalidArguments"));
      return;
    }
    setOpening(true);
    setError("");
    setExitCode(null);
    terminal.current.reset();
    earlyOutput.current = [];
    earlyExits.current.clear();
    try {
      fit.current?.fit();
      const result = await localRequest("terminal.open", {
        executable: formText(data, "executable").trim(),
        args,
        cwd: formText(data, "cwd").trim(),
        timeoutMs: 86400000,
        cols: terminal.current.cols,
        rows: terminal.current.rows,
      });
      if (!mounted.current || !terminal.current) {
        await localRequest("terminal.close", { id: result.id }).catch(() => {});
        return;
      }
      id.current = result.id;
      for (const output of earlyOutput.current)
        if (output.id === result.id)
          terminal.current.write(terminalFrame(output.data, output.full));
      earlyOutput.current = [];
      const ended = earlyExits.current.get(result.id);
      if (ended !== undefined) {
        setExitCode(ended);
        id.current = null;
        terminal.current.options.disableStdin = true;
        setRunning(false);
      } else {
        terminal.current.options.disableStdin = false;
        setRunning(true);
      }
      setStarted(true);
      terminal.current.focus();
    } catch {
      setError(c("error"));
    } finally {
      setOpening(false);
    }
  }
  async function close() {
    if (!id.current) return;
    setError("");
    try {
      await localRequest("terminal.close", { id: id.current });
      id.current = null;
      setRunning(false);
      if (terminal.current) terminal.current.options.disableStdin = true;
    } catch {
      setError(c("error"));
    }
  }
  return (
    <section>
      <header className="mb-10">
        <h1>{t("title")}</h1>
        <p className="mt-[9px] max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      </header>
      {!isDesktop() && (
        <p className="mb-5 flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-[13px] [overflow-wrap:anywhere]">
          {c("desktopOnly")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--destructive)_8%,var(--background))] px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
      <form onSubmit={open} className="flex flex-col gap-4.5">
        <div className="flex gap-5">
          <label
            htmlFor="terminal-executable"
            className="flex min-w-0 flex-1 flex-col gap-1.75 text-[13px]"
          >
            {t("executable")}
            <Input
              id="terminal-executable"
              name="executable"
              required
              disabled={running || opening}
              placeholder={
                navigator.platform.includes("Win") ? "C:\\Windows\\System32\\cmd.exe" : "/bin/zsh"
              }
            />
          </label>
          <label
            htmlFor="terminal-cwd"
            className="flex min-w-0 flex-1 flex-col gap-1.75 text-[13px]"
          >
            {t("cwd")}
            <Input id="terminal-cwd" name="cwd" required disabled={running || opening} />
          </label>
        </div>
        <div className="flex gap-5">
          <label
            htmlFor="terminal-args"
            className="flex min-w-0 flex-1 flex-col gap-1.75 text-[13px]"
          >
            {t("arguments")}
            <Input id="terminal-args" name="args" defaultValue="[]" disabled={running || opening} />
          </label>
          <div className="flex min-h-[34px] flex-wrap items-center gap-5 self-end">
            {running ? (
              <Button variant="outline" onClick={() => void close()}>
                <Square size={15} />
                {t("stop")}
              </Button>
            ) : (
              <Button type="submit" disabled={opening || !isDesktop()}>
                <TerminalIcon size={16} />
                {opening ? c("working") : t("start")}
              </Button>
            )}
          </div>
        </div>
        <p className="text-[12px] leading-[1.6] font-normal text-muted-foreground">
          {t("permissionHint")}
        </p>
      </form>
      <div
        className="mt-6 flex items-center gap-2 border-t border-border pt-6 pb-3 text-[12px] text-muted-foreground"
        role="status"
      >
        {running ? (
          <>
            <span className="size-1.5 rounded-full bg-foreground" />
            {t("running")}
          </>
        ) : exitCode !== null ? (
          `${t("finished")} (${exitCode})`
        ) : (
          t("empty")
        )}
      </div>
      <div
        className="h-[42dvh] min-h-95 overflow-hidden rounded-md border border-border p-4 [&_.xterm]:h-full [&_.xterm-viewport]:rounded-[4px]"
        ref={container}
        aria-label={c("terminal")}
      />
      {!started && (
        <p className="mt-3 text-[12px] leading-[1.6] font-normal text-muted-foreground">
          {t("emptyHint")}
        </p>
      )}
    </section>
  );
}
