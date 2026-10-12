import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Modal } from "@voidmix/ui/modal";
import { Button } from "@voidmix/ui/components/ui/button";
import { Input } from "@voidmix/ui/components/ui/input";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
const meta = { title: "Patterns/Modal", component: Modal, tags: ["autodocs"] } satisfies Meta<
  typeof Modal
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Form: Story = {
  args: {
    title: "New project",
    description: "Give your project a name.",
    closeLabel: "Close",
    trigger: <Button>New project</Button>,
    children: null,
    open: false,
    onOpenChange: () => undefined,
  },
  render: function Example(args) {
    const [open, setOpen] = useState(false);
    return (
      <Modal {...args} open={open} onOpenChange={setOpen}>
        <Field>
          <FieldLabel htmlFor="title">Project name</FieldLabel>
          <Input id="title" autoFocus />
        </Field>
        <Button onClick={() => setOpen(false)}>Create project</Button>
      </Modal>
    );
  },
};
export const Navigation: Story = {
  ...Form,
  args: { ...Form.args!, drawer: true, title: "Navigation" },
};
