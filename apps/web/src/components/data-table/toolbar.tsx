import { Button, Input } from "@raypx/ui/components";
import { Search, X } from "lucide-react";
import { DataTableFacetedFilter } from "./faceted-filter";

interface FilterOption {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface DataTableToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
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
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Filter...",
  filters = [],
  onReset,
  actions,
}: DataTableToolbarProps) {
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
          <DataTableFacetedFilter
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
