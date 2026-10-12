import { describe, expect, it } from "vite-plus/test";

import { messages } from "../../tests/fixtures/messages";

import { Route } from "./__root";

describe("web root route", () => {
  it.each([
    [
      "en",
      "Voidmix | Your project workbench",
      "Give every project a place. Organize tasks, see what needs attention, and keep your work in context on Web and Desktop.",
    ],
    [
      "zh",
      "Voidmix | 让项目工作，清晰有序",
      "让每个项目都有清晰的位置。组织任务、查看进展，在 Web 与 Desktop 中接续工作。",
    ],
  ] as const)(
    "defines the root route and %s public metadata",
    async (locale, title, description) => {
      const head = await Route.options.head?.({
        loaderData: { locale, messages: messages[locale], theme: "system" },
      } as never);
      expect(Route.isRoot).toBe(true);
      expect(Route.options.errorComponent).toBeDefined();
      expect(Route.options.notFoundComponent).toBeDefined();
      expect(head?.meta).toEqual(
        expect.arrayContaining([{ title }, { name: "description", content: description }]),
      );
      expect(head?.links).toContainEqual(
        expect.objectContaining({
          href: `/manifest.webmanifest?locale=${locale}`,
          rel: "manifest",
        }),
      );
    },
  );
});
