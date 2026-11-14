import { useEffect, useState } from "react";
import { IconButton } from "@raypx/ui/icon-button";
import { CopyIcon } from "@raypx/icons/copy";
import { CheckIcon } from "@raypx/icons/check";
import { RefreshIcon } from "@raypx/icons/refresh";
import { EditIcon } from "@raypx/icons/edit";
import { MoreHorizontalIcon } from "@raypx/icons/more-horizontal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";
import { useTranslations } from "./i18n.js";

export function ReplyActions({
  text,
  getArticle,
  retryDisabled,
  onRetry,
  onSteer,
  onActivity,
}: {
  text: string;
  getArticle: () => HTMLElement | null;
  retryDisabled?: boolean;
  onRetry?: (() => void) | undefined;
  onSteer?: (() => void) | undefined;
  onActivity: () => void;
}) {
  const t = useTranslations("agents");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setCopied(false));
  }, [text]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
      const reply = getArticle()?.querySelector("[data-reply-bubble]");
      if (!reply) return;
      const range = document.createRange();
      range.selectNodeContents(reply);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }
  return (
    <div
      data-reply-actions
      className="flex min-w-0 flex-wrap items-center gap-0.5 text-muted-foreground"
    >
      <IconButton
        size="icon-sm"
        label={copied ? t("replyCopied") : t("copyReply")}
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </IconButton>
      {onRetry && (
        <IconButton size="icon-sm" label={t("retry")} disabled={retryDisabled} onClick={onRetry}>
          <RefreshIcon aria-hidden="true" />
        </IconButton>
      )}
      {onSteer && (
        <IconButton size="icon-sm" label={t("stillWorking.steer")} onClick={onSteer}>
          <EditIcon aria-hidden="true" />
        </IconButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<IconButton size="icon-sm" label={t("replyActions")} />}>
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onActivity}>{t("activity.title")}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed && (
        <p role="status" className="basis-full text-xs">
          {t("copyReplyError")}
        </p>
      )}
    </div>
  );
}
