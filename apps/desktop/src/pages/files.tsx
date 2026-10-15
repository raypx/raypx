import { useBlocker } from "@tanstack/react-router";
import { formText } from "../form-data";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileText,
  Folder,
  FolderOpen,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import type { FileContent, FileEntry, FileListing, RootGrant } from "@raypx/contracts/local";
import { isDesktop, localRequest, onLocalEvent, pickDirectory } from "../lib/desktop";

export function FilesPage() {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const locale = useLocale();
  const [roots, setRoots] = useState<RootGrant[]>([]);
  const [rootId, setRootId] = useState("");
  const [path, setPath] = useState("");
  const [offset, setOffset] = useState(0);
  const [listing, setListing] = useState<FileListing | null>(null);
  const [file, setFile] = useState<{ path: string; content: FileContent } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [operation, setOperation] = useState<{
    type: "file" | "folder" | "move";
    entry?: FileEntry;
  } | null>(null);
  const dirty = file !== null && text !== file.content.text;
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm(t("unsaved")),
    enableBeforeUnload: dirty,
  });
  useEffect(
    () =>
      onLocalEvent((event) => {
        if (event.event === "engine.status" && event.data.status === "ready")
          setRevision((value) => value + 1);
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    if (isDesktop())
      void localRequest<RootGrant[]>("roots.list", {})
        .then((value) => {
          if (active) {
            setRoots(value);
            setError("");
            setRootId((current) => current || value[0]?.id || "");
          }
        })
        .catch(() => {
          if (active) setError(c("error"));
        });
    return () => {
      active = false;
    };
  }, [c, revision]);
  useEffect(() => {
    let active = true;
    setListing(null);
    if (!rootId) return;
    setError("");
    void localRequest<FileListing>("files.list", { rootId, path, offset, limit: 100 })
      .then((value) => {
        if (active) setListing(value);
      })
      .catch(() => {
        if (active) setError(c("error"));
      });
    return () => {
      active = false;
    };
  }, [rootId, path, offset, revision, c]);
  function leaveEditor() {
    return !dirty || window.confirm(t("unsaved"));
  }
  function navigate(nextPath: string, approved = false) {
    if (!approved && !leaveEditor()) return;
    setPath(nextPath);
    setOffset(0);
    setFile(null);
    setOperation(null);
    setNotice("");
  }
  async function chooseFolder() {
    setBusy(true);
    setError("");
    try {
      const root = await pickDirectory();
      if (root && leaveEditor()) {
        setRoots((values) =>
          values.some((value) => value.id === root.id) ? values : [...values, root],
        );
        setRootId(root.id);
        navigate("", true);
      }
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  async function open(entry: FileEntry) {
    if (entry.kind === "directory") {
      navigate(entry.path);
      return;
    }
    if (!leaveEditor()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const content = await localRequest<FileContent>("files.read", { rootId, path: entry.path });
      setFile({ path: entry.path, content });
      setText(content.text);
    } catch {
      setError(t("readOnly"));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const content = await localRequest<FileContent>("files.write", {
        rootId,
        path: file.path,
        text,
        version: file.content.version,
      });
      setFile({ path: file.path, content });
      setText(content.text);
      setNotice(t("saved"));
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.includes("CONFLICT") ? t("conflict") : c("error"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(entry: FileEntry) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      await localRequest("files.delete", {
        rootId,
        path: entry.path,
        version: entry.version,
        confirmed: true,
      });
      if (file?.path === entry.path) setFile(null);
      setRevision((value) => value + 1);
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  async function perform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operation) return;
    const value = formText(new FormData(event.currentTarget), "path").trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const next = path ? `${path}/${value}` : value;
      if (operation.type === "move" && operation.entry)
        await localRequest("files.move", {
          rootId,
          path: operation.entry.path,
          to: value,
          version: operation.entry.version,
        });
      else if (operation.type === "folder")
        await localRequest("files.mkdir", { rootId, path: next });
      else await localRequest("files.write", { rootId, path: next, text: "", version: null });
      setOperation(null);
      setRevision((number) => number + 1);
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page local-page">
      <header className="page-heading heading-actions">
        <div>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <Button onClick={() => void chooseFolder()} disabled={busy || !isDesktop()}>
          <FolderOpen size={16} />
          {t("addRoot")}
        </Button>
      </header>
      {!isDesktop() && <p className="notice">{c("desktopOnly")}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!roots.length ? (
        <div className="local-empty">
          <FolderOpen size={44} weight="thin" />
          <h2>{t("noRoots")}</h2>
          <p>{t("noRootsHint")}</p>
        </div>
      ) : (
        <>
          <div className="file-toolbar">
            <label>
              <span className="sr-only">{t("roots")}</span>
              <select
                value={rootId}
                onChange={(event) => {
                  if (leaveEditor()) {
                    setRootId(event.target.value);
                    navigate("", true);
                  }
                }}
              >
                {roots.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="file-location" title={path || "/"}>
              {path || "/"}
            </span>
            <div className="inline-actions">
              <Button
                variant="ghost"
                size="icon"
                disabled={!path || busy}
                onClick={() => navigate(path.split("/").slice(0, -1).join("/"))}
                aria-label={t("up")}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setOperation({ type: "file" })}
              >
                <Plus size={16} />
                {t("createFile")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setOperation({ type: "folder" })}
              >
                <Folder size={16} />
                {t("createFolder")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                {c("refresh")}
              </Button>
            </div>
          </div>
          {operation && (
            <form className="inline-form" onSubmit={perform}>
              <label htmlFor="file-path">
                {operation.type === "move" ? t("destination") : t("path")}
              </label>
              <Input
                id="file-path"
                name="path"
                autoFocus
                required
                defaultValue={operation.entry?.path ?? ""}
                disabled={busy}
              />
              <Button type="submit" disabled={busy}>
                {c("save")}
              </Button>
              <Button variant="ghost" onClick={() => setOperation(null)}>
                {c("cancel")}
              </Button>
            </form>
          )}
          <div className="file-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{c("name")}</th>
                  <th>{t("size")}</th>
                  <th>{t("modified")}</th>
                  <th className="row-actions">
                    <span className="sr-only">{c("actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listing?.entries.map((entry) => (
                  <tr key={entry.path}>
                    <td>
                      <button
                        type="button"
                        className="file-name"
                        disabled={busy || !["file", "directory"].includes(entry.kind)}
                        onClick={() => void open(entry)}
                      >
                        {entry.kind === "directory" ? (
                          <Folder size={18} weight="duotone" />
                        ) : (
                          <FileText size={18} />
                        )}
                        {entry.name}
                      </button>
                    </td>
                    <td className="muted">
                      {entry.kind === "directory"
                        ? "—"
                        : new Intl.NumberFormat(locale, { notation: "compact" }).format(
                            entry.size,
                          ) + " B"}
                    </td>
                    <td className="muted">
                      {new Intl.DateTimeFormat(locale, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(entry.modifiedAt))}
                    </td>
                    <td className="row-actions">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("rename")}: ${entry.name}`}
                        disabled={busy}
                        onClick={() => setOperation({ type: "move", entry })}
                      >
                        <PencilSimple />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${c("delete")}: ${entry.name}`}
                        disabled={busy}
                        onClick={() => void remove(entry)}
                      >
                        <Trash />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listing === null ? (
              <p role="status" className="table-empty">
                {c("loading")}
              </p>
            ) : listing.entries.length === 0 ? (
              <p className="table-empty">{t("empty")}</p>
            ) : null}
          </div>
          {listing && listing.total > 100 && (
            <div className="pagination">
              <Button
                variant="outline"
                size="icon"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
                aria-label={c("previous")}
              >
                <ArrowLeft />
              </Button>
              <span>
                {offset + 1}–{Math.min(offset + 100, listing.total)} / {listing.total}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={offset + 100 >= listing.total}
                onClick={() => setOffset(offset + 100)}
                aria-label={c("next")}
              >
                <ArrowRight />
              </Button>
            </div>
          )}
          {file && (
            <section className="editor-panel">
              <div className="editor-header">
                <h2>{file.path}</h2>
                <div className="inline-actions">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (leaveEditor()) setFile(null);
                    }}
                  >
                    {c("close")}
                  </Button>
                  <Button disabled={busy || !dirty} onClick={() => void save()}>
                    {busy ? c("working") : c("save")}
                  </Button>
                </div>
              </div>
              <label htmlFor="file-editor" className="sr-only">
                {t("editor")}
              </label>
              <textarea
                id="file-editor"
                className="file-editor"
                value={text}
                onChange={(event) => setText(event.target.value)}
                spellCheck={false}
                disabled={busy}
              />
            </section>
          )}
        </>
      )}
    </section>
  );
}
