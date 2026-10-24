import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
const credentialsPath = process.env.RAYPX_NATIVE_SMOKE_CREDENTIALS;
const baseUrl = process.env.RAYPX_LIVE_WEB_URL;
test.skip(
  process.env.RAYPX_LIVE_AGENTS !== "1" || !directory || !credentialsPath || !baseUrl,
  "Explicit real-inference, HTTPS test account and a connected native acceptance instance are required",
);

test("Beta Web runs approved Claude and Codex tasks on a hidden packaged Desktop", async ({
  page,
}) => {
  if (!directory || !credentialsPath || !baseUrl || new URL(baseUrl).protocol !== "https:")
    throw new Error("Missing live acceptance configuration");
  const credentials = JSON.parse(await readFile(credentialsPath, "utf8")) as {
    email: string;
    password: string;
    userId: string;
  };
  expect(credentials.email).toMatch(/@raypx\.example\.test$/);
  const native = JSON.parse(await readFile(join(directory, "native-ready.json"), "utf8")) as {
    accountId: string;
    deviceId: string;
    projectId: string;
    project: string;
    connected: boolean;
  };
  expect(native.connected).toBe(true);
  expect(native.accountId).toBe(credentials.userId);
  await page.goto(baseUrl + "/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  const signIn = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/sign-in/email" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await signIn).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Raypx Live Acceptance", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto(baseUrl + "/tasks");
  const tasks: { provider: string; file: string; marker: string }[] = [];
  for (const provider of ["claude", "codex"] as const) {
    const file = provider + "-beta-" + Date.now() + ".txt";
    const marker = `RAYPX_BETA_${provider.toUpperCase()}_7319`;
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const form = page
      .getByRole("textbox", { name: "What should the agent do?", exact: true })
      .locator("xpath=ancestor::form[1]");
    await form
      .getByRole("combobox", { name: "Computer", exact: true })
      .selectOption(native.deviceId);
    await form
      .getByRole("combobox", { name: "Project", exact: true })
      .selectOption(native.projectId);
    await form.getByRole("combobox", { name: "Agent", exact: true }).selectOption(provider);
    await form.getByRole("combobox", { name: "Execution", exact: true }).selectOption("plan");
    await form
      .getByRole("textbox", { name: "What should the agent do?", exact: true })
      .fill(
        `Use a file tool to create ${file} containing exactly ${marker} followed by one newline. Read it back to verify, and include ${marker} in your final reply. Do not modify any other files. First propose a concise plan for approval.`,
      );
    await form.getByRole("button", { name: "Send task", exact: true }).click();
    const approve = page.getByRole("button", { name: "Approve plan", exact: true });
    await expect(approve).toBeVisible({ timeout: 180_000 });
    if (provider === "claude") {
      await writeFile(join(directory, "renew-now.json"), JSON.stringify({ provider }));
      await expect
        .poll(
          async () => {
            try {
              return (
                JSON.parse(await readFile(join(directory, "native-renewed.json"), "utf8"))
                  .renewed === true
              );
            } catch {
              return false;
            }
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect(approve).toBeVisible();
    }
    await expect
      .poll(async () => {
        try {
          await readFile(join(native.project, file));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
    await approve.click();
    const deadline = Date.now() + 180_000;
    const completed = page.getByRole("heading", { name: "Completed", exact: true });
    const handled = new Set<string>();
    while (!(await completed.isVisible()) && Date.now() < deadline) {
      const allow = page.getByRole("button", { name: "Allow once", exact: true });
      if ((await allow.isVisible()) && (await allow.isEnabled())) {
        const permission = allow.locator("xpath=ancestor::section[1]");
        const body = await permission.textContent();
        expect(body).toContain(file);
        if (body && !handled.has(body)) {
          handled.add(body);
          await allow.click();
        }
      }
      await page.waitForTimeout(250);
    }
    await expect(completed).toBeVisible();
    const result = page.getByRole("region", { name: "Conversation", exact: true });
    await expect(result).toContainText(marker);
    expect((await readFile(join(native.project, file), "utf8")).trim()).toBe(marker);
    await page.screenshot({
      path: test.info().outputPath(`${provider}-completed.png`),
      fullPage: true,
    });
    tasks.push({ provider, file, marker });
    console.info(
      `Live Beta ${provider} passed: real Web plan approval, hidden native execution, file verification and result projection.`,
    );
  }
  await page.reload();
  for (const task of tasks)
    await expect(page.getByRole("button", { name: new RegExp(task.marker) }).first()).toBeVisible();
  await writeFile(join(directory, "web-complete.json"), JSON.stringify({ tasks }));
});
