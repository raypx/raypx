import { expect, type Locator, type Page } from "@playwright/test";

const timeout = 5_000;

/** Visibility precedes the end of a sheet animation; measure a stable, contained box. */
export async function expectSurfaceAtRest(page: Page, surface: Locator) {
  await expect(surface).toBeVisible({ timeout });
  const viewport = page.viewportSize()!;
  let previous = "";
  let stable = 0;
  await expect
    .poll(
      async () => {
        const box = await surface.boundingBox({ timeout });
        if (!box) return false;
        const signature = [box.x, box.y, box.width, box.height]
          .map((value) => Math.round(value * 10))
          .join(":");
        stable = signature === previous ? stable + 1 : 0;
        previous = signature;
        return (
          stable >= 2 &&
          box.x >= -0.5 &&
          box.y >= -0.5 &&
          box.x + box.width <= viewport.width + 0.5 &&
          box.y + box.height <= viewport.height + 0.5
        );
      },
      { timeout, message: "Surface must come to rest inside the viewport before measurement" },
    )
    .toBe(true);
}

/** Only real, enabled, visible pointer targets participate in a centre hit test. */
export async function expectSurfaceControls(page: Page, surface: Locator) {
  await expectSurfaceAtRest(page, surface);
  await expect
    .poll(
      () =>
        surface.evaluate(
          (node) => {
            const bounds = node.getBoundingClientRect();
            const failures: string[] = [];
            for (const control of node.querySelectorAll<HTMLElement>(
              "button, input, textarea, [role=combobox], [role=option]",
            )) {
              if (control.getClientRects().length === 0) continue;
              if (control.closest("[aria-hidden=true]") || control.matches(":disabled")) continue;
              if (control.getAttribute("aria-disabled") === "true") continue;
              const style = getComputedStyle(control);
              if (style.pointerEvents === "none" || style.visibility === "hidden") continue;
              const box = control.getBoundingClientRect();
              if (box.width <= 1 || box.height <= 1) continue;
              const x = box.left + box.width / 2;
              const y = box.top + box.height / 2;
              if (y <= bounds.top || y >= bounds.bottom || x <= bounds.left || x >= bounds.right)
                continue;
              const label = control.getAttribute("aria-label") ?? control.textContent ?? "Control";
              if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5)
                failures.push(`${label} extends outside its container`);
              const hit = document.elementFromPoint(x, y);
              if (!hit || !control.contains(hit)) failures.push(`${label} is obscured`);
            }
            if (node.scrollWidth > node.clientWidth + 1) failures.push("Surface overflows");
            if (document.documentElement.scrollWidth > window.innerWidth)
              failures.push("Page overflows");
            return failures;
          },
          undefined,
          { timeout },
        ),
      { timeout, message: "Visible surface controls must fit and remain unobscured" },
    )
    .toEqual([]);
}
