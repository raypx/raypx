import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { FileContent, FileEntry } from "@raypx/contracts/local";

type FileOperation = { type: "file" | "folder" } | { type: "move"; entry: FileEntry };
interface FileEditorState {
  rootId: string;
  path: string;
  content: FileContent;
  text: string;
}
export const fileErrors = {
  error: "error",
  readOnly: "readOnly",
  conflict: "conflict",
} as const;
export type FileError = (typeof fileErrors)[keyof typeof fileErrors];
interface FilesState {
  editor: FileEditorState | null;
  operation: FileOperation | null;
  busy: boolean;
  error: FileError | null;
  notice: "saved" | null;
  setText: (text: string) => void;
  setOperation: (operation: FileOperation | null) => void;
  resetDirectory: () => void;
}
export const isDirty = (state: Pick<FilesState, "editor">) =>
  state.editor !== null && state.editor.text !== state.editor.content.text;
function createFilesStore() {
  return createStore<FilesState>()((set) => ({
    editor: null,
    operation: null,
    busy: false,
    error: null,
    notice: null,
    setText: (text) =>
      set((state) => ({ editor: state.editor ? { ...state.editor, text } : null })),
    setOperation: (operation) => set({ operation }),
    resetDirectory: () =>
      set({ editor: null, operation: null, busy: false, error: null, notice: null }),
  }));
}
type FilesStore = ReturnType<typeof createFilesStore>;
const FilesContext = createContext<FilesStore | null>(null);
export function FilesProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createFilesStore);
  return <FilesContext value={store}>{children}</FilesContext>;
}
export function useFilesStoreApi() {
  const store = useContext(FilesContext);
  if (!store) throw new Error("FilesProvider is required");
  return store;
}
export function useFilesStore<T>(selector: (state: FilesState) => T) {
  return useStore(useFilesStoreApi(), selector);
}
