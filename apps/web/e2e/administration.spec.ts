import {
  test,
  signedInAccount,
  accountAccessFixture,
  authResponse,
  web,
  capture,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";
for (const width of [360, 1440])
  for (const locale of ["en", "zh"] as const)
    for (const theme of ["light", "dark"] as const) {
      test(
        `Web isolated administration and public privacy ${width}px ${locale} ${theme}`,
        { tag: "@web" },
        async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.addInitScript(
            (preferences) => {
              localStorage.setItem("raypx_locale", preferences.locale);
              localStorage.setItem("theme", preferences.theme);
            },
            { locale, theme },
          );
          const copy =
            locale === "zh"
              ? {
                  account: "账号菜单",
                  console: "管理控制台",
                  overview: "概览",
                  total: "用户总数",
                  notConfigured: "未配置",
                  unavailable: "不可用",
                  period: "统计周期",
                  seven: "近7天",
                  daily: "每日注册数据",
                  trend: "每日注册数",
                  audit: "操作审计",
                  unknown: "结果待确认",
                  actor: "操作人 ID",
                  apply: "应用筛选",
                  details: "查看详情",
                  settings: "站点设置",
                  siteName: "站点名称",
                  save: "保存修改",
                  discard: "放弃修改",
                  privacy: "隐私",
                  diagnostics: "可选诊断",
                  health: "服务状态",
                }
              : {
                  account: "Account menu",
                  console: "Admin console",
                  overview: "Overview",
                  total: "Total users",
                  notConfigured: "Not configured",
                  unavailable: "Unavailable",
                  period: "Period",
                  seven: "Last 7 days",
                  daily: "Daily registration data",
                  trend: "Registrations by day",
                  audit: "Audit log",
                  unknown: "Unconfirmed",
                  actor: "Actor ID",
                  apply: "Apply filters",
                  details: "View details",
                  settings: "Site settings",
                  siteName: "Site name",
                  save: "Save changes",
                  discard: "Discard changes",
                  privacy: "Privacy",
                  diagnostics: "Optional diagnostics",
                  health: "Service status",
                };
          await page.emulateMedia({ reducedMotion: "reduce" });
          const account = await signedInAccount(page);
          await accountAccessFixture(page, account.id, "admin");
          let privateReads = 0;
          page.on("request", (request) => {
            if (/\/rpc\/(devices|tasks|approvals|observed)\//.test(request.url())) privateReads++;
          });
          await page.route("**/rpc/admin/overview", (route) => {
            if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
            const days = route.request().postDataJSON()?.json?.days ?? 30;
            return authResponse(route, {
              json: {
                observedAt: new Date().toISOString(),
                timezone: "UTC",
                totalUsers: 12,
                verifiedUsers: 10,
                newUsers: 3,
                registrations: Array.from({ length: days }, (_, index) => ({
                  day: new Date(Date.now() - (days - index - 1) * 86400000)
                    .toISOString()
                    .slice(0, 10),
                  count: index % 4,
                })),
              },
            });
          });
          await page.route("**/rpc/admin/health", (route) =>
            route.request().method() === "OPTIONS"
              ? authResponse(route, null, 204)
              : authResponse(route, {
                  json: {
                    observedAt: new Date().toISOString(),
                    checks: { database: "ok", redis: "not-configured", relay: "unavailable" },
                  },
                }),
          );
          await page.route("**/rpc/configuration/get", (route) =>
            route.request().method() === "OPTIONS"
              ? authResponse(route, null, 204)
              : authResponse(route, {
                  json: {
                    values: {
                      siteName: "Raypx",
                      registrationEnabled: true,
                      cleanupEnabled: false,
                    },
                    revision: 1,
                    updatedAt: null,
                    deployment: { jobsEnabled: false, mailConfigured: false },
                  },
                }),
          );
          const entry = {
            id: "00000000-0000-4000-8000-000000000001",
            requestId: "server-request",
            actorId: account.id,
            source: "http",
            action: "user.role.update",
            targetId: "member",
            startedAt: new Date().toISOString(),
            completedAt: null,
            outcome: "unknown",
            errorCode: null,
            before: { role: "member" },
            after: null,
          };
          const filters: unknown[] = [];
          await page.route("**/rpc/admin/audit", (route) => {
            if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
            filters.push(route.request().postDataJSON());
            return authResponse(route, { json: { entries: [entry], next: null } });
          });
          await page.goto(web);
          await page.getByRole("button", { name: copy.account, exact: true }).click();
          await page.getByRole("menuitem", { name: copy.console, exact: true }).click();
          await expect(
            page.getByRole("heading", { name: copy.overview, exact: true }),
          ).toBeVisible();
          await expect(page.getByText(copy.total, { exact: true })).toBeVisible();
          await expect(page.getByText(copy.notConfigured, { exact: true })).toBeVisible();
          await expect(page.getByText(copy.unavailable, { exact: true })).toBeVisible();
          await expect(page.getByRole("link", { name: /^Waiting/ })).toHaveCount(0);
          await page.getByRole("combobox", { name: copy.period }).click();
          await page.getByRole("option", { name: copy.seven }).click();
          await page.getByRole("button", { name: copy.daily }).click();
          await expect(page.getByRole("table", { name: copy.trend }).getByRole("row")).toHaveCount(
            8,
          );
          await capture(page, {
            path: test.info().outputPath(`overview-${width}-${locale}-${theme}.png`),
            fullPage: true,
          });
          await page
            .getByRole("heading", { name: copy.health, exact: true })
            .scrollIntoViewIfNeeded();
          await capture(page, {
            path: test.info().outputPath(`health-${width}-${locale}-${theme}.png`),
            fullPage: true,
          });
          await page.getByRole("link", { name: copy.audit, exact: true }).click();
          await expect(page.getByRole("heading", { name: copy.audit, exact: true })).toBeVisible();
          await expect(page.getByText(copy.unknown, { exact: true })).toBeVisible();
          await page.getByLabel(copy.actor, { exact: true }).fill(account.id);
          await page.getByRole("button", { name: copy.apply }).click();
          await expect.poll(() => filters.length).toBeGreaterThan(1);
          await page.getByRole("button", { name: copy.details }).click();
          await expect(page.getByRole("dialog")).toContainText("server-request");
          await page.keyboard.press("Escape");
          expect(privateReads).toBe(0);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await capture(page, {
            path: test.info().outputPath(`audit-${width}-${locale}-${theme}.png`),
            fullPage: true,
          });
          await page.getByRole("link", { name: copy.settings, exact: true }).click();
          await expect(
            page.getByRole("heading", { name: copy.settings, exact: true }),
          ).toBeVisible();
          const siteName = page.getByRole("textbox", { name: copy.siteName, exact: true });
          await expect(siteName).toHaveValue("Raypx");
          await expect(page.getByRole("button", { name: copy.save, exact: true })).toBeDisabled();
          await siteName.fill("Unsaved draft");
          await expect(page.getByRole("button", { name: copy.save, exact: true })).toBeEnabled();
          await page.getByRole("button", { name: copy.discard, exact: true }).click();
          await expect(siteName).toHaveValue("Raypx");
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await capture(page, {
            path: test.info().outputPath(`site-settings-${width}-${locale}-${theme}.png`),
            fullPage: true,
          });
          await page.goto(web + "/privacy");
          await expect(
            page.getByRole("heading", { level: 1, name: copy.privacy, exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("complementary")).toHaveCount(0);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await capture(page, {
            path: test.info().outputPath(`privacy-${width}-${locale}-${theme}.png`),
            fullPage: true,
          });
          const diagnostics = page.getByRole("link", { name: copy.diagnostics, exact: true });
          await diagnostics.click();
          await expect(page).toHaveURL(web + "/privacy#diagnostics");
          await expect(diagnostics).toHaveAttribute("aria-current", "page");
          expect(privateReads).toBe(0);
        },
      );
    }
