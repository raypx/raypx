import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@voidmix/ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voidmix/ui/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@voidmix/ui/components/ui/alert";
import { LoadingState } from "@voidmix/ui/loading-state";
import { PageHeader } from "@voidmix/ui/page-header";
import { StatusBadge } from "@voidmix/ui/status-badge";

const meta = {
  title: "Patterns/Neutral workbench",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: { title: "Projects", description: "Your projects and work in progress." },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LongTitle: Story = {
  args: {
    title: "A shared place for the autumn collection and the next international product launch",
    action: <Button>New project</Button>,
  },
};
export const Feedback: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-6">
      <Alert variant="destructive">
        <AlertTitle>Could not save this project</AlertTitle>
        <AlertDescription>
          Your draft is still here. Check the connection and try again.
        </AlertDescription>
      </Alert>
      <Button variant="outline">Try again</Button>
      <LoadingState label="Loading projects…" />
    </div>
  ),
};
export const ProductPreview: Story = {
  render: () => (
    <Tabs defaultValue="projects" className="max-w-lg">
      <TabsList aria-label="Product preview">
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="tasks">Tasks & details</TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="py-6">
        <StatusBadge label="In progress" tone="info" />
      </TabsContent>
      <TabsContent value="tasks" className="py-6">
        <StatusBadge label="Done" tone="success" />
      </TabsContent>
    </Tabs>
  ),
};
export const Dark: Story = { globals: { theme: "dark" }, ...Feedback };
