import { useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@raypx/ui/components/ui/select";
import { selectOption } from "../../helpers/select";

it("reacquires Select options after a rejected selection and compares full overlapping labels", async () => {
  function Fixture() {
    const [value, setValue] = useState<string | null>("two");
    const first = useRef(true);
    return (
      <Select
        value={value}
        items={[
          { value: "one", label: "Folder" },
          { value: "two", label: "Folder 2" },
        ]}
        onValueChange={(next) => {
          if (first.current) {
            first.current = false;
            return;
          }
          setValue(next);
        }}
      >
        <SelectTrigger aria-label="Folder">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one" data-value="one">
            Folder
          </SelectItem>
          <SelectItem value="two" data-value="two">
            Folder 2
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }
  render(<Fixture />);
  await selectOption("Folder", "one");
  expect(
    screen.getByRole("combobox", { name: "Folder" }).querySelector('[data-slot="select-value"]')
      ?.textContent,
  ).toBe("Folder");
});
