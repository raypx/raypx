import type { CatalogShape } from "@raypx/i18n/types";
import type en from "../en/files.js";

export default {
  lineCount: "{count} 行",
  breadcrumbs: "文件夹路径",
  backToList: "返回文件列表",
  browser: "文件浏览",
  addRoot: "选择文件夹",
  roots: "文件夹",
  noRoots: "先选择一个文件夹",
  noRootsHint: "内置文件工具仅能访问你选择的文件夹。",
  empty: "此文件夹为空。",
  open: "打开",
  up: "上级文件夹",
  createFile: "新建文本文件",
  createFolder: "新建文件夹",
  rename: "移动或重命名",
  destination: "新的相对路径",
  readOnly: "此文件无法作为文本编辑。支持不超过 1 MiB 的 UTF-8 文件。",
  saved: "文件已保存。",
  conflict: "文件已在磁盘上发生变化，请重新加载后保存。",
  unsaved: "放弃未保存的更改？",
  size: "大小",
  modified: "修改时间",
  editor: "文本编辑器",
  deleteConfirm: "确认删除此文件或空文件夹？此操作无法撤销。",
} as const satisfies CatalogShape<typeof en>;
