import { useId, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../../src/components/field.js";
import { Input } from "../../src/components/input.js";

type FieldArgs = ComponentProps<typeof Field> & {
  invalid: boolean;
  label: string;
  description: string;
  error: string;
};

const meta = {
  title: "Forms/Field",
  component: Field,
  tags: ["autodocs"],
  args: {
    orientation: "vertical",
    disabled: false,
    invalid: false,
    label: "Email address",
    description: "We will use this email for account notifications.",
    error: "Enter a valid email address.",
  },
  argTypes: {
    orientation: { control: "select", options: ["vertical", "horizontal", "responsive"] },
    invalid: { control: "boolean" },
    disabled: { control: "boolean" },
    label: { control: "text" },
    description: { control: "text" },
    error: { control: "text" },
  },
  render: function Render({ invalid, label, description, error, ...args }) {
    const id = useId();
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;
    return (
      <div className="w-full max-w-xl">
        <Field {...args} data-invalid={invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              type="email"
              placeholder="you@example.com"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${descriptionId} ${errorId}` : descriptionId}
            />
            <FieldDescription id={descriptionId}>{description}</FieldDescription>
            {invalid && <FieldError id={errorId} errors={[{ message: error }]} />}
          </FieldContent>
        </Field>
      </div>
    );
  },
} satisfies Meta<FieldArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Described: Story = {};
export const Invalid: Story = {
  args: { invalid: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Email address" });
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      "We will use this email for account notifications. Enter a valid email address.",
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
  },
};
export const Disabled: Story = { args: { disabled: true } };
export const Horizontal: Story = { args: { orientation: "horizontal" } };
export const Responsive: Story = { args: { orientation: "responsive" } };
