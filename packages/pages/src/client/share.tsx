import { useLocale } from "@raypx/i18n/browser";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PageVersion, PageShareLink } from "@raypx/core/pages";
import { Button } from "@raypx/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { SelectField } from "@raypx/ui/select-field";
import { OneTimePageLink, type PagesClientPort } from "../model.js";
import { useTranslations } from "./i18n.js";

export function PageSharing({
  page,
  port,
  apiOrigin,
  onClose,
  finalFocus,
}: {
  page: PageVersion;
  port: PagesClientPort;
  apiOrigin: string;
  onClose(this: void): void;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("pages");
  const locale = useLocale();
  const [links, setLinks] = useState<PageShareLink[]>([]);
  const [scope, setScope] = useState("latest");
  const [shown, setShown] = useState<{ url: string; version: number | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const oneTime = useRef(new OneTimePageLink());
  const active = useRef(true);
  const selection = { spaceId: page.spaceId, id: page.id };
  useEffect(() => {
    active.current = true;
    void port
      .shareLinks({ spaceId: page.spaceId, id: page.id })
      .then((value) => {
        if (active.current) setLinks(value);
      })
      .catch(() => {
        if (active.current) setFailed(true);
      });
    const memory = oneTime.current;
    return () => {
      active.current = false;
      memory.clear();
    };
  }, [port, page.spaceId, page.id]);
  function close() {
    active.current = false;
    oneTime.current.clear();
    setShown(null);
    onClose();
  }
  async function change(action: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await action();
      const value = await port.shareLinks(selection);
      if (active.current) setLinks(value);
    } catch {
      if (active.current) setFailed(true);
    } finally {
      if (active.current) setPending(false);
    }
  }
  async function create() {
    const generation = oneTime.current.begin();
    setShown(null);
    setCopied(false);
    setCopyFailed(false);
    await change(async () => {
      const link = await port.createShareLink({
        ...selection,
        version: scope === "latest" ? null : page.version,
      });
      const display = oneTime.current.reveal(generation, apiOrigin, link);
      if (active.current) setShown(display);
    });
  }
  async function copy() {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown.url);
      if (active.current) {
        setCopied(true);
        setCopyFailed(false);
      }
    } catch {
      if (active.current) setCopyFailed(true);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent closeLabel={t("close")} finalFocus={finalFocus} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("share")}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="page-link-scope">{t("linkScope")}</FieldLabel>
          <SelectField
            id="page-link-scope"
            value={scope}
            onValueChange={setScope}
            disabled={pending}
            options={[
              { value: "latest", label: t("currentVersion") },
              { value: "pinned", label: t("pinnedVersion", { version: page.version }) },
            ]}
          />
        </Field>
        <Button disabled={pending} onClick={() => void create()}>
          {t("createLink")}
        </Button>
        {shown && (
          <div className="flex min-w-0 flex-col gap-2" role="status">
            <p>{t("oneTimeLink")}</p>
            <p className="text-xs text-muted-foreground">
              {shown.version === null
                ? t("currentVersion")
                : t("pinnedVersion", { version: shown.version })}
            </p>
            <Input
              aria-label={t("share")}
              readOnly
              autoComplete="off"
              value={shown.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? t("copied") : t("copy")}
            </Button>
            {copyFailed && <p role="alert">{t("copyError")}</p>}
          </div>
        )}
        {failed && <p role="alert">{t("linkError")}</p>}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{t("links")}</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !links.some((link) => !link.revokedAt)}
            onClick={() =>
              void change(async () => {
                await port.revokeShareLinks(selection);
                oneTime.current.clear();
                setShown(null);
              })
            }
          >
            {t("revokeAll")}
          </Button>
        </div>
        {links.length === 0 && <p className="text-muted-foreground">{t("noLinks")}</p>}
        <ul className="flex min-w-0 flex-col divide-y">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p>
                  {link.version === null
                    ? t("currentVersion")
                    : t("pinnedVersion", { version: link.version })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("created")}:{" "}
                  <time dateTime={link.createdAt}>
                    {new Date(link.createdAt).toLocaleString(locale)}
                  </time>
                </p>
              </div>
              {link.revokedAt ? (
                <span className="text-xs text-muted-foreground">{t("revoked")}</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void change(async () => {
                      await port.revokeShareLink({ ...selection, linkId: link.id });
                      oneTime.current.clear();
                      setShown(null);
                    })
                  }
                >
                  {t("revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
