/** @vitest-environment happy-dom */

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "./avatar.js";
import { Logo } from "./logo.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Field, FieldError, FieldLabel } from "./components/ui/field.js";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "./components/ui/input-group.js";
import { Toaster, toast } from "./components/ui/toast.js";

afterEach(() => cleanup());

describe("Button", () => {
  it("renders an accessible button with its default type", () => {
    render(<Button>Save changes</Button>);

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("group/button");
  });

  it("supports keyboard focus and disabled state", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>Continue</Button>
        <Button disabled>Unavailable</Button>
      </>,
    );

    const enabled = screen.getByRole("button", { name: "Continue" });
    await user.tab();
    expect(enabled).toHaveFocus();
    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  });
});

describe("Avatar", () => {
  it("provides an accessible name and initials fallback", () => {
    render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveTextContent("AL");
  });
});

describe("Logo", () => {
  it("uses the shared generated mark while keeping the accessible wordmark", () => {
    render(<Logo />);

    expect(screen.getByText("Raypx")).toBeVisible();
    expect(document.querySelector('[data-slot="logo-mark"]')).toMatchObject({
      height: 28,
      width: 28,
    });
    expect(document.querySelector('[data-slot="logo-mark"]')).toHaveAttribute(
      "src",
      expect.stringContaining("raypx-mark.webp"),
    );
  });
});

describe("Badge", () => {
  it("uses the base-nova variant API", () => {
    render(<Badge variant="secondary">Active</Badge>);

    expect(screen.getByText("Active")).toHaveAttribute("data-slot", "badge");
    expect(screen.getByText("Active")).toHaveClass("bg-secondary");
  });
});

describe("form primitives", () => {
  it("associates a field label with its input and exposes an error", () => {
    render(
      <Field data-invalid="true">
        <FieldLabel htmlFor="account-email">Email</FieldLabel>
        <InputGroup className="h-9">
          <InputGroupInput id="account-email" aria-invalid="true" type="email" />
          <InputGroupAddon align="inline-end">Required</InputGroupAddon>
        </InputGroup>
        <FieldError>Email is required.</FieldError>
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "data-slot",
      "input-group-control",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Email is required.");
  });

  it("focuses the grouped input when its addon is clicked", async () => {
    const user = userEvent.setup();
    render(
      <InputGroup>
        <InputGroupInput aria-label="Workspace" />
        <InputGroupAddon>@</InputGroupAddon>
      </InputGroup>,
    );

    await user.click(screen.getByText("@"));
    expect(screen.getByRole("textbox", { name: "Workspace" })).toHaveFocus();
  });

  it("keeps multiline input and addon buttons independently operable", async () => {
    const user = userEvent.setup();
    render(
      <InputGroup>
        <InputGroupTextarea aria-label="Notes" defaultValue="草稿" maxLength={12} />
        <InputGroupAddon align="block-end">
          <span>字数 / Characters</span>
          <Button>Attach</Button>
        </InputGroupAddon>
      </InputGroup>,
    );
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    await user.click(screen.getByText("字数 / Characters"));
    expect(textarea).toHaveFocus();
    await user.keyboard("{End}{Enter}继续");
    expect(textarea).toHaveValue("草稿\n继续");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    expect(screen.getByRole("button", { name: "Attach" })).toHaveFocus();
  });
});

describe("Toast", () => {
  it("renders high-priority error feedback through the shared manager", async () => {
    render(<Toaster />);

    act(() => {
      toast.add({
        title: "Sign in failed",
        description: "Check your email and password.",
        type: "error",
        priority: "high",
        timeout: 0,
      });
    });

    expect(
      await screen.findByText("Sign in failed", { selector: '[data-slot="toast-title"]' }),
    ).toBeVisible();
    expect(
      screen.getByText("Check your email and password.", {
        selector: '[data-slot="toast-description"]',
      }),
    ).toBeVisible();
    expect(document.querySelector('[data-slot="toast-close"]')).toBeVisible();
  });
});
