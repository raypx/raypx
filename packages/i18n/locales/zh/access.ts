import type { CatalogShape } from "@raypx-kit/intl/types";
import type en from "../en/access.js";

export default {
  forbidden: "你没有访问此页面的权限。",
  unavailable: "暂时无法验证权限，请重试。",
} as const satisfies CatalogShape<typeof en>;
