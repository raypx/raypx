import type { CatalogShape } from "@raypx/i18n/types";
import type en from "../en/users.js";

export default {
  searchBy: "搜索字段",
  search: "搜索用户",
  email: "邮箱",
  verification: "邮箱验证",
  role: "角色",
  created: "注册时间",
  newestFirst: "最新注册优先",
  oldestFirst: "最早注册优先",
  verified: "已验证",
  unverified: "未验证",
  member: "成员",
  admin: "管理员",
  unknown: "不支持的角色",
  editRole: "修改角色",
  selfRole: "本人角色",
  selfRoleHint: "不能修改自己的角色，请联系其他管理员。",
  confirm: "修改 {email} 的角色。管理员可管理站点设置和用户。",
  forbidden: "你没有管理用户的权限。",
  failed: "角色修改失败，请检查网络后重试。",
  refreshFailed: "角色已保存，请重试刷新列表。",
  empty: "没有匹配的用户。",
  pagination: "用户分页",
  page: "第 {page} 页 · 共 {total} 位用户",
} as const satisfies CatalogShape<typeof en>;
