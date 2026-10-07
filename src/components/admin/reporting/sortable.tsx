import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection } from "./useSort";

export function SortableHead<T>({
  label,
  column,
  sortKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: keyof T;
  sortKey: keyof T | null;
  direction: SortDirection;
  onSort: (column: keyof T) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === column;
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none whitespace-nowrap hover:text-foreground",
        align === "right" && "text-right",
      )}
      onClick={() => onSort(column)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-xs">
        {active ? (direction === "asc" ? "▲" : "▼") : ""}
      </span>
    </TableHead>
  );
}
