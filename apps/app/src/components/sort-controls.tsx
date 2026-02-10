import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components";

interface SortOption {
  value: string;
  label: string;
}

interface SortControlsProps {
  sortBy: string;
  sortOrder: "asc" | "desc";
  sortOptions: SortOption[];
  onSortByChange: (value: string) => void;
  onSortOrderChange: (value: "asc" | "desc") => void;
  sortByWidth?: string;
  sortOrderWidth?: string;
}

export function SortControls({
  sortBy,
  sortOrder,
  sortOptions,
  onSortByChange,
  onSortOrderChange,
  sortByWidth = "w-40",
  sortOrderWidth = "w-32",
}: SortControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={onSortByChange} value={sortBy}>
        <SelectTrigger className={sortByWidth}>
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={onSortOrderChange} value={sortOrder}>
        <SelectTrigger className={sortOrderWidth}>
          <SelectValue placeholder="Order" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="desc">Descending</SelectItem>
          <SelectItem value="asc">Ascending</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
