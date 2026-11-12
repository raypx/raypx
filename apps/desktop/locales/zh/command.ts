import type { CatalogShape } from "@raypx/i18n/types";
import type en from "../en/command.js";

export default {
  executable: "可执行文件路径",
  arguments: "参数（JSON 数组）",
  cwd: "工作目录",
  invalidArguments: "请输入由字符串组成的 JSON 数组。",
} as const satisfies CatalogShape<typeof en>;
