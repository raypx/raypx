import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import { IconArrowDown, IconArrowsUpDown, IconArrowUp, IconEyeOff } from "@tabler/icons-react";
import type { Column } from "@tanstack/react-table";

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="data-[state=open]:bg-accent -ml-3 h-8" size="sm" variant="ghost">
              <span>{title}</span>
              {column.getIsSorted() === "desc" ? (
                <IconArrowDown className="h-4 w-4" />
              ) : column.getIsSorted() === "asc" ? (
                <IconArrowUp className="h-4 w-4" />
              ) : (
                <IconArrowsUpDown className="h-4 w-4" />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <IconArrowUp className="mr-2 h-4 w-4" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <IconArrowDown className="mr-2 h-4 w-4" />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <IconEyeOff className="mr-2 h-4 w-4" />
            Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
