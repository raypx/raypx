import { capture } from "../helpers/capture.js";
import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";

import type { ContextDocument, ContextDocumentInput, ContextVersion } from "@raypx/core/memory";
import { authResponse, signedInAccount, webShellFixture } from "../helpers/account-fixture.js";
import { selectOption } from "../helpers/select.js";

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests() {
  test(
    `creates, versions, restores and deletes a standalone reference`,
    { tag: "@smoke" },
    async ({ page, surface, base }) => {
      const memoryPath = surface === "Desktop" ? "/memory?scope=account" : "/memory";
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const time = new Date().toISOString();
      const original = "Run the project tests and explain the result.";
      let document: ContextDocument | undefined;
      const versions: ContextVersion[] = [];
      const remember = (reason: ContextVersion["reason"], restoredFrom?: number) =>
        versions.unshift({ ...document!, reason, ...(restoredFrom ? { restoredFrom } : {}) });
      await page.route("**/rpc/memory/list", (route) =>
        authResponse(route, { json: document ? [document] : [] }),
      );
      await page.route("**/rpc/memory/get", (route) => authResponse(route, { json: document }));
      await page.route("**/rpc/memory/create", (route) => {
        const input = route.request().postDataJSON().json as {
          requestId: string;
          document: ContextDocumentInput;
        };
        document = {
          ...input.document,
          id: input.requestId,
          revision: 1,
          archived: false,
          createdAt: time,
          updatedAt: time,
        };
        remember("created");
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/memory/update", (route) => {
        const input = route.request().postDataJSON().json as {
          revision: number;
          document: ContextDocumentInput;
        };
        expect(input.revision).toBe(document!.revision);
        document = { ...document!, ...input.document, revision: input.revision + 1 };
        remember("updated");
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/memory/history", (route) => {
        const input = route.request().postDataJSON().json as { before?: number; limit: number };
        return authResponse(route, {
          json: versions
            .filter((v) => !input.before || v.revision < input.before)
            .slice(0, input.limit),
        });
      });
      await page.route("**/rpc/memory/restore", (route) => {
        const input = route.request().postDataJSON().json as { revision: number; version: number };
        const selected = versions.find((v) => v.revision === input.version)!;
        const { reason: _reason, restoredFrom: _from, ...value } = selected;
        document = { ...value, revision: input.revision + 1 };
        remember("restored", input.version);
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/jobs/list", (route) =>
        authResponse(route, { json: { enabled: true, jobs: [] } }),
      );
      await page.route("**/rpc/memory/archive", (route) => {
        const input = route.request().postDataJSON().json as {
          revision: number;
          archived: boolean;
        };
        expect(input.revision).toBe(document!.revision);
        document = { ...document!, revision: input.revision + 1, archived: input.archived };
        remember(input.archived ? "archived" : "unarchived");
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/memory/delete", (route) => {
        const input = route.request().postDataJSON().json as { id: string; revision: number };
        expect(input).toEqual({ id: document!.id, revision: document!.revision });
        expect(document!.archived).toBe(true);
        document = undefined;
        versions.splice(0);
        return authResponse(route, { json: { deleted: true } });
      });
      await page.goto(base + memoryPath);
      await page.getByRole("button", { name: "New reference", exact: true }).click();
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Reference type", exact: true }).first(),
        "template",
      );
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Repository check template");
      await page.getByRole("textbox", { name: "Reference content", exact: true }).fill(original);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Repository check template", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Edit: Repository check template", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Reference content", exact: true })
        .fill("Check a newer workflow.");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await page.getByRole("button", { name: "Version timeline", exact: true }).click();
      await page.getByRole("button", { name: /^Revision 1\s*Created/ }).click();
      await page.getByRole("button", { name: "Restore revision 1", exact: true }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Restore version", exact: true })
        .click();
      await expect.poll(() => document?.revision).toBe(3);
      await expect(page.getByRole("alertdialog")).toBeHidden();
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-memory-timeline.png`),
        fullPage: true,
      });

      await page.goto(base + memoryPath);
      await page
        .getByRole("button", { name: "Edit: Repository check template", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Reference content", exact: true })
        .fill("Keep a newer reference revision.");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect.poll(() => document?.revision).toBe(4);
      await page
        .getByRole("button", { name: "Archive: Repository check template", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      await page.getByRole("checkbox", { name: "Include archived", exact: true }).check();
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await page
        .getByRole("button", { name: "Permanently delete Repository check template", exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toContainText("all its versions");
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-memory-delete.png`),
        fullPage: true,
      });
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete permanently", exact: true })
        .click();
      await expect.poll(() => document).toBeUndefined();
      await expect(
        page.getByRole("button", {
          name: "Permanently delete Repository check template",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.getByRole("main")).not.toContainText("Repository check template");
    },
  );
}
