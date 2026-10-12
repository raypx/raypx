/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { Avatar } from "../avatar";
import { Logo } from "../logo";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { Toaster, toast } from "./ui/toast";

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

    expect(screen.getByText("Voidmix")).toBeVisible();
    expect(document.querySelector('[data-slot="logo-mark"]')).toMatchObject({
      height: 28,
      width: 28,
    });
    expect(document.querySelector('[data-slot="logo-mark"]')).toHaveAttribute(
      "src",
      expect.stringContaining("voidmix-mark.webp"),
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

describe("layout primitives", () => {
  it("exposes base-nova card slots", () => {
    render(
      <Card>
        <CardContent>Workspace summary</CardContent>
      </Card>,
    );

    expect(screen.getByText("Workspace summary")).toHaveAttribute("data-slot", "card-content");
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
