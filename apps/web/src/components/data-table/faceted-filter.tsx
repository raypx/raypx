import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import { Check, PlusCircle, X } from "lucide-react";
import type * as React from "react";

interface DataTableFacetedFilterProps {
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  selectedValues?: string[];
  onSelectedValuesChange?: (values: string[]) => void;
  counts?: Map<string, number>;
}

export function DataTableFacetedFilter({
  title,
  options,
  selectedValues = [],
  onSelectedValuesChange,
  counts,
}: DataTableFacetedFilterProps) {
  const selectedSet = new Set(selectedValues);

  const handleSelect = (value: string) => {
    const newSelected = new Set(selectedSet);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    onSelectedValuesChange?.(Array.from(newSelected));
  };

  const handleClear = () => {
    onSelectedValuesChange?.([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-8 border-dashed" size="sm" variant="outline">
          <PlusCircle className="h-4 w-4" />
          {title}
          {selectedSet.size > 0 && (
            <>
              <Separator className="mx-2 h-4" orientation="vertical" />
              <Badge className="rounded-sm px-1 font-normal lg:hidden" variant="secondary">
                {selectedSet.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedSet.size > 2 ? (
                  <Badge className="rounded-sm px-1 font-normal" variant="secondary">
                    {selectedSet.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedSet.has(option.value))
                    .map((option) => (
                      <Badge
                        className="rounded-sm px-1 font-normal"
                        key={option.value}
                        variant="secondary"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <CommandItem key={option.value} onSelect={() => handleSelect(option.value)}>
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input [&_svg]:invisible",
                      )}
                    >
                      <Check className="text-primary-foreground size-3.5" />
                    </div>
                    {option.icon && <option.icon className="text-muted-foreground size-4" />}
                    <span>{option.label}</span>
                    {counts?.get(option.value) !== undefined && (
                      <span className="text-muted-foreground ml-auto flex size-4 items-center justify-center font-mono text-xs">
                        {counts.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedSet.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem className="justify-center text-center" onSelect={handleClear}>
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
