import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

/**
 * Generic client-side table sort - every reporting table here is small
 * (dozens to a few hundred rows, already capped server-side), so there's no
 * need for server-side sorting/pagination. `key` is nullable so a table can
 * start unsorted (server order - most recent first for posts, GROUP BY
 * order for the aggregate tables).
 */
export function useSort<T>(rows: T[], initialKey: keyof T | null = null) {
  const [sortKey, setSortKey] = useState<keyof T | null>(initialKey);
  const [direction, setDirection] = useState<SortDirection>("asc");

  function requestSort(key: keyof T) {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numbers default to descending first click (biggest first is almost
      // always what "sort by likes" means); strings/dates default ascending.
      setDirection(typeof rows[0]?.[key] === "number" ? "desc" : "asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const sign = direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last regardless of direction
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [rows, sortKey, direction]);

  return { sorted, sortKey, direction, requestSort };
}
