import { Button, Input } from "@raypx/ui/components";
import { Search, X } from "lucide-react";
import { FacetedFilter } from "./faceted-filter";
import type { SearchProps } from "./types";

interface FilterOption {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface DataTableToolbarProps {
  search?: SearchProps;
  filters?: Array<{
    title: string;
    options: FilterOption[];
    selectedValues?: string[];
    onSelectedValuesChange?: (values: string[]) => void;
    counts?: Map<string, number>;
  }>;
  onReset?: () => void;
  actions?: React.ReactNode;
}

export function DataTableToolbar({
  search,
  filters = [],
  onReset,
  actions,
}: DataTableToolbarProps) {
  const {
    value: searchValue = "",
    onChange: onSearchChange,
    placeholder: searchPlaceholder = "Filter...",
  } = search || {};

  const hasActiveFilters =
    searchValue ||
    filters.some((filter) => filter.selectedValues && filter.selectedValues.length > 0);

  return (
    <div className="flex items-center justify-between px-6">
      <div className="flex flex-1 items-center gap-2">
        {onSearchChange && (
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-[150px] pl-8 lg:w-[250px]"
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              value={searchValue}
            />
          </div>
        )}
        {filters.map((filter, index) => (
          <FacetedFilter
            counts={filter.counts}
            key={index}
            onSelectedValuesChange={filter.onSelectedValuesChange}
            options={filter.options}
            selectedValues={filter.selectedValues}
            title={filter.title}
          />
        ))}
        {hasActiveFilters && onReset && (
          <Button className="h-8" onClick={onReset} size="sm" variant="ghost">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
