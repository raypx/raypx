import type { ComponentProps } from "react";
import { cn } from "./lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

interface SelectOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

type SelectFieldProps<Value extends string> = Pick<
  ComponentProps<typeof Select<Value>>,
  "value" | "defaultValue" | "name" | "required" | "disabled"
> &
  Pick<
    ComponentProps<typeof SelectTrigger>,
    "id" | "aria-label" | "aria-describedby" | "aria-invalid" | "className"
  > & {
    options: readonly SelectOption<Value>[];
    placeholder?: string;
    onValueChange?: (value: Value) => void;
  };

/** A single-value shadcn Select with labels available before its popup mounts. */
export function SelectField<Value extends string>({
  id,
  className,
  options,
  placeholder,
  onValueChange,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectFieldProps<Value>) {
  return (
    <Select
      {...props}
      items={options}
      onValueChange={(value) => {
        if (value !== null) onValueChange?.(value);
      }}
    >
      <SelectTrigger
        id={id}
        className={cn("w-full min-w-0", className)}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map(({ value, label, disabled }) => (
            <SelectItem key={value} value={value} disabled={disabled} data-value={value}>
              <span className="min-w-0 whitespace-normal wrap-anywhere">{label}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
