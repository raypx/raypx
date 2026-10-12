import { createFormatter } from "@voidmix/i18n";
import { describe, expect, it } from "vite-plus/test";

import {
  formatAdminJoinedAt,
  formatAdminLastActive,
  formatAdminRole,
  formatAdminStatus,
} from "./display";

describe("admin display formatting", () => {
  it("formats activity values with the active locale", () => {
    const formatter = createFormatter("zh");
    expect(
      formatAdminLastActive(
        { kind: "connected" },
        (key) => (key === "connected" ? "已连接" : key),
        formatter,
      ),
    ).toBe("已连接");
    expect(
      formatAdminLastActive({ kind: "relative", value: -2, unit: "minute" }, () => "", formatter),
    ).toBe("2分钟前");
  });

  it("formats API ISO dates with the active locale", () => {
    expect(
      formatAdminJoinedAt(new Date("2026-01-02T00:00:00.000Z"), createFormatter("zh"), ""),
    ).toBe("2026年1月2日");
  });

  it("maps role and status values for exported and rendered rows", () => {
    const translate = ((key: string) =>
      ({ admin: "管理员", active: "启用", member: "成员", owner: "所有者", suspended: "已停用" })[
        key
      ] ?? key) as Parameters<typeof formatAdminRole>[1];

    expect(formatAdminRole("owner", translate)).toBe("所有者");
    expect(formatAdminRole("user", translate)).toBe("成员");
    expect(formatAdminStatus("suspended", translate)).toBe("已停用");
  });
});
