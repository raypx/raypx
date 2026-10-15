import { formText } from "../form-data";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Terminal as TerminalIcon, Stop } from "@phosphor-icons/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useTranslations } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/theme/client";
import { isDesktop, localRequest, onLocalEvent } from "../lib/desktop";

function encode(value: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
export function TerminalPage() {
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
  const earlyOutput = useRef<{ id: string; data: string }[]>([]);
  useEffect(() => {
    if (!container.current) return;
    mounted.current = true;
    const view = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      scrollback: 2000,
      convertEol: false,
      disableStdin: true,
    });
    const addon = new FitAddon();
    view.loadAddon(addon);
    view.open(container.current);
    terminal.current = view;
    fit.current = addon;
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
        if (data.id === id.current) view.write(decode(data.data));
        else if (!id.current) {
          earlyOutput.current.push({ id: data.id, data: data.data });
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
      if (id.current) void localRequest("terminal.close", { id: id.current }).catch(() => {});
      id.current = null;
      view.dispose();
      terminal.current = null;
      fit.current = null;
    };
  }, []);
  useEffect(() => {
    if (terminal.current)
      terminal.current.options.theme =
        resolvedTheme === "dark"
          ? {
              background: "#171717",
              foreground: "#fafafa",
              cursor: "#fafafa",
              selectionBackground: "#525252",
            }
          : {
              background: "#ffffff",
              foreground: "#171717",
              cursor: "#171717",
              selectionBackground: "#d4d4d4",
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
      const result = await localRequest<{ id: string }>("terminal.open", {
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
        if (output.id === result.id) terminal.current.write(decode(output.data));
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
    <section className="page local-page terminal-page">
      <header className="page-heading">
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </header>
      {!isDesktop() && <p className="notice">{c("desktopOnly")}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <form onSubmit={open} className="terminal-form">
        <div className="form-row">
          <label htmlFor="terminal-executable">
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
          <label htmlFor="terminal-cwd">
            {t("cwd")}
            <Input id="terminal-cwd" name="cwd" required disabled={running || opening} />
          </label>
        </div>
        <div className="form-row terminal-arguments">
          <label htmlFor="terminal-args">
            {t("arguments")}
            <Input id="terminal-args" name="args" defaultValue="[]" disabled={running || opening} />
          </label>
          <div className="inline-actions">
            {running ? (
              <Button variant="outline" onClick={() => void close()}>
                <Stop size={15} />
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
        <p className="field-hint">{t("permissionHint")}</p>
      </form>
      <div className="terminal-status" role="status">
        {running ? (
          <>
            <span className="brand-dot" />
            {t("running")}
          </>
        ) : exitCode !== null ? (
          `${t("finished")} (${exitCode})`
        ) : (
          t("empty")
        )}
      </div>
      <div className="terminal-container" ref={container} aria-label={c("terminal")} />
      {!started && <p className="field-hint terminal-hint">{t("emptyHint")}</p>}
    </section>
  );
}
