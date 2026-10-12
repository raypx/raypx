import { chromium, expect } from "@playwright/test";
import { connectDatabase, migrateDatabase } from "@voidmix/db";
import { authAccounts, users, v2Projects, cloudTasks, cloudTaskRounds } from "@voidmix/db/schema";
import { hashPassword } from "better-auth/crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { databaseUrl, password } from "./database.js";

// Uses only the guarded test database and loopback application servers.
const port = Number(process.env.VOIDMIX_E2E_PORT ?? 3000);
const web = `http://127.0.0.1:${port}`;
const api = `http://127.0.0.1:${port + 2}`;
const output = resolve(import.meta.dirname, "../apps/web/public/product");
const dimensions: Record<string, Record<string, { width: number; height: number }>> = {};
const connectionUrl = databaseUrl();
await migrateDatabase(connectionUrl);
const connection = connectDatabase(connectionUrl);
const browser = await chromium.launch();
await mkdir(output, { recursive: true });
try {
  const hash = await hashPassword(password);
  for (const locale of ["en", "zh"] as const) {
    const id = `visual-example-${locale}`;
    const email = `${id}@example.test`;
    await connection.db
      .insert(users)
      .values({
        id,
        email,
        displayName: locale === "en" ? "Avery Lin" : "林知夏",
        emailVerified: true,
      })
      .onConflictDoNothing();
    await connection.db
      .insert(authAccounts)
      .values({ id, accountId: id, providerId: "credential", userId: id, password: hash })
      .onConflictDoNothing();
    const titles =
      locale === "en"
        ? [
            "Autumn collection",
            "Product launch",
            "Studio website",
            "Field notes",
            "Identity system",
          ]
        : ["秋日系列", "产品发布", "工作室网站", "调研笔记", "品牌视觉系统"];
    const descriptions =
      locale === "en"
        ? [
            "A considered direction for the season ahead.",
            "Bring the next release into focus.",
            "A shared home for the studio's work.",
            "Observations that guide the next decision.",
            "A consistent voice across every touchpoint.",
          ]
        : [
            "为下一个季节，整理清晰的创作方向。",
            "梳理下一次发布的重点与准备工作。",
            "为工作室的作品建立共同的展示空间。",
            "记录观察，为下一步决策提供依据。",
            "在每个触点，保持一致的视觉表达。",
          ];
    for (let index = 0; index < titles.length; index++) {
      await connection.db
        .insert(v2Projects)
        .values({
          id: `${id}-${index}`,
          title: titles[index]!,
          description: descriptions[index]!,
          createdByUserId: id,
          personalOwnerId: id,
          stage: (["in_progress", "review", "draft", "delivered", "draft"] as const)[index]!,
          createdAt: new Date("2026-09-01T00:00:00Z"),
          updatedAt: new Date(`2026-09-${28 - index}T08:00:00Z`),
          deadline: index === 0 ? new Date("2026-10-12T00:00:00Z") : null,
        })
        .onConflictDoNothing();
    }
    const tasks =
      locale === "en"
        ? [
            "Confirm the creative direction",
            "Prepare the first concept",
            "Review the visual references",
            "Document the final decisions",
          ]
        : ["确认创作方向", "准备第一版方案", "评审视觉参考", "整理最终决策"];
    for (let index = 0; index < tasks.length; index++) {
      await connection.db
        .insert(cloudTasks)
        .values({
          id: `${id}-task-${index}`,
          projectId: `${id}-0`,
          scopeType: "project",
          actorId: id,
          status: (["completed", "in_progress", "open", "open"] as const)[index]!,
          currentRoundId: `${id}-round-${index}`,
          goalVersion: 1,
          data: {
            id: `${id}-task-${index}`,
            scope: { type: "project", projectId: `${id}-0` },
            title: tasks[index]!,
            goal: tasks[index]!,
            currentRoundId: `${id}-round-${index}`,
            goalVersion: 1,
            requestedByUserId: id,
            status: (["completed", "in_progress", "open", "open"] as const)[index]!,
            conversationId: null,
            currentRevisionId: null,
            acceptedRevisionId: null,
            idempotencyKey: `${id}-task-${index}`,
            createdAt: "2026-09-01T00:00:00Z",
            updatedAt: `2026-09-${28 - index}T08:00:00Z`,
          },
          createdAt: new Date("2026-09-01T00:00:00Z"),
          updatedAt: new Date(`2026-09-${28 - index}T08:00:00Z`),
        })
        .onConflictDoNothing();
      await connection.db
        .insert(cloudTaskRounds)
        .values({
          id: `${id}-round-${index}`,
          scopeType: "project",
          projectId: `${id}-0`,
          actorId: id,
          parentId: `${id}-task-${index}`,
          taskId: `${id}-task-${index}`,
          goalVersion: 1,
          data: {
            id: `${id}-round-${index}`,
            scope: { type: "project", projectId: `${id}-0` },
            taskId: `${id}-task-${index}`,
            goalVersion: 1,
            goal: tasks[index]!,
            attachmentIds: [],
            callBudget: 40,
            durationBudgetMs: 20 * 60 * 1000,
            createdByUserId: id,
            idempotencyKey: `${id}-round-${index}`,
            createdAt: "2026-09-01T00:00:00Z",
            updatedAt: "2026-09-01T00:00:00Z",
          },
          createdAt: new Date("2026-09-01T00:00:00Z"),
          updatedAt: new Date("2026-09-01T00:00:00Z"),
        })
        .onConflictDoNothing();
    }
    for (const theme of ["light", "dark"] as const) {
      for (const size of ["desktop", "mobile"] as const) {
        const context = await browser.newContext({
          viewport: size === "desktop" ? { width: 1200, height: 800 } : { width: 390, height: 680 },
          deviceScaleFactor: 2,
          locale,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await context.addCookies([
          { name: "locale", value: locale, url: web },
          { name: "theme", value: theme, url: web },
        ]);
        const response = await context.request.post(`${api}/api/auth/sign-in/email`, {
          data: { email, password },
          headers: { origin: api },
        });
        if (!response.ok()) throw new Error(`Test sign-in failed: ${response.status()}`);
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        for (const [name, route, heading, focus] of [
          ["projects", "/projects", locale === "en" ? "Projects" : "项目", "project-focus"],
          ["detail", `/projects/${id}-0`, titles[0]!, "task-focus"],
        ] as const) {
          await page.goto(`${web}${route}`);
          await page.getByRole("heading", { name: heading, exact: true }).waitFor();
          await page.locator(`html[data-theme="${theme}"]`).waitFor();
          await page
            .locator("html")
            .evaluate((node) => node.ownerDocument.fonts.ready.then(() => undefined));
          await expect(page.locator("vite-error-overlay")).toHaveCount(0);
          await expect(page.locator(".workbench-account")).toContainText(
            locale === "en" ? "Avery Lin" : "林知夏",
          );
          await expect(page.locator(".project-list, .project-task-list")).toHaveCSS(
            "border-top-style",
            "solid",
          );
          expect(pageErrors).toEqual([]);
          for (const view of [name, focus]) {
            const key = `${view}-${locale}-${theme}`;
            const target =
              view === "project-focus"
                ? page.locator(".project-list")
                : view === "task-focus"
                  ? page.locator(".project-task-list")
                  : null;
            const png = target
              ? await target.screenshot({ animations: "disabled" })
              : await page.screenshot({ animations: "disabled" });
            const encoded = await page.locator("html").evaluate(async (node, data) => {
              const document = node.ownerDocument;
              const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
              const bitmap = await document.defaultView!.createImageBitmap(
                new Blob([bytes], { type: "image/png" }),
              );
              const canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
              bitmap.close();
              return {
                width: canvas.width,
                height: canvas.height,
                data: canvas.toDataURL("image/webp", 0.94).split(",")[1]!,
              };
            }, png.toString("base64"));
            dimensions[key] ??= {};
            dimensions[key][size] = { width: encoded.width, height: encoded.height };
            await writeFile(
              resolve(output, `${key}${size === "mobile" ? "-mobile" : ""}.webp`),
              Buffer.from(encoded.data, "base64"),
            );
          }
        }
        await context.close();
      }
    }
  }
  await writeFile(
    resolve(import.meta.dirname, "../apps/web/src/features/marketing/product-images.json"),
    JSON.stringify(dimensions, null, 2) + "\n",
  );
  for (const locale of ["en", "zh"]) {
    for (const view of ["projects", "detail"])
      await unlink(resolve(output, `${view}-${locale}.png`)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        },
      );
  }
} finally {
  await browser.close();
  await connection.close();
}
