import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { ConversationId } from "@raypx/core/agents";
import type { BrowserInput, BrowserView, MemberBrowserCommand } from "@raypx/core/browser";
import type { SpaceId } from "@raypx/core/spaces";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { useTranslations } from "./i18n.js";

type Selection = { spaceId: SpaceId; conversationId: ConversationId };
export interface BrowserPreviewPort {
  view(this: void, input: Selection & { token?: string }): Promise<BrowserView>;
  command(
    this: void,
    input: Selection & { command: MemberBrowserCommand },
  ): Promise<BrowserView | { accepted: true }>;
}
export function BrowserPanel({
  port,
  spaceId,
  conversationId,
}: Selection & { port: BrowserPreviewPort }) {
  const t = useTranslations("agents");
  const [url, setUrl] = useState("");
  const [view, setView] = useState<BrowserView>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ownsControl, setOwnsControl] = useState(false);
  const token = useRef<string | undefined>(undefined);
  const mounted = useRef(false);
  const commandVersion = useRef(0);
  const inputQueue = useRef(Promise.resolve());
  const inputCount = useRef(0);
  const selection = { spaceId, conversationId };
  useEffect(() => {
    let active = true;
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 750;
    async function refresh() {
      const requestedVersion = commandVersion.current;
      try {
        const response = await port.view({
          spaceId,
          conversationId,
          ...(token.current ? { token: token.current } : {}),
        });
        if (!active) return;
        delay = 750;
        if (requestedVersion === commandVersion.current) {
          setView(response);
          if (response.state !== "open" || !response.controlled) {
            token.current = undefined;
            setOwnsControl(false);
          }
          if (response.state === "unavailable") return;
        }
      } catch {
        if (!active) return;
        delay = Math.min(60_000, Math.max(5_000, delay * 2));
      }
      timer = setTimeout(() => void refresh(), delay);
    }
    void refresh();
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer);
      const held = token.current;
      token.current = undefined;
      if (held)
        void port
          .command({ spaceId, conversationId, command: { op: "release", token: held } })
          .catch(() => {});
    };
  }, [port, spaceId, conversationId]);
  async function change(command: MemberBrowserCommand) {
    if (busy) return;
    commandVersion.current++;
    setFailed(false);
    setBusy(true);
    try {
      const result = await port.command({ ...selection, command });
      if (!mounted.current) {
        if (command.op === "takeover")
          await port.command({ ...selection, command: { op: "release", token: command.token } });
        return;
      }
      if ("state" in result) setView(result);
      else if (command.op === "close") setView({ state: "closed" });
      token.current = command.op === "takeover" ? command.token : undefined;
      setOwnsControl(token.current !== undefined);
    } catch {
      setFailed(true);
    } finally {
      commandVersion.current++;
      setBusy(false);
    }
  }
  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void change({ op: "open", url: url.trim() });
  }
  function input(action: BrowserInput) {
    const current = token.current;
    if (!current || inputCount.current >= 48) return;
    inputCount.current++;
    inputQueue.current = inputQueue.current
      .then(async () => {
        if (token.current === current)
          await port.command({
            ...selection,
            command: { op: "input", token: current, input: action },
          });
      })
      .catch(() => setFailed(true))
      .finally(() => {
        inputCount.current--;
      });
  }
  function type(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing || event.key === "Tab" || event.key === "Escape") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length === 1) {
      event.preventDefault();
      input({ kind: "text", text: event.key });
    } else if (/^(Enter|Backspace|Delete|Arrow(?:Left|Right|Up|Down)|Home|End)$/.test(event.key)) {
      event.preventDefault();
      input({ kind: "key", key: event.key });
    }
  }
  function paste(event: ClipboardEvent<HTMLButtonElement>) {
    if (!token.current) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    input({ kind: "text", text: text.slice(0, 2_000) });
  }
  const opened = view?.state === "open" ? view : null;
  const frame = opened?.frame;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {view?.state === "unavailable" ? (
        <p role="status">{t("browser.unavailable")}</p>
      ) : (
        <form className="flex items-end gap-2" onSubmit={open}>
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor="browser-address">{t("browser.address")}</FieldLabel>
            <Input
              id="browser-address"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {t("browser.open")}
          </Button>
        </form>
      )}
      {failed && (
        <p role="status" className="text-xs text-danger-text">
          {t("browser.failed")}
        </p>
      )}
      {opened && (
        <>
          <p className="truncate text-xs text-muted-foreground">{opened.origin}</p>
          <div className="flex flex-wrap gap-2">
            {ownsControl ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (token.current) void change({ op: "release", token: token.current });
                }}
              >
                {t("browser.release")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || opened.controlled}
                onClick={() => void change({ op: "takeover", token: crypto.randomUUID() })}
              >
                {t("browser.takeover")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void change({ op: "close" })}
            >
              {t("browser.end")}
            </Button>
          </div>
          {frame && (
            <button
              type="button"
              className="block w-full rounded-md border bg-muted focus-visible:focus-control"
              aria-label={t("browser.viewport")}
              disabled={!ownsControl}
              onClick={(event) => {
                if (!event.detail) return;
                const box = event.currentTarget.getBoundingClientRect();
                const x = Math.min(
                  frame.width - 1,
                  Math.max(0, Math.floor(((event.clientX - box.left) * frame.width) / box.width)),
                );
                const y = Math.min(
                  frame.height - 1,
                  Math.max(0, Math.floor(((event.clientY - box.top) * frame.height) / box.height)),
                );
                input({ kind: "click", x, y });
              }}
              onKeyDown={type}
              onPaste={paste}
              onWheel={(event) =>
                input({
                  kind: "scroll",
                  delta: Math.max(-1_200, Math.min(1_200, Math.round(event.deltaY))),
                })
              }
            >
              <img
                className="block w-full"
                alt=""
                src={`data:image/jpeg;base64,${frame.jpeg}`}
                draggable={false}
              />
            </button>
          )}
        </>
      )}
    </div>
  );
}
