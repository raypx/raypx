import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReplyMarkdown } from "./markdown.js";

const labels = {
  copyLabel: "Copy code",
  copiedLabel: "Code copied",
  copyErrorLabel: "Select the code and copy it manually.",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders paragraphs, lists, inline and fenced code, tables and safe links without active HTML or remote images", () => {
  const { container } = render(
    <ReplyMarkdown {...labels}>
      {
        "Paragraph with `inline`.\n\n1. First\n2. Second\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n| X | Y |\n\n[Safe](https://example.test) [Unsafe](javascript:alert%281%29)\n\n<script>alert('unsafe')</script>\n<img src=x onerror=alert(1)>\n\n![Remote](https://example.test/private.png)"
      }
    </ReplyMarkdown>,
  );
  expect(container.querySelector("p")?.textContent).toBe("Paragraph with inline.");
  expect(container.firstElementChild?.classList.contains("[&_:not(pre)>code]:bg-muted")).toBe(true);
  expect(container.firstElementChild?.classList.contains("[&_:not(pre)>code]:rounded-[3px]")).toBe(
    true,
  );
  expect(container.querySelectorAll("li")).toHaveLength(2);
  expect(container.querySelector("pre code")?.textContent).toBe("const n = 1;\n");
  expect(container.querySelector("[data-code-language]")?.textContent).toBe("js");
  expect(screen.getByRole("table").textContent).toContain("X");
  expect(screen.getByRole("link", { name: "Safe" }).getAttribute("target")).toBe("_blank");
  expect(screen.getByRole("link", { name: "Safe" }).getAttribute("rel")).toBe(
    "noopener noreferrer",
  );
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(container.querySelector("script, img, [onerror]")).toBeNull();
});

it("copies only fenced code and keeps the code and control mounted as a stream grows", async () => {
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const view = render(<ReplyMarkdown {...labels}>{"```ts\nconst value = 1;"}</ReplyMarkdown>);
  const button = screen.getByRole("button", { name: "Copy code" });
  const code = view.container.querySelector("pre");
  view.rerender(
    <ReplyMarkdown {...labels}>{"```ts\nconst value = 1;\nconst next = 2;\n```"}</ReplyMarkdown>,
  );
  expect(view.container.querySelector("pre")).toBe(code);
  expect(screen.getByRole("button", { name: "Copy code" })).toBe(button);
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Code copied" });
  expect(copy).toHaveBeenCalledWith("const value = 1;\nconst next = 2;\n");
  view.rerender(<ReplyMarkdown {...labels}>{"```ts\nconst changed = true;\n```"}</ReplyMarkdown>);
  await screen.findByRole("button", { name: "Copy code" });
});

it("offers manual selection if clipboard access fails", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  render(<ReplyMarkdown {...labels}>{"```\ncopy me\n```"}</ReplyMarkdown>);
  fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
  expect((await screen.findByRole("status")).textContent).toBe(labels.copyErrorLabel);
  expect(window.getSelection()?.toString()).toBe("copy me\n");
});
