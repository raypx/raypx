import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId, useState, type ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Input } from "../../src/components/input.js";
import { Label } from "../../src/components/label.js";
import { useDebouncedValue } from "../../src/hooks/debounce.js";

function DebouncedSearchInput(args: ComponentProps<typeof Input>) {
  const id = useId();
  const [search, setSearch] = useState("");
  const settledSearch = useDebouncedValue(search, 250);
  const projects = ["Design library", "Customer portal", "Release notes", "Usage reports"].filter(
    (project) => project.toLowerCase().includes(settledSearch.toLowerCase()),
  );
  return (
    <div className="grid gap-3">
      <Label htmlFor={id}>Search projects</Label>
      <Input
        {...args}
        id={id}
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
          args.onChange?.(event);
        }}
      />
      <output aria-label="Applied search" className="break-words text-sm text-muted-foreground">
        Applied search: {settledSearch || "none"}
      </output>
      <ul
        aria-label="Matching projects"
        aria-busy={search !== settledSearch}
        className="grid gap-2 text-sm"
      >
        {projects.length ? (
          projects.map((project) => <li key={project}>{project}</li>)
        ) : (
          <li>No projects match this search.</li>
        )}
      </ul>
    </div>
  );
}

const meta = {
  title: "Forms/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    type: "text",
    placeholder: "Enter your name",
    disabled: false,
    readOnly: false,
    "aria-label": "Display name",
  },
  argTypes: {
    type: { control: "select", options: ["text", "email", "password", "search", "number"] },
    placeholder: { control: "text" },
    defaultValue: { control: "text" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Email: Story = {
  args: { type: "email", placeholder: "you@example.com", "aria-label": "Email address" },
};
export const Password: Story = {
  args: { type: "password", defaultValue: "example-password", "aria-label": "Password" },
};
export const Disabled: Story = { args: { disabled: true, defaultValue: "Unavailable" } };
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: "Readonly name" } };
export const DebouncedSearch: Story = {
  args: { type: "search", placeholder: "Filter projects", "aria-label": "Search projects" },
  argTypes: { defaultValue: { control: false }, value: { control: false } },
  render: (args) => <DebouncedSearchInput {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: "Search projects" });
    await userEvent.type(search, "release");
    await expect(search).toHaveValue("release");
    await waitFor(() =>
      expect(canvas.getByRole("status", { name: "Applied search" })).toHaveTextContent(
        "Applied search: release",
      ),
    );
    const projects = canvas.getByRole("list", { name: "Matching projects" });
    await expect(within(projects).getByText("Release notes")).toBeVisible();
    await expect(within(projects).queryByText("Design library")).not.toBeInTheDocument();
  },
};
