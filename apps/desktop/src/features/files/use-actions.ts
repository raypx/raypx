import { useEffect, useRef } from "react";
import type { FileEntry } from "@raypx/contracts/local";
import { localRequest, pickDirectory } from "../../lib/desktop";
import { fileErrors, isDirty, useFilesStoreApi, type FileError } from "./store";

export function useFileActions({
  rootId,
  path,
  refresh,
  confirmDiscard,
  confirmDelete,
}: {
  rootId: string;
  path: string;
  refresh: () => Promise<unknown>;
  confirmDiscard: () => Promise<boolean>;
  confirmDelete: (entry: FileEntry) => Promise<boolean>;
}) {
  const store = useFilesStoreApi();
  const generation = useRef(0);
  // Directory changes invalidate pending requests and reset drafts.
  useEffect(() => {
    const version = generation.current + 1;
    generation.current = version;
    store.getState().resetDirectory();
    return () => {
      generation.current = version + 1;
    };
  }, [rootId, path, store]);
  async function run(
    work: (current: () => boolean) => Promise<void>,
    failure: FileError = fileErrors.error,
  ) {
    if (store.getState().busy) return;
    const version = generation.current;
    const current = () => version === generation.current;
    store.setState({ busy: true, error: null, notice: null });
    try {
      await work(current);
    } catch (error) {
      if (current())
        store.setState({
          error:
            error instanceof Error && error.message.includes("CONFLICT")
              ? fileErrors.conflict
              : failure,
        });
    } finally {
      if (current()) store.setState({ busy: false });
    }
  }
  return {
    chooseFolder: (select: (rootId: string) => Promise<void>) =>
      run(async (current) => {
        const root = await pickDirectory();
        if (root && current()) await select(root.id);
      }),
    open: async (entry: FileEntry) => {
      const version = generation.current;
      if (!(await confirmDiscard()) || version !== generation.current) return;
      return run(async (current) => {
        const content = await localRequest("files.read", { rootId, path: entry.path });
        if (current())
          store.setState({ editor: { rootId, path: entry.path, content, text: content.text } });
      }, fileErrors.readOnly);
    },
    close: async () => {
      const version = generation.current;
      if ((await confirmDiscard()) && version === generation.current)
        store.setState({ editor: null });
    },
    save: () =>
      run(async (current) => {
        const editor = store.getState().editor;
        if (!editor || !isDirty(store.getState())) return;
        const content = await localRequest("files.write", {
          rootId: editor.rootId,
          path: editor.path,
          text: editor.text,
          version: editor.content.version,
        });
        if (!current()) return;
        store.setState({ editor: { ...editor, content, text: content.text }, notice: "saved" });
        await refresh();
      }),
    remove: async (entry: FileEntry) => {
      const version = generation.current;
      if (!(await confirmDelete(entry)) || version !== generation.current) return;
      return run(async (current) => {
        await localRequest("files.delete", {
          rootId,
          path: entry.path,
          version: entry.version,
          confirmed: true,
        });
        if (!current()) return;
        if (store.getState().editor?.path === entry.path) store.setState({ editor: null });
        await refresh();
      });
    },
    perform: (value: string) =>
      run(async (current) => {
        const operation = store.getState().operation;
        if (!operation || !value.trim()) return;
        const next = path ? `${path}/${value}` : value;
        switch (operation.type) {
          case "move":
            await localRequest("files.move", {
              rootId,
              path: operation.entry.path,
              to: value,
              version: operation.entry.version,
            });
            break;
          case "folder":
            await localRequest("files.mkdir", { rootId, path: next });
            break;
          case "file":
            await localRequest("files.write", { rootId, path: next, text: "", version: null });
            break;
          default: {
            const unhandled: never = operation;
            throw new Error("Unsupported file operation", { cause: unhandled });
          }
        }
        if (!current()) return;
        if (operation.type === "move") {
          const editor = store.getState().editor;
          if (editor?.path === operation.entry.path)
            store.setState({ editor: { ...editor, path: value } });
        }
        store.setState({ operation: null });
        await refresh();
      }),
  };
}
