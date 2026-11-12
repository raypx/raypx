import type { CatalogShape } from "@raypx/i18n/types";
import type en from "../en/settings.js";

export default {
  recoverSignIn: "恢复登录存储",
  accountScope: "账号范围",
  search: "搜索设置",
  searchResults: "匹配的设置",
  noSearchResults: "未找到匹配的设置",
  searchResultCount: "找到 {count} 个分类",
  searchKeywords: {
    account:
      "account profile display name email sign out 账户 帐户 账号 个人资料 显示名称 姓名 邮箱 退出登录",
    preferences:
      "preferences appearance theme light dark system language english chinese 偏好 外观 主题 浅色 深色 跟随系统 语言 英文 中文",
    diagnostics:
      "diagnostics analytics usage statistics errors reporting privacy 诊断 分析 使用统计 错误上报 隐私",
    password:
      "password security current new confirm change 密码 安全 当前密码 新密码 确认密码 修改密码",
    sessions: "sessions signed in browser login logout revoke 会话 登录 浏览器 撤销 注销 下线",
    instances:
      "registered instances enrollment computer device code review authorize 注册实例 电脑 设备 注册码 实例码 注册 授权 审核",
  },
  preferencesSaveFailed: "外观和语言更改未能保存，请重试。",
  appearance: "外观",
  appearanceLabel: "外观: {theme}",
  appearanceHint: "{current} → {next}",
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
  language: "语言",
  device: "设备偏好",
  localHint: "设置保存在本机，退出登录后仍保留。",
} as const satisfies CatalogShape<typeof en>;
