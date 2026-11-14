import { expect, type Page } from "@playwright/test";
import { expectSurfaceAtRest } from "./geometry.js";

/** Visibility alone does not establish that a control is inside the fixed toolbar or hittable. */
export async function expectConversationHeaderControls(page: Page) {
  const header = page.locator("[data-conversation-header]");
  await expect(header).toBeVisible({ timeout: 3000 });
  await expectSurfaceAtRest(page, header);
  for (const name of ["Conversation", "Activity", "Files"])
    await expect(header.getByRole("tab", { name, exact: true })).toBeVisible({ timeout: 3000 });
  await expect(
    header.getByRole("button", { name: "Conversation actions", exact: true }),
  ).toBeVisible({ timeout: 3000 });
  await expect
    .poll(
      () =>
        header.evaluate(
          (node) => {
            const bar = node.closest("header[data-frame]");
            if (!bar) return ["Conversation header is missing its shell toolbar"];
            const bounds = [node.getBoundingClientRect(), bar.getBoundingClientRect()];
            const controls = [...node.querySelectorAll("button")].filter((control) => {
              if (control.getClientRects().length === 0) return false;
              if (control.closest("[aria-hidden=true]") || control.matches(":disabled"))
                return false;
              if (control.getAttribute("aria-disabled") === "true") return false;
              if (getComputedStyle(control).pointerEvents === "none") return false;
              const box = control.getBoundingClientRect();
              return box.width > 1 && box.height > 1;
            });
            const failures: string[] = [];
            for (const [index, control] of controls.entries()) {
              const label = control.getAttribute("aria-label") ?? "Header control";
              const box = control.getBoundingClientRect();
              if (box.width <= 0 || box.height <= 0) failures.push(`${label} has no hit area`);
              for (const bound of bounds) {
                if (
                  box.left < bound.left - 0.5 ||
                  box.top < bound.top - 0.5 ||
                  box.right > bound.right + 0.5 ||
                  box.bottom > bound.bottom + 0.5
                )
                  failures.push(`${label} extends outside the top bar`);
              }
              for (const other of controls.slice(index + 1)) {
                const otherBox = other.getBoundingClientRect();
                if (
                  Math.min(box.right, otherBox.right) > Math.max(box.left, otherBox.left) &&
                  Math.min(box.bottom, otherBox.bottom) > Math.max(box.top, otherBox.top)
                )
                  failures.push(
                    `${label} overlaps ${other.getAttribute("aria-label") ?? "another control"}`,
                  );
              }
              const hit = document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
              );
              if (!hit || !control.contains(hit))
                failures.push(`${label} is obscured at its centre`);
            }
            const name = node.querySelector("h1")?.getBoundingClientRect();
            const actions = node
              .querySelector("[data-conversation-actions]")
              ?.getBoundingClientRect();
            if (!name || !actions) failures.push("Conversation title/actions are missing");
            else if (
              Math.min(name.right, actions.right) > Math.max(name.left, actions.left) &&
              Math.min(name.bottom, actions.bottom) > Math.max(name.top, actions.top)
            )
              failures.push("Agent name overlaps header actions");
            if (innerWidth < 640 && name && actions) {
              const tabs = [...node.querySelectorAll('[role="tab"]')].map((tab) =>
                tab.getBoundingClientRect(),
              );
              if (tabs.some((tab) => tab.top < Math.max(name.bottom, actions.bottom) - 0.5))
                failures.push("Tabs must occupy the second header row");
              if (tabs.some((tab) => Math.abs(tab.top - tabs[0]!.top) > 0.5))
                failures.push("Tabs must stay on one line");
            }
            return failures;
          },
          undefined,
          { timeout: 3000 },
        ),
      {
        timeout: 3000,
        message: "Header title, tabs and controls must fit without overlap or obscured hit targets",
      },
    )
    .toEqual([]);
}

/** A capability keeps its name when reached through the compact header menu. */
export async function openConversationCapability(page: Page, name: "Routines" | "Memory") {
  const header = page.locator("[data-conversation-header]");
  const inline = header.getByRole("button", { name, exact: true });
  if (await inline.isVisible()) {
    await inline.click({ timeout: 2000 });
    return inline;
  }
  const menu = header.getByRole("button", { name: "Conversation actions", exact: true });
  await menu.click({ timeout: 2000 });
  await page.getByRole("menuitem", { name, exact: true }).click({ timeout: 2000 });
  return menu;
}
