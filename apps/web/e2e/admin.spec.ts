import {
  test,
  signedInAccount,
  accountAccessFixture,
  authResponse,
  web,
  capture,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Web administrators can inspect metrics and audit entries and discard site changes",
  { tag: "@web" },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("raypx_locale", "zh"));
    const account = await signedInAccount(page);
    await accountAccessFixture(page, account.id, "admin");
    let privateReads = 0;
    page.on("request", (request) => {
      if (/\/rpc\/(devices|tasks|approvals|observed)\//.test(request.url())) privateReads++;
    });
    const overviewPeriods: number[] = [];
    await page.route("**/rpc/admin/overview", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const days = route.request().postDataJSON()?.json?.days ?? 30;
      overviewPeriods.push(days);
      return authResponse(route, {
        json: {
          observedAt: new Date().toISOString(),
          timezone: "UTC",
          totalUsers: 12,
          verifiedUsers: 10,
          newUsers: 3,
          registrations: Array.from({ length: days }, (_, index) => ({
            day: new Date(Date.now() - (days - index - 1) * 86400000).toISOString().slice(0, 10),
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
    const storage = {
      values: {
        endpoint: "https://s3.us-east-1.amazonaws.com",
        bucket: "raypx-private",
        region: "us-east-1",
        enabled: true,
      },
      revision: 2,
      updatedAt: null,
    };
    const storageWrites: unknown[] = [];
    await page.route("**/rpc/configuration/storage", (route) =>
      route.request().method() === "OPTIONS"
        ? authResponse(route, null, 204)
        : authResponse(route, { json: storage }),
    );
    await page.route("**/rpc/configuration/updateStorage", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const input = route.request().postDataJSON()?.json;
      storageWrites.push(input);
      return authResponse(route, { json: { ...storage, values: input.values, revision: 3 } });
    });
    const mail = {
      values: { from: "Raypx <notify@example.test>", defaultLocale: "zh", enabled: true },
      revision: 3,
      updatedAt: null,
    };
    const mailWrites: unknown[] = [];
    await page.route("**/rpc/configuration/resend", (route) =>
      route.request().method() === "OPTIONS"
        ? authResponse(route, null, 204)
        : authResponse(route, { json: mail }),
    );
    await page.route("**/rpc/configuration/updateResend", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const input = route.request().postDataJSON()?.json;
      mailWrites.push(input);
      return authResponse(route, { json: { ...mail, values: input.values, revision: 4 } });
    });
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
    const filteredActors: string[] = [];
    await page.route("**/rpc/admin/audit", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const actor = route.request().postDataJSON()?.json?.actorId;
      if (typeof actor === "string") filteredActors.push(actor);
      return authResponse(route, { json: { entries: [entry], next: null } });
    });

    await page.goto(web);
    await page.getByRole("button", { name: "账号菜单", exact: true }).press("Enter");
    await page.getByRole("menuitem", { name: "管理控制台", exact: true }).press("Enter");
    await expect(page).toHaveURL(web + "/admin");

    await test.step("load overview data and select a seven-day period", async () => {
      const main = page.getByRole("main");
      await expect(main.getByRole("definition").filter({ hasText: /^12$/ })).toBeVisible();
      await expect(main.getByText("未配置", { exact: true })).toBeVisible();
      await expect(main.getByText("不可用", { exact: true })).toBeVisible();
      await main.getByRole("combobox", { name: "统计周期" }).click();
      await page.getByRole("option", { name: "近7天" }).click();
      await expect.poll(() => overviewPeriods).toContain(7);
      await main.getByRole("button", { name: "每日注册数据" }).click();
      await expect(main.getByRole("table", { name: "每日注册数" }).getByRole("row")).toHaveCount(8);
      await capture(page, { path: test.info().outputPath("admin-overview.png"), fullPage: true });
    });

    await test.step("filter the audit log and inspect a change", async () => {
      await page.getByRole("link", { name: "操作审计", exact: true }).click();
      await expect(page).toHaveURL(web + "/admin/audit");
      await page.getByLabel("操作人 ID", { exact: true }).fill(account.id);
      await page.getByRole("button", { name: "应用筛选" }).click();
      await expect.poll(() => filteredActors).toContain(account.id);
      const auditRow = page.getByRole("row").filter({ hasText: account.id });
      await expect(auditRow.getByText("结果待确认", { exact: true })).toBeVisible();
      await auditRow.getByRole("button", { name: "查看详情" }).click();
      const details = page.getByRole("dialog");
      await expect(details).toContainText("server-request");
      await expect(details.getByRole("region", { name: "变更前", exact: true })).toContainText(
        '"role": "member"',
      );
      await capture(page, {
        path: test.info().outputPath("admin-audit-detail.png"),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(details).toBeHidden();
    });

    await test.step("discard an unsaved site setting", async () => {
      await page.getByRole("link", { name: "配置中心", exact: true }).click();
      await expect(page).toHaveURL(web + "/admin/settings");
      const siteName = page.getByRole("textbox", { name: "站点名称", exact: true });
      const save = page.getByRole("button", { name: "保存修改", exact: true });
      await expect(siteName).toHaveValue("Raypx");
      await siteName.fill("Unsaved draft");
      await expect(save).toBeEnabled();
      const siteTab = page.getByRole("tab", { name: "站点", exact: true });
      const storageTab = page.getByRole("tab", { name: "对象存储", exact: true });
      const indicator = page.locator("[data-config-indicator]");
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveCSS("transition-duration", "0s");
      await siteTab.focus();
      await page.keyboard.press("ArrowRight");
      await expect(storageTab).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(storageTab).toHaveAttribute("aria-selected", "true");
      await expect(siteName).toBeHidden();
      await page.keyboard.press("ArrowLeft");
      await expect(siteTab).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(siteName).toHaveValue("Unsaved draft");
      await page.getByRole("button", { name: "放弃修改", exact: true }).click();
      await expect(siteName).toHaveValue("Raypx");
      await expect(save).toBeDisabled();
    });
    await test.step("disable storage configuration with the existing credentials", async () => {
      await page.getByRole("tab", { name: "对象存储", exact: true }).click();
      const panel = page.getByRole("tabpanel", { name: "对象存储", exact: true });
      await expect(panel.getByLabel("访问密钥", { exact: true })).toHaveValue("");
      await panel.getByRole("switch", { name: "启用存储配置", exact: true }).click();
      await panel.getByRole("button", { name: "保存修改", exact: true }).click();
      await expect(panel.getByText("配置已停用", { exact: true })).toBeVisible();
      expect(storageWrites).toEqual([
        { revision: 2, values: { ...storage.values, enabled: false } },
      ]);
      await capture(page, { path: test.info().outputPath("admin-storage.png"), fullPage: true });
    });
    await test.step("rotate the Resend key and save email settings on a narrow screen", async () => {
      await page.getByRole("tab", { name: "邮件", exact: true }).click();
      const panel = page.getByRole("tabpanel", { name: "邮件", exact: true });
      const key = panel.getByLabel("Resend API Key", { exact: true });
      await expect(key).toHaveValue("");
      await key.fill("re_browser_fixture");
      await panel.getByRole("switch", { name: "发送账户邮件", exact: true }).click();
      await panel.getByRole("button", { name: "保存修改", exact: true }).click();
      await expect(panel.getByText("已暂停发送", { exact: true })).toBeVisible();
      await expect(key).toHaveValue("");
      expect(mailWrites).toEqual([
        { values: { ...mail.values, enabled: false }, revision: 3, apiKey: "re_browser_fixture" },
      ]);
      await capture(page, { path: test.info().outputPath("admin-email.png"), fullPage: true });
    });
    expect(privateReads).toBe(0);
  },
);

test(
  "Web guests can open the public privacy disclosure without private reads",
  { tag: "@web" },
  async ({ page }) => {
    const privateReads: string[] = [];
    page.on("request", (request) => {
      if (/\/rpc\/(account|admin|devices|tasks|approvals|observed)\//.test(request.url()))
        privateReads.push(request.url());
    });
    await page.goto(web);
    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(web + "/privacy");
    const diagnostics = page.getByRole("link", { name: "Optional diagnostics", exact: true });
    await diagnostics.click();
    await expect(page).toHaveURL(web + "/privacy#diagnostics");
    await expect(diagnostics).toHaveAttribute("aria-current", "page");
    expect(privateReads).toEqual([]);
    await capture(page, { path: test.info().outputPath("privacy.png"), fullPage: true });
  },
);
