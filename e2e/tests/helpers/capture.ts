import { expect, test, type Locator, type Page } from "@playwright/test";
import { appendFile, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
const captured = new Set<string>();

/** Keep review screenshots opt-in; Playwright captures failures independently. */
export async function capture(
  page: Page,
  options: Parameters<Page["screenshot"]>[0],
  reveal?: Locator,
) {
  if (process.env.RAYPX_E2E_SCREENSHOTS !== "1") return;
  await expect(
    page.locator('[data-slot="collapsible-content"][data-open][data-starting-style]'),
  ).toHaveCount(0);
  await page.screenshot({ animations: "disabled", ...options });
  const phase = process.env.RAYPX_PAGE_REVIEW_PHASE;
  if (phase !== "before" && phase !== "after") return;
  const info = test.info();
  const name =
    `${info.project.name}-${basename(info.file, ".spec.ts")}-${basename(options?.path?.toString() ?? "screen.png", ".png")}`
      .replace(/[^a-zA-Z0-9_.-]/gu, "-")
      .replace(/-(?:web|desktop)-\d+x\d+-(?:light|dark)-/gu, "-")
      .replace(/-(?:1280|800)-(en|zh)-(?:light|dark)$/u, "-$1")
      .replace(/-(?:light|dark)$/u, "");
  if (
    process.env.RAYPX_PAGE_REVIEW_MATCH &&
    !new RegExp(process.env.RAYPX_PAGE_REVIEW_MATCH).test(name)
  )
    return;
  const directory = resolve(
    import.meta.dir,
    "../../../",
    process.env.RAYPX_PAGE_REVIEW_DIRECTORY ?? ".artifacts/pages",
  );
  await mkdir(join(directory, phase), { recursive: true });
  const viewport = page.viewportSize();
  const media = await page.evaluate(() => ({
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches
      ? ("dark" as const)
      : ("light" as const),
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? ("reduce" as const)
      : ("no-preference" as const),
  }));
  const scrollPositions = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll("*"))
      .filter((node) => node.scrollTop || node.scrollLeft)
      .map((node) => ({ node, top: node.scrollTop, left: node.scrollLeft })),
  );
  const originalTheme = await page.locator("html").evaluate((node) => ({
    classes: node.getAttribute("class") ?? "",
    theme: node.dataset.theme,
    scheme: node.style.colorScheme,
  }));
  const widths = process.env.RAYPX_PAGE_REVIEW_WIDTHS
    ? [...new Set(process.env.RAYPX_PAGE_REVIEW_WIDTHS.split(",").map(Number))]
    : [1440, 1024, 768, 390];
  if (!widths.length || widths.some((width) => ![1440, 1024, 768, 390].includes(width)))
    throw new Error("Page review widths must select 1440, 1024, 768 or 390");
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const theme of ["light", "dark"]) {
        const filename = `${name}-${width}-${theme}.png`;
        if (captured.has(`${phase}:${filename}`)) continue;
        await page.emulateMedia({
          colorScheme: theme === "dark" ? "dark" : "light",
          reducedMotion: "reduce",
        });
        await page.locator("html").evaluate((node, value) => {
          node.classList.remove("light", "dark");
          node.classList.add(value);
          node.dataset.theme = value;
          node.style.colorScheme = value;
        }, theme);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        });
        if (reveal) await reveal.scrollIntoViewIfNeeded();
        await page.screenshot({
          ...options,
          path: join(directory, phase, filename),
          animations: "disabled",
        });
        await appendFile(
          join(directory, `${phase}.jsonl`),
          `${JSON.stringify({ key: filename, surface: info.project.name, screen: name, width, theme, phase, path: join(process.env.RAYPX_PAGE_REVIEW_DIRECTORY ?? ".artifacts/pages", phase, filename), test: info.title, url: new URL(page.url()).pathname })}\n`,
        );
        captured.add(`${phase}:${filename}`);
      }
    }
  } finally {
    await page.emulateMedia(media);
    await page.locator("html").evaluate((node, value) => {
      node.setAttribute("class", value.classes);
      if (value.theme) node.dataset.theme = value.theme;
      else delete node.dataset.theme;
      node.style.colorScheme = value.scheme;
    }, originalTheme);
    if (viewport) await page.setViewportSize(viewport);
    await scrollPositions.evaluate((positions) => {
      for (const { node, top, left } of positions) {
        node.scrollTop = top;
        node.scrollLeft = left;
      }
    });
    await scrollPositions.dispose();
  }
}
