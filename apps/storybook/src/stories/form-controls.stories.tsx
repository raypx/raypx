import { Checkbox } from "@raypx/ui/components/ui/checkbox";
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
import { Mail, Search } from "lucide-react";

const meta = {
  title: "Primitives/Form controls",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput aria-label="Search tasks" placeholder="Search tasks" />
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Email" placeholder="you@example.com" type="email" />
        <InputGroupAddon align="inline-end">
          <Mail aria-hidden="true" />
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
