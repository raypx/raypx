import type {
  Computer,
  ComputerDirectory,
  ComputerFile,
  DeviceComputerSelection,
} from "@raypx/core/computers";
import type { SpaceId } from "@raypx/core/spaces";

/** Read-only member procedures; these never provision or start a computer. */
export interface ComputerFilesPort {
  listDirectory(
    this: void,
    input: { spaceId: SpaceId; device?: DeviceComputerSelection; path: string; limit?: number },
  ): Promise<ComputerDirectory>;
  readFile(
    this: void,
    input: { spaceId: SpaceId; device?: DeviceComputerSelection; path: string; maxBytes?: number },
  ): Promise<ComputerFile>;
}

export type DirectoryView = ComputerDirectory | { status: "loading" | "error" };
export type FilePreviewView = ComputerFile | { status: "loading" | "error" };
export interface ComputerFilesView {
  directories: Readonly<Record<string, DirectoryView>>;
  expanded: readonly string[];
  selectedPath: string | null;
  preview: FilePreviewView | null;
  sizes: Readonly<Record<string, number>>;
  refreshing: boolean;
}
export interface ComputerFileTreeRow {
  path: string;
  kind: "file" | "directory" | "symlink";
  depth: number;
  position: number;
  siblings: number;
}

function initialView(): ComputerFilesView {
  return {
    directories: {},
    expanded: ["."],
    selectedPath: null,
    preview: null,
    sizes: {},
    refreshing: false,
  };
}

export function computerFileRows(view: ComputerFilesView): ComputerFileTreeRow[] {
  const rows: ComputerFileTreeRow[] = [
    { path: ".", kind: "directory", depth: 1, position: 1, siblings: 1 },
  ];
  const visited = new Set<string>(["."]);
  function children(path: string, depth: number) {
    if (!view.expanded.includes(path)) return;
    const directory = view.directories[path];
    if (directory?.status !== "available") return;
    directory.entries.forEach((entry, index) => {
      if (visited.has(entry.path)) return;
      visited.add(entry.path);
      rows.push({ ...entry, depth, position: index + 1, siblings: directory.entries.length });
      if (entry.kind === "directory") children(entry.path, depth + 1);
    });
  }
  children(".", 2);
  return rows;
}

/** Pure movement over visible rows; expand/collapse remains an explicit intent. */
export function computerFileDestination(
  view: ComputerFilesView,
  path: string,
  key: string,
): string {
  const rows = computerFileRows(view);
  const index = rows.findIndex((row) => row.path === path);
  if (index < 0) return ".";
  if (key === "Home") return ".";
  if (key === "End") return rows.at(-1)?.path ?? ".";
  if (key === "ArrowDown") return rows[Math.min(index + 1, rows.length - 1)]?.path ?? path;
  if (key === "ArrowUp") return rows[Math.max(index - 1, 0)]?.path ?? path;
  if (key === "ArrowRight" && rows[index]?.kind === "directory" && view.expanded.includes(path)) {
    return rows[index + 1]?.depth === (rows[index]?.depth ?? 0) + 1
      ? (rows[index + 1]?.path ?? path)
      : path;
  }
  if (key === "ArrowLeft") {
    const depth = rows[index]?.depth ?? 1;
    for (let parent = index - 1; parent >= 0; parent--) {
      if ((rows[parent]?.depth ?? depth) < depth) return rows[parent]?.path ?? path;
    }
  }
  return path;
}

export function computerPreviewText(bytes: string): string {
  const decoded = atob(bytes);
  return new TextDecoder().decode(Uint8Array.from(decoded, (character) => character.charCodeAt(0)));
}

/** Bounded lazy projection, discarded with the selected Space/account. */
export class ComputerFilesController {
  private view = initialView();
  private device: DeviceComputerSelection | undefined;
  get deviceSelected() {
    return this.device !== undefined;
  }
  selectComputer(device: DeviceComputerSelection | null) {
    if (JSON.stringify(device ?? null) === JSON.stringify(this.device ?? null)) return;
    this.device = device ?? undefined;
    this.clear();
  }
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;
  private previewRead = 0;
  private refreshAgain = false;
  private readonly reads = new Map<string, number>();
  constructor(
    private readonly spaceId: SpaceId,
    private readonly port: ComputerFilesPort,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<ComputerFilesView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  clear() {
    ++this.epoch;
    ++this.previewRead;
    this.refreshAgain = false;
    this.reads.clear();
    this.update(initialView());
  }
  setUnavailable(status: "not-configured" | Computer["state"]) {
    this.clear();
    const result: ComputerDirectory =
      status === "not-configured"
        ? { status: "not-configured" }
        : { status: "not-running", state: status };
    this.update({ directories: { ".": result } });
  }
  async loadDirectory(path: string): Promise<void> {
    if (this.disposed) return;
    const epoch = this.epoch;
    const read = (this.reads.get(path) ?? 0) + 1;
    this.reads.set(path, read);
    // Keep visible rows mounted during a refresh so a keyboard user's focus survives.
    if (this.view.directories[path]?.status !== "available") {
      this.update({ directories: { ...this.view.directories, [path]: { status: "loading" } } });
    }
    let result: DirectoryView;
    try {
      result = await this.port.listDirectory({
        spaceId: this.spaceId,
        ...(this.device ? { device: this.device } : {}),
        path,
        limit: 100,
      });
    } catch {
      result = { status: "error" };
    }
    if (this.disposed || epoch !== this.epoch || this.reads.get(path) !== read) return;
    this.update({ directories: { ...this.view.directories, [path]: result } });
  }
  async expand(path: string): Promise<void> {
    if (!this.view.expanded.includes(path))
      this.update({ expanded: [...this.view.expanded, path] });
    const directory = this.view.directories[path];
    if (!directory || directory.status === "error") await this.loadDirectory(path);
  }
  collapse(path: string) {
    this.update({ expanded: this.view.expanded.filter((entry) => entry !== path) });
  }
  async select(path: string): Promise<void> {
    if (this.disposed) return;
    const epoch = this.epoch;
    const read = ++this.previewRead;
    this.update({ selectedPath: path, preview: { status: "loading" } });
    let preview: FilePreviewView;
    try {
      preview = await this.port.readFile({
        spaceId: this.spaceId,
        ...(this.device ? { device: this.device } : {}),
        path,
        maxBytes: 65_536,
      });
    } catch {
      preview = { status: "error" };
    }
    if (
      this.disposed ||
      epoch !== this.epoch ||
      read !== this.previewRead ||
      this.view.selectedPath !== path
    )
      return;
    const sizes = { ...this.view.sizes };
    if (preview.status === "available") sizes[path] = preview.size;
    this.update({ preview, sizes });
  }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.view.refreshing) {
      this.refreshAgain = true;
      return;
    }
    this.update({ refreshing: true });
    const epoch = this.epoch;
    const paths = new Set([".", ...this.view.expanded]);
    const work = [...paths].map((path) => this.loadDirectory(path));
    if (this.view.selectedPath) work.push(this.select(this.view.selectedPath));
    await Promise.all(work);
    if (epoch === this.epoch) {
      this.update({ refreshing: false });
      if (this.refreshAgain) {
        this.refreshAgain = false;
        await this.refresh();
      }
    }
  }
  dispose() {
    this.clear();
    this.disposed = true;
    this.listeners.clear();
  }
}
