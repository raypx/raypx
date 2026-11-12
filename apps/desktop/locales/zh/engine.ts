import type { CatalogShape } from "@raypx/i18n/types";
import type en from "../en/engine.js";

export default {
  replaceOwner: "停止旧宿主并更新",
  upgradeWarning: "旧版本宿主仍在运行。替换它会取消其中正在执行的会话。",
  upgradeTitle: "更新执行宿主",
  unavailable: "本地工具暂不可用",
  retry: "重启本地工具",
  hint: "重启本地工具以重新连接。你的工作区仍保存在这台电脑上。",
} as const satisfies CatalogShape<typeof en>;
