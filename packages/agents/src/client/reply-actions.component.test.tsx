import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { ReplyActions } from "./reply-actions.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });

it.each(["en", "zh"] as const)(
  "copies a completed reply and restores retry editing only on explicit action in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const retry = vi.fn();
    const activity = vi.fn();
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ReplyActions
          text="A **complete** reply"
          getArticle={() => null}
          onRetry={retry}
          onActivity={activity}
        />
      </BrowserLanguageProvider>,
    );
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: strings.copyReply }));
    await screen.findByRole("button", { name: strings.replyCopied });
    expect(copy).toHaveBeenCalledWith("A **complete** reply");
    fireEvent.click(screen.getByRole("button", { name: strings.retry }));
    expect(retry).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: strings.replyActions }));
    await user.click(await screen.findByRole("menuitem", { name: strings.activity.title }));
    expect(activity).toHaveBeenCalledOnce();
  },
);

it("preserves an existing draft by disabling retry and offers manual selection when copying fails", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  const retry = vi.fn();
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <article data-testid="reply">
        <div data-reply-bubble>Only the reply text</div>
        <ReplyActions
          text="Only the reply text"
          getArticle={() => view.container.querySelector("article")}
          onRetry={retry}
          retryDisabled
          onActivity={() => {}}
        />
      </article>
    </BrowserLanguageProvider>,
  );
  expect(screen.getByRole("button", { name: "Prepare retry" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Prepare retry" }));
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Copy reply" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(en.agents.copyReplyError),
  );
  expect(window.getSelection()?.toString()).toBe("Only the reply text");
});
