import { useId } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, FieldError, FieldLabel } from "@raypx/ui/components/ui/field";
import { PasswordInput, type PasswordInputProps } from "@raypx/ui/password-input";

function PasswordField({
  caption = "Password",
  error,
  ...props
}: PasswordInputProps & { caption?: string; error?: string }) {
  const id = useId();
  return (
    <Field className="w-80 max-w-full" data-disabled={props.disabled} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{caption}</FieldLabel>
      <PasswordInput
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

const meta = {
  title: "Patterns/Password input",
  component: PasswordInput,
  parameters: { layout: "padded" },
  args: {
    labels: { show: "Show password", hide: "Hide password", capsLock: "Caps Lock is on" },
    name: "password",
    autoComplete: "current-password",
    defaultValue: "example-password",
    className: "h-11",
  },
  render: (args) => <PasswordField {...args} />,
} satisfies Meta<typeof PasswordInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { defaultValue: "", placeholder: "Enter your password" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const ReadOnly: Story = {
  args: { readOnly: true },
};

export const Invalid: Story = {
  args: { defaultValue: "short", autoComplete: "new-password", minLength: 8 },
  render: (args) => <PasswordField {...args} error="Use at least 8 characters." />,
};

export const Chinese: Story = {
  args: {
    labels: { show: "显示密码", hide: "隐藏密码", capsLock: "大写锁定已开启" },
    defaultValue: "",
    placeholder: "请输入密码",
  },
  render: (args) => <PasswordField {...args} caption="密码" />,
};
