import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DatePicker, DateRangePicker, type DateRangeValue } from "./date-picker.js";

it.each(["en", "zh"])(
  "selects an ISO civil date, localizes the calendar in %s and restores focus",
  async (locale) => {
    const user = userEvent.setup();
    const changed = vi.fn();
    function Form() {
      const [value, setValue] = useState("2026-11-04");
      return (
        <form>
          <label htmlFor="day">Day</label>
          <DatePicker
            id="day"
            name="day"
            locale={locale}
            placeholder="Day"
            value={value}
            onValueChange={(date) => {
              changed(date);
              setValue(date);
            }}
          />
        </form>
      );
    }
    const { container } = render(<Form />);
    const trigger = screen.getByRole("button", { name: "Day" });
    await user.click(trigger);
    expect(screen.getByRole("grid")).toHaveAccessibleName(
      locale === "zh" ? "2026年11月" : "November 2026",
    );
    expect(
      screen.getByRole("button", { name: locale === "zh" ? "前往下个月" : "Go to the Next Month" }),
    ).toBeVisible();
    expect(screen.getAllByRole("columnheader", { hidden: true })[0]).toHaveAccessibleName(
      locale === "zh" ? "星期一" : "Sunday",
    );
    const day = container.ownerDocument.querySelector<HTMLButtonElement>(
      'button[data-day="2026-11-04"]',
    )!;
    day.focus();
    await user.keyboard("[ArrowRight][Enter]");
    expect(changed).toHaveBeenLastCalledWith("2026-11-05");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(new FormData(container.querySelector("form")!).get("day")).toBe("2026-11-05");
  },
);

it("disables dates outside inclusive min/max and preserves controlled updates", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const { rerender } = render(
    <DatePicker
      aria-label="Day"
      locale="en"
      placeholder="Day"
      value="2026-11-04"
      min="2026-11-03"
      max="2026-11-05"
      onValueChange={changed}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Day" }));
  expect(document.querySelector('button[data-day="2026-11-02"]')).toBeDisabled();
  expect(document.querySelector('button[data-day="2026-11-06"]')).toBeDisabled();
  expect(document.querySelector('button[data-day="2026-11-03"]')).toBeEnabled();
  expect(document.querySelector('button[data-day="2026-11-05"]')).toBeEnabled();
  await user.click(document.querySelector('button[data-day="2026-11-02"]')!);
  expect(changed).not.toHaveBeenCalled();
  await user.keyboard("[Escape]");
  rerender(
    <DatePicker
      aria-label="Day"
      locale="en"
      placeholder="Day"
      value="2026-12-01"
      onValueChange={changed}
    />,
  );
  expect(screen.getByRole("button", { name: "Day" })).toHaveTextContent("Dec 1, 2026");
});

it("selects inclusive ranges in two clicks including same-day ranges and keeps incomplete drafts on Escape", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  function Form() {
    const [value, setValue] = useState<DateRangeValue>({ from: "2026-11-04", to: "2026-11-06" });
    return (
      <form>
        <DateRangePicker
          aria-label="Range"
          name="range"
          locale="en"
          placeholder="Range"
          value={value}
          onValueChange={(range) => {
            changed(range);
            setValue(range);
          }}
        />
      </form>
    );
  }
  const { container } = render(<Form />);
  const trigger = screen.getByRole("button", { name: "Range" });
  await user.click(trigger);
  await user.click(document.querySelector('button[data-day="2026-11-09"]')!);
  expect(changed).toHaveBeenLastCalledWith({ from: "2026-11-09", to: "" });
  expect(screen.getByRole("grid")).toBeVisible();
  await user.keyboard("[Escape]");
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(document.querySelector('button[data-day="2026-11-11"]')!);
  expect(changed).toHaveBeenLastCalledWith({ from: "2026-11-09", to: "2026-11-11" });
  await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
  expect(new FormData(container.querySelector("form")!).get("range.to")).toBe("2026-11-11");
  await user.click(trigger);
  await user.click(document.querySelector('button[data-day="2026-11-09"]')!);
  await user.click(document.querySelector('button[data-day="2026-11-09"]')!);
  expect(changed).toHaveBeenLastCalledWith({ from: "2026-11-09", to: "2026-11-09" });
});
