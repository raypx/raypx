import { createRef } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { cleanup, render, screen } from "@testing-library/react";
import { SearchIcon } from "./icons/search.ts";
import { DeleteIcon } from "./icons/delete.ts";

afterEach(cleanup);

describe("public icon components", () => {
  it("forwards SVG refs and updated sizing, stroke and accessibility props", () => {
    const ref = createRef<SVGSVGElement>();
    const view = render(<SearchIcon ref={ref} data-icon="inline-start" />);
    const svg = ref.current;
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-icon")).toBe("inline-start");

    view.rerender(
      <SearchIcon
        ref={ref}
        role="img"
        aria-label="Search sessions"
        size={16}
        strokeWidth={2.5}
        className="size-4"
      />,
    );
    expect(ref.current).toBe(svg);
    expect(screen.getByRole("img", { name: "Search sessions" })).toBe(svg);
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
    expect(svg?.getAttribute("stroke-width")).toBe("2.5");
    expect(svg?.classList.contains("size-4")).toBe(true);
  });

  it("keeps decorative glyphs out of the accessible name of icon-only controls", () => {
    render(
      <button type="button" aria-label="Delete draft">
        <DeleteIcon />
      </button>,
    );
    expect(
      screen
        .getByRole("button", { name: "Delete draft" })
        .querySelector("svg")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
