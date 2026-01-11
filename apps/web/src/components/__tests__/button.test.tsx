import { Button } from "@raypx/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Button", () => {
  it("renders children correctly", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("applies default variant styles", () => {
    const { container } = render(<Button>Default</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveClass("inline-flex");
  });
});
