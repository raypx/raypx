import { expect, type Page } from "@playwright/test";
import { expectSurfaceAtRest } from "./geometry.js";

/** Visibility alone does not establish that a control is inside the fixed toolbar or hittable. */
export async function expectConversationHeaderControls(page: Page) {
  const header = page.locator("[data-conversation-header]");
  const menu = header.getByRole("button", { name: "Routines and memory", exact: true });
  await expect(header).toBeVisible();
  await expectSurfaceAtRest(page, header);
  await expect(header.getByRole("button", { name: /^Computer:/ })).toBeVisible();
  if (page.viewportSize()!.width < 640) {
    await expect(menu).toBeVisible();
    await expect(header.getByRole("button", { name: "Routines", exact: true })).toBeHidden();
    await expect(header.getByRole("button", { name: "Memory", exact: true })).toBeHidden();
  } else {
    await expect(menu).toBeHidden();
    await expect(header.getByRole("button", { name: "Routines", exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: "Memory", exact: true })).toBeVisible();
  }
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
            if (!name || !actions || name.right > actions.left)
              failures.push("Agent name overlaps header actions");
            return failures;
          },
          undefined,
          { timeout: 3000 },
        ),
      {
        timeout: 3000,
        message:
          "Header controls must fit inside one top-bar row, without overlap or obscured hit targets",
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
  const menu = header.getByRole("button", { name: "Routines and memory", exact: true });
  await menu.click({ timeout: 2000 });
  await page.getByRole("menuitem", { name, exact: true }).click({ timeout: 2000 });
  return menu;
}
