import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { spaceIdSchema, type SpaceEvent } from "@raypx/core/spaces";
import { pageIdSchema } from "@raypx/core/pages";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import { MemberMessageText, usePageReferenceTitles } from "./page-reference.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const origin = "https://api.example.test";
const spaceId = spaceIdSchema.parse("space-one");
const id = pageIdSchema.parse("page-one");
const reference = `[Pages](${origin}/page-content/member/${spaceId}/${id})`;

function mount(
  text: string,
  options: {
    language?: "en" | "zh";
    titles?: ReadonlyMap<string, string>;
    onOpenPage?: (id: string) => void;
  } = {},
) {
  return render(
    <BrowserLanguageProvider initialPreference={options.language ?? "en"} restorePreference={false}>
      <p data-testid="message">
        <MemberMessageText text={text} origin={origin} spaceId={spaceId} {...options} />
      </p>
    </BrowserLanguageProvider>,
  );
}

it("renders the Page icon and current title while preserving surrounding plain text", () => {
  mount(`Before **literal**\n${reference} after https://example.test`, {
    titles: new Map([[id, "Release notes"]]),
  });
  const button = screen.getByRole("button", { name: "Open Page: Release notes" });
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(button).toHaveTextContent("Release notes");
  expect(screen.getByTestId("message").textContent).toBe(
    "Before **literal**\nRelease notes after https://example.test",
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByTestId("message").querySelector("strong")).toBeNull();
});

it.each([
  `[Page](https://other.test/page-content/member/${spaceId}/${id})`,
  `[Page](${origin}.other.test/page-content/member/${spaceId}/${id})`,
  `[Page](${origin}/page-content/member/space-two/${id})`,
  `[Page](${origin}/page-content/member/${spaceId}/)`,
  `[Page](${origin}/page-content/member/${spaceId}/%ZZ)`,
  `[Page](${origin}/page-content/member/${spaceId}/%70age-one)`,
  `[Page](${origin}/page-content/member/${spaceId}/${id}?version=1)`,
  `[Page](${origin}/page-content/member/${spaceId}/${id}#fragment)`,
  `[Page](${origin}/page-content/member/${spaceId}/../${id})`,
  `[Page](${origin}/page-content/member/${spaceId}/${id}`,
  `[Other](${origin}/page-content/member/${spaceId}/${id})`,
  `![Page](${origin}/page-content/member/${spaceId}/${id})`,
  `\\[Page](${origin}/page-content/member/${spaceId}/${id})`,
  `[[Page](${origin}/page-content/member/${spaceId}/${id})]`,
  `${origin}/page-content/member/${spaceId}/${id}`,
])("keeps a non-matching reference literal: %s", (text) => {
  mount(text);
  expect(screen.getByTestId("message").textContent).toBe(text);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("opens the referenced Page with keyboard activation", async () => {
  const onOpenPage = vi.fn();
  mount(reference, { onOpenPage });
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole("button", { name: "Open Page: Page" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onOpenPage).toHaveBeenCalledExactlyOnceWith(id);
});

it.each(["en", "zh"] as const)(
  "uses a localized fallback for unknown or untitled Pages (%s)",
  (language) => {
    mount(`[页面](${origin}/page-content/member/${spaceId}/${id}) ${reference}`, {
      language,
      titles: new Map([[id, " "]]),
    });
    const label = language === "en" ? "Open Page: Page" : "打开页面：页面";
    expect(screen.getAllByRole("button", { name: label })).toHaveLength(2);
  },
);

it("drops a deleted Page title on a Page invalidation and keeps the opener", async () => {
  const get = vi.fn(async () => ({ id, spaceId, title: "Release notes" }));
  const pages = { get };
  let notify: ((event: SpaceEvent) => void) | undefined;
  const subscribe = (listener: (event: SpaceEvent) => void) => {
    notify = listener;
    return () => {};
  };
  const onOpenPage = vi.fn();
  function Message() {
    const titles = usePageReferenceTitles(pages, spaceId, JSON.stringify([id]), subscribe);
    return (
      <MemberMessageText
        text={reference}
        origin={origin}
        spaceId={spaceId}
        titles={titles}
        onOpenPage={onOpenPage}
      />
    );
  }
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <Message />
    </BrowserLanguageProvider>,
  );
  await screen.findByRole("button", { name: "Open Page: Release notes" });
  get.mockRejectedValueOnce(new Error("PAGE_NOT_FOUND"));
  notify?.({ spaceId } as SpaceEvent);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Open Page: Page" })).toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open Page: Page" }));
  expect(onOpenPage).toHaveBeenCalledExactlyOnceWith(id);
  expect(get).toHaveBeenLastCalledWith({ spaceId, id });
});
