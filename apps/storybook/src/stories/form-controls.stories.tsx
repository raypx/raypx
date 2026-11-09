import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { PasswordInput } from "@raypx/ui/password-input";
import { SelectField } from "@raypx/ui/select-field";
import { Field, FieldError, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { Label } from "@raypx/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import { Switch } from "@raypx/ui/components/ui/switch";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { HelpHint } from "@raypx/ui/help-hint";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MailIcon } from "@raypx/icons/mail";
import { SearchIcon } from "@raypx/icons/search";

const meta = {
  title: "Primitives/Form controls",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Same-row controls share their height, corners and compact type scale. */
export const Sizes: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-6">
      {(["sm", "default", "lg", "xl"] as const).map((size) => (
        <section key={size} aria-label={`${size} controls`} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{size}</h2>
          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <Input
              controlSize={size}
              aria-label={`${size} project`}
              placeholder="项目名称 / Project"
            />
            <SelectField
              size={size}
              aria-label={`${size} language`}
              defaultValue="zh"
              options={[
                { value: "zh", label: "简体中文" },
                { value: "en", label: "English" },
              ]}
            />
            <Button size={size}>继续 / Continue</Button>
            <IconButton
              size={size === "default" ? "icon" : `icon-${size}`}
              label={`${size} search`}
            >
              <SearchIcon aria-hidden="true" />
            </IconButton>
          </div>
          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
            <InputGroup controlSize={size}>
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput aria-label={`${size} filter`} placeholder="筛选 / Filter" />
            </InputGroup>
            <PasswordInput
              controlSize={size}
              aria-label={`${size} password`}
              placeholder="密码 / Password"
              labels={{ show: "显示密码 / Show password", hide: "隐藏密码 / Hide password" }}
            />
          </div>
        </section>
      ))}
    </div>
  ),
};

export const TextInputs: Story = {
  render: () => (
    <FieldGroup className="max-w-sm">
      <Field>
        <FieldLabel htmlFor="story-name">Display name</FieldLabel>
        <Input id="story-name" placeholder="Ada Lovelace" />
      </Field>
      <Field data-invalid="true">
        <FieldLabel htmlFor="story-email">Email</FieldLabel>
        <Input id="story-email" type="email" defaultValue="ada@" aria-invalid="true" />
        <FieldError>Enter a valid email address.</FieldError>
      </Field>
      <Field data-disabled="true">
        <FieldLabel htmlFor="story-disabled">Workspace</FieldLabel>
        <Input id="story-disabled" defaultValue="raypx" disabled />
      </Field>
      <Field>
        <FieldLabel htmlFor="story-notes">Notes</FieldLabel>
        <Textarea id="story-notes" placeholder="Anything we should know?" />
      </Field>
    </FieldGroup>
  ),
};

export const InputGroups: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput aria-label="Search tasks" placeholder="Search tasks" />
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Email" placeholder="you@example.com" type="email" />
        <InputGroupAddon align="inline-end">
          <MailIcon aria-hidden="true" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};

export const Selection: Story = {
  render: () => (
    <FieldGroup className="max-w-sm">
      <Field orientation="horizontal">
        <Checkbox id="story-terms" defaultChecked />
        <FieldLabel htmlFor="story-terms">Send product updates</FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <Switch id="story-sync" defaultChecked />
        <FieldLabel htmlFor="story-sync">Sync preferences on this device</FieldLabel>
        <HelpHint
          label="About sync"
          description="Device preferences stay local and survive sign-out."
        />
      </Field>
      <Field orientation="horizontal">
        <Switch id="story-compact" size="sm" />
        <FieldLabel htmlFor="story-compact">Compact layout</FieldLabel>
      </Field>
      <RadioGroup aria-label="Language" defaultValue="en">
        <Label>
          <RadioGroupItem value="en" />
          English
        </Label>
        <Label>
          <RadioGroupItem value="zh" />
          简体中文
        </Label>
      </RadioGroup>
      <Field>
        <FieldLabel htmlFor="story-region">Region</FieldLabel>
        <Select defaultValue="auto" items={{ auto: "Automatic", us: "United States", cn: "中国" }}>
          <SelectTrigger id="story-region" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="us">United States</SelectItem>
              <SelectItem value="cn">中国</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  ),
};
