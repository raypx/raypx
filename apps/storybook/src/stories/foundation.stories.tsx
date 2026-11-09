import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@raypx/ui/components/ui/combobox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@raypx/ui/components/ui/input-group";
import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/ui/alert";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import { PageHeader } from "@raypx/ui/page-header";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { SearchIcon } from "@raypx/icons/search";

const meta = {
  title: "Patterns/Workbench foundations",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SurfacesAndType: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="工作台 / Workbench"
        description="中性表面与紧凑层次 / Neutral surfaces and compact hierarchy"
      />
      <section className="flex flex-col gap-4 border-y border-border py-4" aria-label="Typography">
        <h2 className="text-lg font-semibold">清晰的内容层次 / Content hierarchy</h2>
        <p className="max-w-[70ch] text-sm leading-relaxed">
          正文保持 14px。长中文与 English content should wrap naturally without widening the page.
          Information belongs to a readable layout, with the next action close to its context.
        </p>
        <p className="text-xs text-muted-foreground">次要信息 / Secondary information · 12px</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex min-h-24 items-end rounded-lg bg-background p-3 ring-1 ring-border">
          背景 / Background
        </div>
        <div className="flex min-h-24 items-end rounded-lg bg-muted p-3">分区 / Muted surface</div>
        <div className="flex min-h-24 items-end rounded-lg bg-popover p-3 shadow-popover">
          浮层 / Popover
        </div>
      </div>
    </div>
  ),
};

export const FormStates: Story = {
  render: () => (
    <FieldGroup className="max-w-md">
      <Field>
        <FieldLabel htmlFor="foundation-default">项目名称 / Project name</FieldLabel>
        <Input id="foundation-default" placeholder="输入项目名称 / Enter project name" />
      </Field>
      <Field data-disabled>
        <FieldLabel htmlFor="foundation-disabled">无法编辑 / Unavailable</FieldLabel>
        <Input id="foundation-disabled" disabled defaultValue="Read-only workspace" />
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor="foundation-invalid">邮箱 / Email</FieldLabel>
        <Input
          id="foundation-invalid"
          type="email"
          defaultValue="example@"
          aria-invalid
          aria-describedby="foundation-error"
        />
        <FieldError id="foundation-error">
          请输入完整邮箱地址 / Enter a complete email address.
        </FieldError>
      </Field>
      <Field aria-busy="true">
        <FieldLabel htmlFor="foundation-pending">正在保存 / Saving</FieldLabel>
        <Input
          id="foundation-pending"
          value="文档与应用 / Documentation and application"
          disabled
        />
        <Button disabled aria-busy="true" className="self-start">
          <SpinnerIcon
            aria-hidden="true"
            data-icon="inline-start"
            className="motion-safe:animate-spin"
          />
          保存中 / Saving
        </Button>
      </Field>
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>保存失败 / Unable to save</AlertTitle>
        <AlertDescription>
          输入内容已保留，请重试。 / Your input is preserved. Try again.
        </AlertDescription>
      </Alert>
    </FieldGroup>
  ),
};

type Choice = { value: string; label: string; disabled?: boolean };
const choiceGroups = [
  {
    label: "语言 / Languages",
    items: [
      { value: "zh", label: "简体中文" },
      { value: "en", label: "English" },
      { value: "unavailable", label: "未配置 / Not configured", disabled: true },
    ],
  },
  { label: "设备 / Device", items: [{ value: "auto", label: "跟随设备 / Follow device" }] },
];

function GroupedSearchExample() {
  const [value, setValue] = useState<Choice | null>(choiceGroups[0]!.items[0]!);
  return (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="foundation-language">语言 / Language</FieldLabel>
      <Combobox<Choice>
        items={choiceGroups}
        value={value}
        onValueChange={setValue}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxTrigger id="foundation-language" className="w-full">
          <span className="min-w-0 truncate">
            <ComboboxValue />
          </span>
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput aria-label="搜索语言 / Find language" placeholder="搜索 / Search" />
          <ComboboxEmpty>没有匹配项 / No matches</ComboboxEmpty>
          <ComboboxList>
            {(group: (typeof choiceGroups)[number]) => (
              <ComboboxGroup key={group.label} items={group.items}>
                <ComboboxLabel>{group.label}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: Choice) => (
                    <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

export const GroupedSearch: Story = { render: () => <GroupedSearchExample /> };

function MultilineGroupExample() {
  const [value, setValue] = useState(
    "这段文本属于界面样例。\nA controlled multiline input keeps its native keyboard and selection behavior.",
  );
  return (
    <Field className="max-w-2xl">
      <FieldLabel htmlFor="foundation-notes">说明 / Notes</FieldLabel>
      <InputGroup>
        <InputGroupTextarea
          id="foundation-notes"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <InputGroupAddon align="block-end">
          <Badge variant="secondary">{value.length} 字 / chars</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={!value} onClick={() => setValue("")}>
              清除 / Clear
            </Button>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

export const MultilineGroup: Story = { render: () => <MultilineGroupExample /> };

export const DataDensity: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">项目 / Projects</h2>
        <Button variant="outline" size="sm">
          <SearchIcon aria-hidden="true" data-icon="inline-start" />
          筛选 / Filter
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称 / Name</TableHead>
            <TableHead>状态 / Status</TableHead>
            <TableHead className="text-right">记录 / Records</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>界面样例 / UI sample</TableCell>
            <TableCell>
              <Badge variant="secondary">就绪 / Ready</Badge>
            </TableCell>
            <TableCell className="text-right">1,024</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>较长的中文项目名称与 English project name</TableCell>
            <TableCell>
              <Badge variant="outline">离线 / Offline</Badge>
            </TableCell>
            <TableCell className="text-right">128</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Skeleton className="h-4 w-40" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="ml-auto h-4 w-8" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
};
