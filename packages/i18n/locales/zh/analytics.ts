import type { CatalogShape } from "@raypx-kit/intl/types";
import type en from "../en/analytics.js";

export default {
  enabled: "已开启",
  disabled: "已关闭",
  unconfigured: "未配置",
  retrySave: "重试保存",
  title: "诊断与使用情况",
  hint: "默认关闭，绝不包含会话内容、文件、终端输出或凭据，不录制会话。",
  usage: "使用统计",
  usageHint: "功能使用情况和结果，按内部账号 ID 关联 Web 与 Desktop。",
  errors: "错误上报",
  errorsHint: "错误码、应用版本和代码位置，不含错误原文和本机路径；关闭统计时匿名上报。",
  unavailable: "当前版本未配置诊断服务，不采集数据。",
  saveError: "无法保存此选项。新开启的采集仍保持关闭，请重试。",
  viewError: "无法打开此页面，请重新加载应用后重试。",
} as const satisfies CatalogShape<typeof en>;
