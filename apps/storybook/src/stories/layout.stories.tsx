import { Avatar as UserAvatar } from "@raypx/ui/avatar";
import { Avatar, AvatarFallback } from "@raypx/ui/components/ui/avatar";
import { Button } from "@raypx/ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { Logo } from "@raypx/ui/logo";
import { PageHeader } from "@raypx/ui/page-header";
import { SectionHeading } from "@raypx/ui/section-heading";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Patterns/Layout",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Brand: Story = {
  render: () => <Logo />,
};

export const Headings: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader
        title="Account"
        description="Manage your profile, sessions and connected devices."
        action={<Button variant="outline">Edit profile</Button>}
      />
      <SectionHeading
        title="Connected devices"
        description="Desktops that can run remote tasks."
        action={
          <Button size="sm" variant="ghost">
            Manage
          </Button>
        }
      />
    </div>
  ),
};

export const Avatars: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <UserAvatar name="Ada Lovelace" size="small" />
      <UserAvatar name="Ada Lovelace" />
      <UserAvatar name="Ada Lovelace" size="large" />
      <Avatar size="lg">
        <AvatarFallback>RX</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const TabsExample: Story = {
  name: "Tabs",
  render: () => (
    <div className="flex flex-col gap-8">
      <Tabs defaultValue="profile" className="max-w-md">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">Profile settings</TabsContent>
        <TabsContent value="security">Password and sessions</TabsContent>
        <TabsContent value="devices">Connected desktops</TabsContent>
      </Tabs>
      <Tabs defaultValue="all" className="max-w-md">
        <TabsList variant="line">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>
        <TabsContent value="all">All tasks</TabsContent>
        <TabsContent value="pending">Awaiting approval</TabsContent>
      </Tabs>
    </div>
  ),
};
