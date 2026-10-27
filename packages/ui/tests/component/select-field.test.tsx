/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import { SelectField } from "../../src/select-field";

const options = [
  { value: "work", label: "Work" },
  { value: "offline", label: "Offline folder", disabled: true },
  { value: "personal", label: "Personal" },
];

it("submits named values after keyboard selection while skipping disabled options", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { container } = render(
    <form>
      <label htmlFor="folder">Folder</label>
      <SelectField
        id="folder"
        name="rootId"
        defaultValue="work"
        required
        options={options}
        onValueChange={onChange}
      />
    </form>,
  );
  const trigger = screen.getByRole("combobox", { name: "Folder" });
  const form = container.querySelector("form")!;
  expect(trigger).toHaveTextContent("Work");
  expect(new FormData(form).get("rootId")).toBe("work");
  await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard("[ArrowDown]");
  expect(await screen.findByRole("option", { name: "Offline folder" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("[End][Enter]");
  expect(onChange).toHaveBeenCalledWith("personal");
  expect(trigger).toHaveTextContent("Personal");
  expect(new FormData(form).get("rootId")).toBe("personal");
});

it("keeps empty filter values distinct from required placeholders and follows controlled resets", () => {
  const { rerender } = render(
    <SelectField
      aria-label="Computer"
      value=""
      options={[{ value: "", label: "All computers" }, ...options]}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Computer" })).toHaveTextContent("All computers");
  rerender(
    <SelectField
      aria-label="Computer"
      value={null}
      placeholder="Choose a computer"
      options={options}
      required
    />,
  );
  expect(screen.getByRole("combobox", { name: "Computer" })).toHaveTextContent("Choose a computer");
});
