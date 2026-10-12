/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@voidmix/i18n/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { messages } from "../../../tests/fixtures/messages";
import { CreateTitleForm } from "./create-title-form";

afterEach(cleanup);

it.each(["project", "task"] as const)(
  "preserves %s drafts after failure and prevents duplicate submits",
  async (kind) => {
    let finish!: () => void;
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
    render(
      <I18nProvider locale="en" messages={messages}>
        <CreateTitleForm kind={kind} onCreate={onCreate} />
      </I18nProvider>,
    );
    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button");
    const form = input.closest("form")!;
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "  New work  " } });
    fireEvent.submit(form);
    const error = await screen.findByRole("alert");
    expect(input).toHaveValue("  New work  ");
    expect(input).toHaveAttribute("aria-describedby", error.id);
    expect(onCreate).toHaveBeenCalledWith("New work");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => finish());
    expect(input).toHaveValue("");
    expect(input).toBeEnabled();
    expect(form).toHaveAttribute("aria-busy", "false");
  },
);
