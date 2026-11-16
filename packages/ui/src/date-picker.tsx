"use client";

import { useState } from "react";
import { enUS, zhCN } from "react-day-picker/locale";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { Button, type ButtonProps } from "./components/ui/button.js";
import { Calendar } from "./components/ui/calendar.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
import { cn } from "./lib/utils.js";

type PickerProps = Pick<
  ButtonProps,
  | "id"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-invalid"
  | "className"
  | "disabled"
  | "size"
> & {
  /** App locale, passed explicitly so UI has no catalog/runtime dependency. */
  locale: string;
  placeholder: string;
  name?: string;
  /** Inclusive ISO calendar-date limits (YYYY-MM-DD), with no instant/time zone. */
  min?: string;
  max?: string;
};

/** Parse civil dates in local calendar space; never parse YYYY-MM-DD as a UTC instant. */
function calendarDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return isoDate(date) === value ? date : undefined;
}
function isoDate(date: Date | undefined): string {
  if (!date) return "";
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function displayDate(value: string, locale: string): string {
  const date = calendarDate(value);
  return date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date) : "";
}
function calendarProps(locale: string, min: string | undefined, max: string | undefined) {
  const before = calendarDate(min);
  const after = calendarDate(max);
  return {
    locale: locale.startsWith("zh") ? zhCN : enUS,
    disabled: [...(before ? [{ before }] : []), ...(after ? [{ after }] : [])],
    ...(before ? { startMonth: before } : {}),
    ...(after ? { endMonth: after } : {}),
  };
}

export interface DatePickerProps extends PickerProps {
  value: string;
  onValueChange: (value: string) => void;
}

/** shadcn Calendar + Base UI Popover/Button. The boundary value is an ISO civil date. */
export function DatePicker({
  value,
  onValueChange,
  locale,
  placeholder,
  min,
  max,
  name,
  ...trigger
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = calendarDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            {...trigger}
            variant="outline"
            className={cn(
              "w-full min-w-0 justify-between text-left font-normal focus-visible:not-aria-invalid:border-ring focus-visible:focus-entry",
              !selected && "text-muted-foreground",
              trigger.className,
            )}
          />
        }
      >
        <span className="truncate">{displayDate(value, locale) || placeholder}</span>
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value} disabled={trigger.disabled} />}
      <PopoverContent
        align="start"
        className="w-auto p-0"
        aria-label={trigger["aria-label"] || placeholder}
      >
        <Calendar
          {...calendarProps(locale, min, max)}
          mode="single"
          selected={selected}
          {...(selected ? { defaultMonth: selected } : {})}
          autoFocus
          onSelect={(date) => {
            onValueChange(isoDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateRangeValue {
  from: string;
  to: string;
}
export interface DateRangePickerProps extends PickerProps {
  value: DateRangeValue;
  onValueChange: (value: DateRangeValue) => void;
}

/** Inclusive civil-date endpoints. A first click starts a range; a second completes it. */
export function DateRangePicker({
  value,
  onValueChange,
  locale,
  placeholder,
  min,
  max,
  name,
  ...trigger
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const from = calendarDate(value.from);
  const to = calendarDate(value.to);
  const selected = from ? { from, to } : undefined;
  const label = [displayDate(value.from, locale), displayDate(value.to, locale)]
    .filter(Boolean)
    .join(" – ");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            {...trigger}
            variant="outline"
            className={cn(
              "w-full min-w-0 justify-between text-left font-normal focus-visible:not-aria-invalid:border-ring focus-visible:focus-entry",
              !from && "text-muted-foreground",
              trigger.className,
            )}
          />
        }
      >
        <span className="truncate">{label || placeholder}</span>
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </PopoverTrigger>
      {name && (
        <>
          <input
            type="hidden"
            name={`${name}.from`}
            value={value.from}
            disabled={trigger.disabled}
          />
          <input type="hidden" name={`${name}.to`} value={value.to} disabled={trigger.disabled} />
        </>
      )}
      <PopoverContent
        align="start"
        className="w-auto p-0"
        aria-label={trigger["aria-label"] || placeholder}
      >
        <Calendar
          {...calendarProps(locale, min, max)}
          mode="range"
          selected={selected}
          {...(from ? { defaultMonth: from } : {})}
          resetOnSelect
          required
          autoFocus
          onSelect={(range) => {
            onValueChange({ from: isoDate(range.from), to: isoDate(range.to) });
            if (range.to) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
